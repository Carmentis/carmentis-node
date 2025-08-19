import { LevelDb } from './levelDb';
import { Utils } from '@cmts-dev/carmentis-sdk/server';
import { dbInterface } from './dbInterface';

export class CachedLevelDb implements dbInterface {
    db: LevelDb;
    updateCache: any;
    deletionCache: any;

    constructor(db: LevelDb) {
        this.db = db;
        this.resetCache();
    }

    getTableCount() {
        return this.db.getTableCount();
    }

    resetCache() {
        this.updateCache = [];
        this.deletionCache = [];

        const nTable = this.db.getTableCount();

        for (let tableId = 0; tableId < nTable; tableId++) {
            this.updateCache[tableId] = new Map();
            this.deletionCache[tableId] = new Set();
        }
    }

    async commit() {
        const batch = this.db.getBatch();
        const nTable = this.db.getTableCount();

        for (let tableId = 0; tableId < nTable; tableId++) {
            const putList = [];
            for (const [keyStr, value] of this.updateCache[tableId]) {
                putList.push([Utils.binaryFromHexa(keyStr), value]);
            }
            batch.put(tableId, putList);

            const delList = [];
            for (const keyStr of this.deletionCache[tableId]) {
                delList.push(Utils.binaryFromHexa(keyStr));
            }
            batch.del(tableId, delList);
        }

        await batch.write();
        this.resetCache();
    }

    async getRaw(tableId: number, key: Uint8Array) {
        const keyStr = Utils.binaryToHexa(key);

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
        const keyStr = Utils.binaryToHexa(key);

        this.deletionCache[tableId].delete(keyStr);
        this.updateCache[tableId].set(keyStr, data);
        return true;
    }

    async putObject(tableId: number, key: Uint8Array, object: any) {
        const data = this.db.serialize(tableId, object);
        return await this.putRaw(tableId, key, data);
    }

    async getKeys(tableId: number) {
        // TODO: should also use the cache
        return this.db.getKeys(tableId);
    }

    async query(tableId: number, query?: any) {
        // TODO: should also use the cache
        return this.db.query(tableId, query);
    }

    async del(tableId: number, key: Uint8Array) {
        const keyStr = Utils.binaryToHexa(key);

        this.updateCache[tableId].delete(keyStr);
        this.deletionCache[tableId].add(keyStr);
        return true;
    }

    serialize(tableId: number, object: any) {
        return this.db.serialize(tableId, object);
    }

    unserialize(tableId: number, data: Uint8Array) {
        return this.db.unserialize(tableId, data);
    }
}
