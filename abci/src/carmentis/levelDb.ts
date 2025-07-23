import { Level } from 'level';
import { NODE_SCHEMAS } from './constants/constants';
import { SchemaSerializer, SchemaUnserializer, Utils } from '@cmts-dev/carmentis-sdk/server';

const SUB_PREFIX = 'SUB';

export class LevelDb {
    db: any;
    path: string;
    sub: any;
    tableSchemas: any;

    constructor(path: string, tableSchemas: any) {
        this.path = path;
        this.tableSchemas = tableSchemas;
    }

    async initialize() {
        const encoding = {
            keyEncoding: 'view',
            valueEncoding: 'view',
        };

        this.db = new Level(this.path, encoding);
        this.sub = [];

        const nTables = this.getTableCount();

        for (let n = 0; n < nTables; n++) {
            this.sub[n] = this.db.sublevel(SUB_PREFIX + n.toString().padStart(2, '0'), encoding);
        }
    }

    getTableCount() {
        return Object.keys(this.tableSchemas).length;
    }

    async open() {
        await this.db.open();
    }

    async close() {
        await this.db.close();
    }

    async clear() {
        await this.db.clear();
    }

    async getRaw(tableId: number, key: Uint8Array) {
        try {
            const b = await this.sub[tableId].get(key);

            if (b === undefined) {
                return b;
            }
            return new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
        } catch (e) {
            console.error(e);
            return undefined;
        }
    }

    async getObject(tableId: number, key: Uint8Array) {
        const data = await this.getRaw(tableId, key);

        if (data === undefined) {
            return data;
        }
        return this.unserialize(tableId, data);
    }

    async putRaw(tableId: number, key: Uint8Array, data: Uint8Array) {
        try {
            await this.sub[tableId].put(key, data);
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    async putObject(tableId: number, key: Uint8Array, object: any) {
        const data = this.serialize(tableId, object);
        return await this.putRaw(tableId, key, data);
    }

    async getKeys(tableId: number) {
        const table = this.sub[tableId];
        const keys = [];

        for await (const [key] of table.iterator()) {
            keys.push(key);
        }
        return keys;
    }

    async query(tableId: number, query: any) {
        try {
            return this.sub[tableId].iterator(query);
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    async del(tableId: number, key: Uint8Array) {
        try {
            await this.sub[tableId].del(key);
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    getBatch() {
        const batchObject = this.db.batch();
        const sub = this.sub;

        const obj = {
            del: function (tableId: number, list: any) {
                const options = { sublevel: sub[tableId] };

                for (const key of list) {
                    batchObject.del(key, options);
                }
                return obj;
            },
            put: function (tableId: number, list: any) {
                const options = { sublevel: sub[tableId] };

                for (const [key, value] of list) {
                    batchObject.put(key, value, options);
                }
                return obj;
            },
            write: async function () {
                try {
                    await batchObject.write();
                    return true;
                } catch (e) {
                    console.error(e);
                    return e;
                }
            },
        };

        return obj;
    }

    serialize(tableId: number, object: any) {
        const serializer = new SchemaSerializer(NODE_SCHEMAS.DB[tableId]);
        const data = serializer.serialize(object);
        return data;
    }

    unserialize(tableId: number, data: Uint8Array) {
        const unserializer = new SchemaUnserializer(NODE_SCHEMAS.DB[tableId]);
        return unserializer.unserialize(data);
    }
}
