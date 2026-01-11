import { LevelDb } from './LevelDb';
import { LevelQueryIteratorOptions, LevelQueryResponseType } from './DbInterface';
import { NODE_SCHEMAS } from '../constants/constants';
import { CHAIN, Utils } from '@cmts-dev/carmentis-sdk/server';
import { getLogger } from '@logtape/logtape';
import { AbstractLevelDb } from './AbstractLevelDb';
import { LevelDbTable } from './LevelDbTable';
import { Level } from 'level';
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
        for (const [tableName, tableId] of Object.entries(LevelDbTable)) {
            this.logger.debug(`Clearing cache table ${tableName} (id ${tableId})`);
            this.cachedUpdatedByTableId.set(tableId, new Map());
            this.cachedDeletedEntriesByTableId.set(tableId, new Set());
        }
    }

    async commit() {
        this.logger.debug('Committing');
        const batch = this.db.getBatch();

        for (const [tableName, tableId] of Object.entries(LevelDbTable)) {
            const putList: [Uint8Array, Uint8Array][] = [];
            const tableUpdates = this.cachedUpdatedByTableId.get(tableId);
            if (tableUpdates) {
                for (const [keyStr, value] of tableUpdates) {
                    const decodedKey = CachedLevelDb.decodeKey(keyStr);
                    putList.push([decodedKey, value]);
                }
                batch.put(tableId, putList);
            } else {
                // TODO: handle this case
            }

            const delList: Uint8Array[] = [];
            const tableDeletions = this.cachedDeletedEntriesByTableId.get(tableId);
            if (tableDeletions) {
                for (const keyStr of tableDeletions) {
                    const decodedKey = CachedLevelDb.decodeKey(keyStr);
                    delList.push(decodedKey);
                }
                batch.del(tableId, delList);
            } else {
                // TODO: handle this case
            }
        }

        await batch.write();
        this.resetCache();
    }

    async getRaw(tableId: number, key: Uint8Array): Promise<Uint8Array | undefined> {
        // we first ensure that the table exists
        const tableUpdates = this.cachedUpdatedByTableId.get(tableId);
        if (tableUpdates === undefined) {
            this.logger.warn(`Attempting to access an undefined table ${tableId}: returning undefined`)
            return undefined;
        }

        // we search in the cached table
        const keyStr = CachedLevelDb.encodeKey(key);
        const entry = tableUpdates.get(keyStr);
        if (entry) {
            return entry
        }

        // search on db
        return await this.db.getRaw(tableId, key);
    }

    async putRaw(tableId: number, key: Uint8Array, data: Uint8Array) {
        this.logger.debug(
            `Storing raw data with key ${Utils.binaryToHexa(key)} on table ${tableId} in buffer: ${data.length} bytes`,
        );

        // load the updates and deletions
        const cachedInsertions = this.cachedUpdatedByTableId.get(tableId);
        const cachedDeletions = this.cachedDeletedEntriesByTableId.get(tableId);
        if (cachedDeletions === undefined || cachedInsertions === undefined) {
            this.logger.warn("Attempting to store a new entry on an undefined table: aborting")
            return false;
        }

        // add in the insertions and remove from deletions
        const keyStr = CachedLevelDb.encodeKey(key);
        cachedDeletions.delete(keyStr);
        cachedInsertions.set(keyStr, data);
        return true;
    }

    async getKeys(tableId: number): Promise<Uint8Array[]> {
        // load the table
        const insertions = this.cachedUpdatedByTableId.get(tableId)
        if (insertions === undefined) {
            this.logger.debug(`Attempting to load all keys of an undefined table ${tableId}: aborting`)
            return []
        }

        // we recover the keys from the cache
        const cachedEncodedKeys = Array.from(insertions.keys());
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
            this.logger.warn('No committed data found for table ' + tableId + ' in cache');
            throw new Error('No cached');
        }

        const insertions = this.cachedUpdatedByTableId.get(tableId);
        if (insertions === undefined) {
            this.logger.debug(
                `Attempting to load all keys of an undefined table ${tableId}: aborting`,
            );
            return [];
        }

        const cachedData = [...insertions.entries()].map(([key, value]) => {
            return [CachedLevelDb.decodeKey(key), value];
        });

        return [...cachedData, ...committedData];
    }

    async del(tableId: number, key: Uint8Array) {
        // load the updates and deletions
        const cachedInsertions = this.cachedUpdatedByTableId.get(tableId);
        const cachedDeletions = this.cachedDeletedEntriesByTableId.get(tableId);
        if (cachedDeletions === undefined || cachedInsertions === undefined) {
            this.logger.warn('Attempting to delete an entry on an undefined table: aborting');
            return false;
        }

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
        this.logger.debug("Accessing all entries of data file table")
        const encodedDataFileEntries = await this.getFullTable(LevelDbTable.DATA_FILE);
        const dataFileEntries = encodedDataFileEntries.map(
            ([dataFileKey, encodedDataFile]) => {
                const dataFile = NodeEncoder.decodeDataFile(encodedDataFile);
                return {dataFileKey, dataFile}
            }
        )
        return dataFileEntries
    }


}
