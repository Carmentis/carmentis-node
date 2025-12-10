import { LevelDb } from './LevelDb';
import { DbInterface, LevelQueryIteratorOptions, LevelQueryResponseType } from './DbInterface';
import { DataFileObject } from '../types/DataFileObject';
import { NODE_SCHEMAS } from '../constants/constants';
import { MicroblockStorageObject } from '../types/MicroblockStorageObject';
import {
    CHAIN,
    Microblock,
    MicroblockInformationSchema,
    Utils,
} from '@cmts-dev/carmentis-sdk/server';
import { ChainInformationObject } from '../types/ChainInformationObject';
import { getLogger } from '@logtape/logtape';

export class CachedLevelDb implements DbInterface {
    private db: LevelDb;
    private readonly updateCache: Map<string, Uint8Array>[];
    private readonly deletionCache: Set<string>[];
    private logger = getLogger(["node", "db", CachedLevelDb.name]);

    constructor(db: LevelDb) {
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
        this.logger.debug("Committing")
        const batch = this.db.getBatch();
        const nTable = this.db.getTableCount();

        for (let tableId = 0; tableId < nTable; tableId++) {
            const putList = [];
            for (const [keyStr, value] of this.updateCache[tableId]) {
                putList.push([CachedLevelDb.decodeKey(keyStr), value]);
            }
            batch.put(tableId, putList);

            const delList = [];
            for (const keyStr of this.deletionCache[tableId]) {
                delList.push(CachedLevelDb.decodeKey(keyStr));
            }
            batch.del(tableId, delList);
        }

        await batch.write();
        this.resetCache();
    }

    async getRaw(tableId: number, key: Uint8Array) {
        const keyStr = CachedLevelDb.encodeKey(key);

        if (this.updateCache[tableId].has(keyStr)) {
            return this.updateCache[tableId].get(keyStr);
        }
        return await this.db.getRaw(tableId, key);
    }

    async getObject(tableId: number, key: Uint8Array) {
        const data = await this.getRaw(tableId, key);

        if (data === undefined) {
            return undefined;
        }
        return this.db.unserialize(tableId, data);
    }

    async putRaw(tableId: number, key: Uint8Array, data: Uint8Array) {
        this.logger.debug(`Storing raw data with key ${Utils.binaryToHexa(key)} on table ${tableId} in buffer: ${data.length} bytes`)
        const keyStr = CachedLevelDb.encodeKey(key);

        this.deletionCache[tableId].delete(keyStr);
        this.updateCache[tableId].set(keyStr, data);
        return true;
    }

    async putObject(tableId: number, key: Uint8Array, object: any) {
        this.logger.debug(`Storing object -${Utils.binaryToHexa(key)} on table ${tableId} in buffer`)
        const data = this.db.serialize(tableId, object);
        return await this.putRaw(tableId, key, data);
    }

    async getKeys(tableId: number): Promise<Uint8Array[]> {
        // we recover the keys from the cache
        const cachedEncodedKeys = Array.from(this.updateCache[tableId].keys());
        const cachedKeys = cachedEncodedKeys.map((key) => CachedLevelDb.decodeKey(key));

        // we recover the keys from the committed data
        const committedKeys = await this.db.getKeys(tableId);
        return [...committedKeys, ...cachedKeys];
    }

    query(
        _tableId: number,
        query?: LevelQueryIteratorOptions,
    ): Promise<LevelQueryResponseType> {
        // TODO: if this method is needed, it should use the cache
        throw new Error(`query() is not implemented on CachedLevelDb`);
    }

