import { Level } from 'level';
import { NODE_SCHEMAS } from '../constants/constants';
import {
    CHAIN,
    Schema,
    SchemaSerializer,
    SchemaUnserializer,
    Utils,
    VirtualBlockchainType,
} from '@cmts-dev/carmentis-sdk/server';
import { DbInterface, LevelQueryIteratorOptions, LevelQueryResponseType } from './DbInterface';
import { getLogger } from '@logtape/logtape';
import { DataFileObject } from '../types/DataFileObject';
import { MicroblockStorageObject } from '../types/MicroblockStorageObject';
import { AbstractSublevel } from 'abstract-level/types/abstract-sublevel';
import { AbstractIterator, AbstractIteratorOptions } from 'abstract-level';
import { ChainInformationObject } from '../types/ChainInformationObject';




export class LevelDb implements DbInterface {
    private db: Level<Uint8Array, Uint8Array>;
    private path: string;
    //private sub: AbstractSublevel<Level<Uint8Array, Uint8Array>,Uint8Array,Uint8Array,Uint8Array>[] = [];
    private sub: AbstractSublevel<
        Level<Uint8Array, Uint8Array>,
        string | Uint8Array<ArrayBufferLike> | Buffer,
        Uint8Array, Uint8Array
    >[] = [];

    private tableSchemas: Schema[];
    private logger = getLogger(["node", "db", LevelDb.name])

    constructor(path: string, tableSchemas: Schema[] = NODE_SCHEMAS.DB) {
        this.path = path;
        this.tableSchemas = tableSchemas;
    }

    /**
     * This method is used when a height should be used as a table key.
     * @param height
     */
    public static convertHeightToTableKey(height: number): Uint8Array {
        return new Uint8Array(Utils.intToByteArray(height, 6));
    }

    public static getTableIdFromVirtualBlockchainType(type: number) {
        switch (type) {
            case CHAIN.VB_ACCOUNT:
                return NODE_SCHEMAS.DB_ACCOUNTS;
            case CHAIN.VB_VALIDATOR_NODE:
                return NODE_SCHEMAS.DB_VALIDATOR_NODES;
            case CHAIN.VB_ORGANIZATION:
                return NODE_SCHEMAS.DB_ORGANIZATIONS;
            case CHAIN.VB_APPLICATION:
                return NODE_SCHEMAS.DB_APPLICATIONS;
            default:
                return -1;
        }
    }

