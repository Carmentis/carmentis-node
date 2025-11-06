import { LevelDb } from './LevelDb';
import { DbInterface } from './DbInterface';

export class CachedLevelDb implements DbInterface {
    db: LevelDb;
    updateCache: any;
    deletionCache: any;

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
            return data;
        }
        return this.db.unserialize(tableId, data);
    }

    async putRaw(tableId: number, key: Uint8Array, data: Uint8Array) {
        const keyStr = CachedLevelDb.encodeKey(key);

        this.deletionCache[tableId].delete(keyStr);
        this.updateCache[tableId].set(keyStr, data);
        return true;
    }

    async putObject(tableId: number, key: Uint8Array, object: any) {
        const data = this.db.serialize(tableId, object);
        return await this.putRaw(tableId, key, data);
    }

    async getKeys(tableId: number): Promise<Uint8Array[]> {
        // TODO: if this method is needed, it should use the cache
        throw `getKeys() is not implemented on CachedLevelDb`;
    }

    async query(tableId: number, query?: any) {
        // TODO: if this method is needed, it should use the cache
        throw `query() is not implemented on CachedLevelDb`;
    }

    async getFullTable(tableId: number) {
        const committedData = await this.db.getFullTable(tableId);

        if(committedData === null) {
            return null;
        }

        const cachedData = [...this.updateCache[tableId].entries()].map(([ key, value ]) => {
            return [ CachedLevelDb.decodeKey(key), value ];
        });

        return [ ...cachedData, ...committedData ];
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

    unserialize(tableId: number, data: Uint8Array) {
        return this.db.unserialize(tableId, data);
    }

    static encodeKey(key: Uint8Array) {
        return Buffer.from(key).toString('hex');
    }

    static decodeKey(str: string) {
        return new Uint8Array(Buffer.from(str, 'hex'));
    }
}
