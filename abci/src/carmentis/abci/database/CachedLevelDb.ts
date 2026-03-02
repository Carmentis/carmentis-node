import { LevelDb } from './LevelDb';
import { LevelQueryIteratorOptions, LevelQueryResponseType } from './DbInterface';
import { Utils } from '@cmts-dev/carmentis-sdk/server';
import { getLogger } from '@logtape/logtape';
import { AbstractLevelDb } from './AbstractLevelDb';
import { LevelDbTable } from './LevelDbTable';
import { NodeEncoder } from '../NodeEncoder';

export class CachedLevelDb extends AbstractLevelDb {
    private db: LevelDb;
    private readonly cachedUpdatedByTableId: Map<number, Map<string, Uint8Array>>;
    private readonly cachedDeletedEntriesByTableId: Map<number, Set<string>>;
    private static logger = getLogger(['node', 'db', CachedLevelDb.name]);

    constructor(db: LevelDb) {
        super(CachedLevelDb.logger);
        this.db = db;
        this.cachedUpdatedByTableId = new Map();
        this.cachedDeletedEntriesByTableId = new Map();

        // init the structure of the cache
        this.resetCache()
    }

    resetCache() {
        this.logger.debug(`Clearing cache tables`);
        for (const [tableName, tableId] of Object.entries(LevelDbTable)) {
            this.cachedUpdatedByTableId.set(tableId, new Map());
            this.cachedDeletedEntriesByTableId.set(tableId, new Set());
        }
    }

    async commit() {
        this.logger.debug('Committing');
        const batch = this.db.getBatch();

        for (const [tableName, tableId] of Object.entries(LevelDbTable)) {
            const { cachedInsertions, cachedDeletions } = this.getCachedDataByTableIdOrFail(tableId);

            const putList: [Uint8Array, Uint8Array][] = [];
            for (const [keyStr, value] of cachedInsertions) {
                const decodedKey = CachedLevelDb.decodeKey(keyStr);
                putList.push([decodedKey, value]);
            }
            batch.put(tableId, putList);

            const delList: Uint8Array[] = [];
            for (const keyStr of cachedDeletions) {
                const decodedKey = CachedLevelDb.decodeKey(keyStr);
                delList.push(decodedKey);
            }
            batch.del(tableId, delList);
        }

        await batch.write();
        this.resetCache();
    }

    async getRaw(tableId: number, key: Uint8Array): Promise<Uint8Array | undefined> {
        const { cachedInsertions } = this.getCachedDataByTableIdOrFail(tableId);

        // we search in the cached table
        const keyStr = CachedLevelDb.encodeKey(key);
        const entry = cachedInsertions.get(keyStr);
        if (entry) {
            return entry
        }

        // not found in cache: search on DB
        return await this.db.getRaw(tableId, key);
    }

    async putRaw(tableId: number, key: Uint8Array, data: Uint8Array) {
        this.logger.debug(
            `Storing raw data with key {key} on table {tableName} in buffer: length = {length} bytes, data extract = {data}`, () => ({
                key: Utils.binaryToHexa(key),
                tableName: CachedLevelDb.getTableName(tableId),
                length: data.length,
                data: Utils.binaryToHexa(data.slice(0, 128)),
            })
        );

        // load the updates and deletions
        const { cachedInsertions, cachedDeletions } = this.getCachedDataByTableIdOrFail(tableId);

        // add in the insertions and remove from deletions
        const keyStr = CachedLevelDb.encodeKey(key);
        cachedDeletions.delete(keyStr);
        cachedInsertions.set(keyStr, data);
        return true;
    }

    async getKeys(tableId: number): Promise<Uint8Array[]> {
        const { cachedInsertions, cachedDeletions } = this.getCachedDataByTableIdOrFail(tableId);

        // fetch new keys from the cache and decode them
        const cachedEncodedKeys = Array.from(cachedInsertions.keys());
        const cachedKeys = cachedEncodedKeys.map((key) => CachedLevelDb.decodeKey(key));

        // fetch committed keys
        const committedKeys = await this.db.getKeys(tableId);

        // remove from committed keys those that are either updated or deleted in the cache
        const unmodifiedCommittedKeys = [...committedKeys].filter((key) => {
            const encodedKey = CachedLevelDb.encodeKey(key);
            return !cachedInsertions.has(encodedKey) && !cachedDeletions.has(encodedKey);
        })
        return [...cachedKeys, ...unmodifiedCommittedKeys];
    }

    query(tableId: number, query?: LevelQueryIteratorOptions): Promise<LevelQueryResponseType> {
        // TODO: if this method is needed, it should use the cache
        throw new Error(`query() is not implemented on CachedLevelDb`);
    }

    async getFullTable(tableId: number): Promise<[Uint8Array,Uint8Array][]> {
        const { cachedInsertions, cachedDeletions } = this.getCachedDataByTableIdOrFail(tableId);

        // fetch cached data
        const cachedData: [Uint8Array,Uint8Array][] = [...cachedInsertions.entries()].map(([key, value]) => {
            return [CachedLevelDb.decodeKey(key), value];
        });

        // fetch committed data
        const committedData = await this.db.getFullTable(tableId);

        // remove from committed data all entries that are either updated or deleted in the cache
        const unmodifiedCommittedData = [...committedData].filter(([key]) => {
            const encodedKey = CachedLevelDb.encodeKey(key);
            return !cachedInsertions.has(encodedKey) && !cachedDeletions.has(encodedKey);
        })
        return [...cachedData, ...unmodifiedCommittedData];
    }

    async del(tableId: number, key: Uint8Array) {
        const { cachedInsertions, cachedDeletions } = this.getCachedDataByTableIdOrFail(tableId);
        const keyStr = CachedLevelDb.encodeKey(key);
        cachedInsertions.delete(keyStr);
        cachedDeletions.add(keyStr);
        return true;
    }

    static encodeKey(key: Uint8Array) {
        return Buffer.from(key).toString('hex');
    }

    static decodeKey(str: string) {
        return new Uint8Array(Buffer.from(str, 'hex'));
    }

    async getFullDataFileTable() {
        this.logger.debug("Fetching all entries of data file table")
        const encodedDataFileEntries = await this.getFullTable(LevelDbTable.DATA_FILE);
        const dataFileEntries = encodedDataFileEntries.map(
            ([dataFileKey, encodedDataFile]) => {
                const dataFile = NodeEncoder.decodeDataFile(encodedDataFile);
                return {dataFileKey, dataFile}
            }
        )
        return dataFileEntries
    }

    private getCachedDataByTableIdOrFail(tableId: number) {
        const cachedInsertions = this.cachedUpdatedByTableId.get(tableId);
        const cachedDeletions = this.cachedDeletedEntriesByTableId.get(tableId);
        if (cachedInsertions === undefined || cachedDeletions === undefined) {
            throw new Error(`attempt to access cached data on table ${tableId}, which doesn't exist`);
        }
        return { cachedInsertions, cachedDeletions };
    }
}