    async getFullTable(tableId: number) {
        const committedData = await this.db.getFullTable(tableId);

        if (committedData === null) {
            return null;
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

    serialize(tableId: number, object: object) {
        return this.db.serialize(tableId, object);
    }

    unserialize(tableId: number, data: Uint8Array): object {
        return this.db.unserialize(tableId, data);
    }

    static encodeKey(key: Uint8Array) {
        return Buffer.from(key).toString('hex');
    }

    static decodeKey(str: string) {
        return new Uint8Array(Buffer.from(str, 'hex'));
    }

    async putMicroblockStorage(microblockHeaderHash, microblockStorage: MicroblockStorageObject) {
        return await this.putObject(
            NODE_SCHEMAS.DB_MICROBLOCK_STORAGE,
            microblockHeaderHash,
            microblockStorage,
        );
    }

    async getMicroblockStorage(microblockHeaderHash: Uint8Array): Promise<MicroblockStorageObject> {
        return (await this.getObject(
            NODE_SCHEMAS.DB_MICROBLOCK_STORAGE,
            microblockHeaderHash,
        )) as MicroblockStorageObject;
    }

    async getDataFileFromDataFileKey(dbFileKey: Uint8Array<ArrayBuffer>): Promise<DataFileObject> {
        return (await this.getObject(NODE_SCHEMAS.DB_DATA_FILE, dbFileKey)) as DataFileObject;
    }

    async putDataFile(dataFileKey: Uint8Array, dataFileObject: DataFileObject) {
        return await this.putObject(NODE_SCHEMAS.DB_DATA_FILE, dataFileKey, dataFileObject);
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
            this.logger.error(`No protocol virtual blockchain identifier found in table ${protocolTableId}`)
            throw new Error(`No protocol virtual blockchain identifier found in table ${protocolTableId}`);
        }

        // we expect no more than one identifier
        if (foundIdentifiersNumber > 1) {
            this.logger.error(`More than one protocol virtual blockchain identifier found in table ${protocolTableId}: ${protocolVirtualBlockchainIdentifiers}`)
            throw new Error(`More than one protocol virtual blockchain identifier found in table ${protocolTableId}: ${protocolVirtualBlockchainIdentifiers}`);
        }
        return protocolVirtualBlockchainIdentifiers[0];
    }

    async getProtocolVariables() {
        const protocolTableId = LevelDb.getTableIdFromVirtualBlockchainType(CHAIN.VB_PROTOCOL);
        const protocolVirtualBlockchainIdentifier = await this.getProtocolVirtualBlockchainIdentifier();
        return await this.getObject(protocolTableId, protocolVirtualBlockchainIdentifier);
    }

    async getChainInformationObject() {
        this.logger.debug("Getting chain information");
        const result = await this.getObject(
            NODE_SCHEMAS.DB_CHAIN_INFORMATION,
            NODE_SCHEMAS.DB_CHAIN_INFORMATION_KEY,
        ) as ChainInformationObject;
        if (result !== undefined) return result;
        return {
            microblockCount: 0,
            objectCounts: Array(CHAIN.N_VIRTUAL_BLOCKCHAINS).fill(0),
        } as ChainInformationObject;
    }

    async putChainInformationObject(chainInfoObject: ChainInformationObject) {
        this.logger.debug(`Setting chain information at height ${chainInfoObject.height}: ${chainInfoObject.microblockCount} microblocks, ${chainInfoObject.objectCounts} object created`)
        await this.putObject(
            NODE_SCHEMAS.DB_CHAIN_INFORMATION,
            NODE_SCHEMAS.DB_CHAIN_INFORMATION_KEY,
            chainInfoObject,
        );
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



    getSerializedMicroblockInformation(microblockHash: Uint8Array) {
        return this.getRaw(NODE_SCHEMAS.DB_MICROBLOCK_VB_INFORMATION, microblockHash);
    }


    async setMicroblockInformation(microblock: Microblock, info: MicroblockInformationSchema) {
        this.logger.debug(`Setting microblock information for microblock ${microblock.getHash().encode()}`);
        const hash = microblock.getHashAsBytes();
        await this.putObject(
            NODE_SCHEMAS.DB_MICROBLOCK_VB_INFORMATION,
            hash,
            info
        );
    }

    async getMicroblockInformation(microblockHash: Uint8Array) {
        this.logger.debug(`Getting information for microblock ${Utils.binaryToHexa(microblockHash)}`);
        const microblockInformation = await this.getObject(
            NODE_SCHEMAS.DB_MICROBLOCK_VB_INFORMATION,
            microblockHash,
        );
        return microblockInformation as MicroblockInformationSchema;
    }
}