    async initialize() {
        this.logger.info(`Initializing LevelDB at ${this.path}`);
        const encoding = {
            keyEncoding: 'view',
            valueEncoding: 'view',
        };

        this.db = new Level(this.path, encoding);
        const nTables = this.getTableCount();
        this.sub = [];
        for (let n = 0; n < nTables; n++) {
            this.sub[n] = this.db.sublevel(Utils.numberToHexa(n, 2), encoding);
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

    getDbIterator() {
        return this.db.iterator();
    }

    async getRaw(tableId: number, key: Uint8Array): Promise<Uint8Array | undefined> {
        this.logger.debug(`Accessing binary with key {key} on table {tableId}`, () => ({
            key: Utils.binaryToHexa(key),
            tableId,
        }));
        try {
            const b = await this.sub[tableId].get(key);
            if (b !== undefined) {
                this.logger.debug(`Returning ${b.length} bytes`)
                return new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
            }
        } catch (e) {
            this.logger.error("{e}", {e});
        }
        this.logger.warn(`Raw entry ${Utils.binaryToHexa(key)} not found on table ${tableId}: returning undefined`)
        return undefined;
    }

    async getObject(tableId: number, key: Uint8Array) {
        this.logger.debug(`Accessing object with key {key} on table {tableId}`, () => ({
            key: Utils.binaryToHexa(key),
            tableId,
        }));
        const data = await this.getRaw(tableId, key);
        if (data === undefined) {
            return data;
        }
        return this.unserialize(tableId, data);
    }

    async putRaw(tableId: number, key: Uint8Array, data: Uint8Array) {
        this.logger.debug(`Setting binary with key {key} on table {tableId}: {dataLength} bytes`, () => ({
            key: Utils.binaryToHexa(key),
            tableId,
            dataLength: data.length,
        }));
        try {
            await this.sub[tableId].put(key, data);
            return true;
        } catch (e) {
            this.logger.error(`{e}`, {e});
            return false;
        }
    }

    async putObject(tableId: number, key: Uint8Array, object: any) {
        this.logger.debug(`Setting object with key {key} on table {tableId}: {object}`, () => ({
            key: Utils.binaryToHexa(key),
            tableId,
            object,
        }));
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

    /**
     * Executes a query on the specified table using provided iterator options.
     *
     * @param {number} tableId - The identifier of the table to execute the query on.
     * @param {AbstractIteratorOptions<Uint8Array<ArrayBufferLike>, Uint8Array<ArrayBufferLike>>} query - The query options for the iterator.
     * @return {Promise<Iterator | null>} A promise that resolves to the result of the query iterator on success, or null if an error occurs.
     */
    async query(
        tableId: number,
        query?: LevelQueryIteratorOptions,
    ): Promise<LevelQueryResponseType> {
        try {
            return this.sub[tableId].iterator(query);
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    async getFullTable(tableId: number) {
        const iterator = await this.query(tableId);
        return await iterator.all();
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
                const options = tableId == -1 ? {} : { sublevel: sub[tableId] };

                for (const key of list) {
                    batchObject.del(key, options);
                }
                return obj;
            },
            put: function (tableId: number, list: any) {
                const options = tableId == -1 ? {} : { sublevel: sub[tableId] };

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

    serialize(tableId: number, object: object) {
        const serializer = new SchemaSerializer(NODE_SCHEMAS.DB[tableId]);
        const data = serializer.serialize(object);
        return data;
    }

    unserialize(tableId: number, data: Uint8Array) {
        const unserializer = new SchemaUnserializer(NODE_SCHEMAS.DB[tableId]);
        return unserializer.unserialize(data);
    }

    async getDataFileFromDataFileKey(dbFileKey: Uint8Array<ArrayBuffer>): Promise<DataFileObject> {
        return (await this.getObject(NODE_SCHEMAS.DB_DATA_FILE, dbFileKey)) as DataFileObject;
    }

    async putDataFile(dataFileKey: Uint8Array, dataFileObject: DataFileObject) {
        return await this.putObject(NODE_SCHEMAS.DB_DATA_FILE, dataFileKey, dataFileObject);
    }

    async putMicroblockStorage(microblockHeaderHash, microblockStorage: MicroblockStorageObject) {
        return await this.putObject(NODE_SCHEMAS.DB_MICROBLOCK_STORAGE, microblockHeaderHash, microblockStorage);
    }

    async getMicroblockStorage(microblockHeaderHash: Uint8Array): Promise<MicroblockStorageObject> {
        return (await this.getObject(NODE_SCHEMAS.DB_MICROBLOCK_STORAGE, microblockHeaderHash)) as MicroblockStorageObject;
    }


    async getChainInformationObject() {
        return await this.getObject(
            NODE_SCHEMAS.DB_CHAIN_INFORMATION,
            NODE_SCHEMAS.DB_CHAIN_INFORMATION_KEY,
        ) as ChainInformationObject
    }

    async initializeTable() {
        const chainInfo: ChainInformationObject = {
            height: 0,
            lastBlockTimestamp: 0,
            microblockCount: 0,
            objectCounts: Array(CHAIN.N_VIRTUAL_BLOCKCHAINS).fill(0) // TODO: use version-based constants
        };
        await this.putObject(
            NODE_SCHEMAS.DB_CHAIN_INFORMATION,
            NODE_SCHEMAS.DB_CHAIN_INFORMATION_KEY,
            chainInfo
        )
    }
}
