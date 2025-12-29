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
import { ChainInformationIndex, LevelDbTable } from './LevelDbTable';

export class LevelDb extends AbstractLevelDb {
    private db: Level<Uint8Array, Uint8Array>;
    private path: string;
    //private sub: AbstractSublevel<Level<Uint8Array, Uint8Array>,Uint8Array,Uint8Array,Uint8Array>[] = [];
    private sub: Map<
        number,
        AbstractSublevel<
            Level<Uint8Array, Uint8Array>,
            string | Uint8Array<ArrayBufferLike> | Buffer,
            Uint8Array,
            Uint8Array
        >
    > = new Map();
    private logger = getLogger(['node', 'db', LevelDb.name]);
    private static encoding  = {
        keyEncoding: 'view',
        valueEncoding: 'view',
    };

    constructor(path: string) {
        super()
        this.path = path;
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
                return LevelDbTable.ACCOUNTS_INDEX;
            case CHAIN.VB_VALIDATOR_NODE:
                return LevelDbTable.VALIDATOR_NODES_INDEX;
            case CHAIN.VB_ORGANIZATION:
                return LevelDbTable.ORGANIZATIONS_INDEX;
            case CHAIN.VB_APPLICATION:
                return LevelDbTable.APPLICATIONS_INDEX;
            case CHAIN.VB_PROTOCOL:
                return LevelDbTable.PROTOCOL_INDEX;
            default:
                return -1;
        }
    }

    initialize() {
        this.logger.info(`Initializing LevelDB at ${this.path}`);
        for (const [tableName, tableId] of Object.entries(LevelDbTable)) {
            this.sub.set(
                tableId,
                this.db.sublevel(Utils.numberToHexa(tableId, 2), LevelDb.encoding)
            );
        }
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
            const subTable = this.sub.get(tableId);
            if (subTable) {
                const b = await subTable.get(key);
                if (b !== undefined) {
                    this.logger.debug(`Returning ${b.length} bytes`);
                    return new Uint8Array(
                        b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
                    );
                }
            } else {
                // TODO: handle this case
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
            const subTable = this.sub.get(tableId);
            if (subTable) {
                await subTable.put(key, data);
                return true;
            } else {
                // TODO: handle this case
                return false;
            }
        } catch (e) {
            this.logger.error(`{e}`, { e });
            return false;
        }
    }


    async getKeys(tableId: number): Promise<Uint8Array[]> {
        const table = this.sub.get(tableId);
        if (table === undefined) {
            this.logger.debug(`Attempting to access an undefined table ${tableId}: aborting`)
            return []
        }

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
        const table = this.sub.get(tableId);
        if (table === undefined) {
            this.logger.debug(`Attempting to query an undefined table ${tableId}: aborting`);
            throw new Error("Attempted to query an undefined table");
        }

        if (query) {
            return table.iterator(query);
        } else {
            return table.iterator();
        }
    }

    async getFullTable(tableId: number) {
        const iterator = await this.query(tableId);
        return await iterator.all();
    }

    async del(tableId: number, key: Uint8Array) {
        const table = this.sub.get(tableId);
        if (table === undefined) {
            this.logger.debug(`Attempting to delete an entry an undefined table ${tableId}: aborting`);
            return false;
        }

        try {
            await table.del(key);
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
                const table = sub.get(tableId);
                if (table === undefined) {
                    throw new Error('Attempted to access an undefined table');
                }

                const options = tableId == -1 ? {} : { sublevel: table };

                for (const key of list) {
                    batchObject.del(key, options);
                }
                return obj;
            },
            put: function (tableId: number, list: any) {
                const table = sub.get(tableId);
                if (table === undefined) {
                    throw new Error('Attempted to access an undefined table');
                }

                const options = tableId == -1 ? {} : { sublevel: table };

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
            LevelDbTable.CHAIN_INFORMATION,
            ChainInformationIndex.CHAIN_INFORMATION_KEY,
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
