import { LevelDb } from './LevelDb';
import { LevelQueryIteratorOptions, LevelQueryResponseType } from './DbInterface';
import { NODE_SCHEMAS } from '../constants/constants';
import { CHAIN, Utils } from '@cmts-dev/carmentis-sdk/server';
import { getLogger } from '@logtape/logtape';
import { AbstractLevelDb } from './AbstractLevelDb';

export class CachedLevelDb extends AbstractLevelDb {
    private db: LevelDb;
    private readonly updateCache: Map<string, Uint8Array>[];
    private readonly deletionCache: Set<string>[];
    private logger = getLogger(['node', 'db', CachedLevelDb.name]);

    constructor(db: LevelDb) {
        super();
        this.db = db;
        this.updateCache = [];
        this.deletionCache = [];

        const nTable = this.db.getTableCount();

        for (let tableId = 0; tableId < nTable; tableId++) {
            this.updateCache[tableId] = new Map();
            this.deletionCache[tableId] = new Set();
        }
    }

    getTableCount() {
        return this.db.getTableCount();
    }

    resetCache() {
        const nTable = this.db.getTableCount();

        for (let tableId = 0; tableId < nTable; tableId++) {
            this.updateCache[tableId].clear();
            this.deletionCache[tableId].clear();
        }
    }

    async commit() {
        this.logger.debug('Committing');
        const batch = this.db.getBatch();
        const nTable = this.db.getTableCount();

        for (let tableId = 0; tableId < nTable; tableId++) {
            const putList: [Uint8Array, Uint8Array][] = [];
            for (const [keyStr, value] of this.updateCache[tableId]) {
                const decodedKey = CachedLevelDb.decodeKey(keyStr);
                putList.push([decodedKey, value]);
            }
            batch.put(tableId, putList);

            const delList: Uint8Array[] = [];
            for (const keyStr of this.deletionCache[tableId]) {
                const decodedKey = CachedLevelDb.decodeKey(keyStr);
                delList.push(decodedKey);
            }
            batch.del(tableId, delList);
        }

        await batch.write();
        this.resetCache();
    }

    async getRaw(tableId: number, key: Uint8Array): Promise<Uint8Array | undefined> {
        const keyStr = CachedLevelDb.encodeKey(key);

        if (this.updateCache[tableId].has(keyStr)) {
            return this.updateCache[tableId].get(keyStr);
        }
        return await this.db.getRaw(tableId, key);
    }

    async putRaw(tableId: number, key: Uint8Array, data: Uint8Array) {
        this.logger.debug(
            `Storing raw data with key ${Utils.binaryToHexa(key)} on table ${tableId} in buffer: ${data.length} bytes`,
        );
        const keyStr = CachedLevelDb.encodeKey(key);

        this.deletionCache[tableId].delete(keyStr);
        this.updateCache[tableId].set(keyStr, data);
        return true;
    }

    async getKeys(tableId: number): Promise<Uint8Array[]> {
        // we recover the keys from the cache
        const cachedEncodedKeys = Array.from(this.updateCache[tableId].keys());
        const cachedKeys = cachedEncodedKeys.map((key) => CachedLevelDb.decodeKey(key));

        // we recover the keys from the committed data
        const committedKeys = await this.db.getKeys(tableId);
        return [...committedKeys, ...cachedKeys];
    }

    query(_tableId: number, query?: LevelQueryIteratorOptions): Promise<LevelQueryResponseType> {
        // TODO: if this method is needed, it should use the cache
        throw new Error(`query() is not implemented on CachedLevelDb`);
    }

    async getFullTable(tableId: number): Promise<Uint8Array[][]> {
        const committedData = await this.db.getFullTable(tableId);
        if (committedData === null) {
            this.logger.warn("No committed data found for table " + tableId + " in cache")
            throw new Error('No cached')
        }

        const cachedData = [...this.updateCache[tableId].entries()].map(([key, value]) => {
            return [CachedLevelDb.decodeKey(key), value];
        });

        return [...cachedData, ...committedData];
    }

    async del(tableId: number, key: Uint8Array) {
        const keyStr = CachedLevelDb.encodeKey(key);

        this.updateCache[tableId].delete(keyStr);
        this.deletionCache[tableId].add(keyStr);
        return true;
    }

    static encodeKey(key: Uint8Array) {
        return Buffer.from(key).toString('hex');
    }

    static decodeKey(str: string) {
        return new Uint8Array(Buffer.from(str, 'hex'));
    }

    async getFullDataFileTable() {
        return await this.getFullTable(NODE_SCHEMAS.DB_DATA_FILE);
    }

    async getProtocolVirtualBlockchainIdentifier() {
        const protocolTableId = LevelDb.getTableIdFromVirtualBlockchainType(CHAIN.VB_PROTOCOL);
        const protocolVirtualBlockchainIdentifiers = await this.getKeys(protocolTableId);
        const foundIdentifiersNumber = protocolVirtualBlockchainIdentifiers.length;
        // we expect at least one identifier
        if (foundIdentifiersNumber === 0) {
            this.logger.error(
                `No protocol virtual blockchain identifier found in table ${protocolTableId}`,
            );
            throw new Error(
                `No protocol virtual blockchain identifier found in table ${protocolTableId}`,
            );
        }

        // we expect no more than one identifier
        if (foundIdentifiersNumber > 1) {
            this.logger.error(
                `More than one protocol virtual blockchain identifier found in table ${protocolTableId}: ${protocolVirtualBlockchainIdentifiers}`,
            );
            throw new Error(
                `More than one protocol virtual blockchain identifier found in table ${protocolTableId}: ${protocolVirtualBlockchainIdentifiers}`,
            );
        }
        return protocolVirtualBlockchainIdentifiers[0];
    }

    async getSerializedVirtualBlockchainState(vbIdentifier: Uint8Array) {
        return this.getRaw(NODE_SCHEMAS.DB_VIRTUAL_BLOCKCHAIN_STATE, vbIdentifier);
    }

    async setSerializedVirtualBlockchainState(identifier: Uint8Array, serializedState: Uint8Array) {
        this.logger.debug(`Setting vb state for {identifier}: {dataLength}`, () => ({
            identifier: Utils.binaryToHexa(identifier),
            dataLength: serializedState.length,
        }));
        await this.putRaw(NODE_SCHEMAS.DB_VIRTUAL_BLOCKCHAIN_STATE, identifier, serializedState);
    }
}
