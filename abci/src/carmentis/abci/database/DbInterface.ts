import { DataFileObject } from '../types/DataFileObject';
import { MicroblockStorageObject } from '../types/MicroblockStorageObject';
import { AbstractIterator, AbstractIteratorOptions } from 'abstract-level';
import { AbstractSublevel } from 'abstract-level/types/abstract-sublevel';
import { Level } from 'level';
import { AccountHistoryEntry } from '../accounts/AccountManager';
import {AccountState} from "@cmts-dev/carmentis-sdk/server";

export type LevelQueryIteratorOptions = AbstractIteratorOptions<Uint8Array, Uint8Array>

export type LevelQueryResponseType =
    AbstractIterator<
        AbstractSublevel<
            Level<Uint8Array, Uint8Array>,
            string | Uint8Array | Buffer, Uint8Array,
            Uint8Array
        >,
        Uint8Array,
        Uint8Array
    >;

export interface DbInterface {
    getTableCount(): number;
    getRaw(tableId: number, key: Uint8Array): Promise<Uint8Array | undefined>;
    getObject(tableId: number, key: Uint8Array): Promise<object | undefined>;
    putRaw(tableId: number, key: Uint8Array, data: Uint8Array): Promise<boolean>;
    putObject(tableId: number, key: Uint8Array, object: object): Promise<boolean>;
    getKeys(tableId: number): Promise<Uint8Array[]>;
    query(tableId: number, query?: any): Promise<LevelQueryResponseType>;
    getFullTable(tableId: number): Promise<any>;
    del(tableId: number, key: Uint8Array): Promise<boolean>;
    serialize(tableId: number, object: object): Uint8Array;
    unserialize(tableId: number, data: Uint8Array): object;
    getDataFileFromDataFileKey(dbFileKey: Uint8Array): Promise<DataFileObject>;
    putDataFile(dataFileKey: Uint8Array, dataFileObject: DataFileObject): Promise<boolean>;
    putMicroblockStorage(
        microblockHeaderHash: Uint8Array,
        microblockStorage: MicroblockStorageObject,
    ): Promise<boolean>;
    getMicroblockStorage(microblockHeaderHash: Uint8Array): Promise<MicroblockStorageObject>;
    getAccountIdByPublicKeyHash(publicKeyBytesHash: Uint8Array): Promise<Uint8Array | undefined>;
    getAccountStateByAccountId(accountId: Uint8Array): Promise<AccountState | undefined>;
    getAccountHistoryEntryByHistoryHash(
        historyHash: Uint8Array,
    ): Promise<AccountHistoryEntry | undefined>;
    putAccountWithVestingLocks(accountHash: Uint8Array): Promise<boolean>;
    putEscrow(escrowIdentifier: Uint8Array, escrowData: object): Promise<boolean>;
}
