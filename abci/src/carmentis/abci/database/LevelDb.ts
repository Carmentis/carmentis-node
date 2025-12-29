import { Level } from 'level';
import { NODE_SCHEMAS } from '../constants/constants';
import { CHAIN, Schema, Utils, VirtualBlockchain } from '@cmts-dev/carmentis-sdk/server';
import { LevelQueryIteratorOptions, LevelQueryResponseType } from './DbInterface';
import { getLogger } from '@logtape/logtape';
import { AbstractSublevel } from 'abstract-level/types/abstract-sublevel';
import { AbstractIteratorOptions } from 'abstract-level';
import { ChainInformation } from '../types/valibot/db/db';
import { NodeEncoder } from '../NodeEncoder';
import { AbstractLevelDb } from './AbstractLevelDb';

export class LevelDb extends AbstractLevelDb {
    private db: Level<Uint8Array, Uint8Array>;
    private path: string;
    //private sub: AbstractSublevel<Level<Uint8Array, Uint8Array>,Uint8Array,Uint8Array,Uint8Array>[] = [];
    private sub: AbstractSublevel<
        Level<Uint8Array, Uint8Array>,
        string | Uint8Array<ArrayBufferLike> | Buffer,
        Uint8Array,
        Uint8Array
    >[] = [];

    private tableSchemas: Schema[];
    private logger = getLogger(['node', 'db', LevelDb.name]);
    private static encoding  = {
        keyEncoding: 'view',
        valueEncoding: 'view',
    };

    constructor(path: string, tableSchemas: Schema[] = NODE_SCHEMAS.DB) {
        super()
        this.path = path;
        this.tableSchemas = tableSchemas;
        this.db = new Level(this.path, LevelDb.encoding);
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
                return NODE_SCHEMAS.DB_ACCOUNTS_INDEX;
            case CHAIN.VB_VALIDATOR_NODE:
                return NODE_SCHEMAS.DB_VALIDATOR_NODES_INDEX;
            case CHAIN.VB_ORGANIZATION:
                return NODE_SCHEMAS.DB_ORGANIZATIONS_INDEX;
            case CHAIN.VB_APPLICATION:
                return NODE_SCHEMAS.DB_APPLICATIONS_INDEX;
            case CHAIN.VB_PROTOCOL:
                return NODE_SCHEMAS.DB_PROTOCOL_INDEX;
            default:
                return -1;
        }
    }

    initialize() {
        this.logger.info(`Initializing LevelDB at ${this.path}`);

        const nTables = this.getTableCount();
        this.sub = [];
        for (let n = 0; n < nTables; n++) {
            this.sub[n] = this.db.sublevel(Utils.numberToHexa(n, 2), LevelDb.encoding);
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
//      if (this.db.status !== 'open') {
//          await this.open()
//      }
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
                this.logger.debug(`Returning ${b.length} bytes`);
                return new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
            }
        } catch (e) {
            this.logger.error('{e}', { e });
        }
        this.logger.warn(
            `Raw entry ${Utils.binaryToHexa(key)} not found on table ${tableId}: returning undefined`,
        );
        return undefined;
    }


    async putRaw(tableId: number, key: Uint8Array, data: Uint8Array) {
        this.logger.debug(
            `Setting binary with key {key} on table {tableId}: {dataLength} bytes`,
            () => ({
                key: Utils.binaryToHexa(key),
                tableId,
                dataLength: data.length,
            }),
        );
        try {
            await this.sub[tableId].put(key, data);
            return true;
        } catch (e) {
            this.logger.error(`{e}`, { e });
            return false;
        }
    }


    async getKeys(tableId: number): Promise<Uint8Array[]> {
        const table = this.sub[tableId];
        const keys: Uint8Array[] = [];

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
     * @return {Promise<Iterator | undefined>} A promise that resolves to the result of the query iterator on success, or undefined if an error occurs.
     */
    async query(
        tableId: number,
        query?: LevelQueryIteratorOptions,
    ): Promise<LevelQueryResponseType> {
        if (query) {
            return this.sub[tableId].iterator(query);
        } else {
            return this.sub[tableId].iterator();
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

    async initializeTable() {
        const chainInfo: ChainInformation = {
            height: 0,
            lastBlockTimestamp: 0,
            microblockCount: 0,
            objectCounts: Array(CHAIN.N_VIRTUAL_BLOCKCHAINS).fill(0), // TODO: use version-based constants
        };
        await this.putRaw(
            NODE_SCHEMAS.DB_CHAIN_INFORMATION,
            NODE_SCHEMAS.DB_CHAIN_INFORMATION_KEY,
            NodeEncoder.encodeChainInformation(chainInfo),
        );
    }

    async indexVirtualBlockchain(virtualBlockchain: VirtualBlockchain) {
        const vbType = virtualBlockchain.getType();
        const indexTableId = LevelDb.getTableIdFromVirtualBlockchainType(vbType);
        if (indexTableId != -1) {
            await this.putRaw(indexTableId, virtualBlockchain.getId(), new Uint8Array(0));
        } else {
            // no need to index this type of virtual blockchain
            this.logger.debug(
                `Ignore virtual blockchain from index: virtual blockchain type ${virtualBlockchain.getType()} is ignored`,
            );
        }
    }
}
