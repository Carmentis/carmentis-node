import { AbstractIterator, AbstractIteratorOptions } from 'abstract-level';
import { AbstractSublevel } from 'abstract-level/types/abstract-sublevel';
import { Level } from 'level';
import { AccountState, AccountHistoryEntry } from '@cmts-dev/carmentis-sdk/server';
import { MicroblockStorage } from '../types/valibot/storage/MicroblockStorage';
import {
    BlockContent,
    BlockInformation,
    ChainInformation,
    DataFile,
    Escrows,
    ValidatorNodeByAddress,
} from '../types/valibot/db/db';

export type LevelQueryIteratorOptions = AbstractIteratorOptions<Uint8Array, Uint8Array>;

export type LevelQueryResponseType = AbstractIterator<
    AbstractSublevel<
        Level<Uint8Array, Uint8Array>,
        string | Uint8Array | Buffer,
        Uint8Array,
        Uint8Array
    >,
    Uint8Array,
    Uint8Array
>;

export interface DbInterface {
    // raw binary access (will be removed soon)
    getRaw(tableId: number, key: Uint8Array): Promise<Uint8Array | undefined>;
    putRaw(tableId: number, key: Uint8Array, data: Uint8Array): Promise<boolean>;

    getKeys(tableId: number): Promise<Uint8Array[]>;
    query(tableId: number, query?: LevelQueryIteratorOptions): Promise<LevelQueryResponseType>;
    getFullTable(tableId: number): Promise<Uint8Array[][]>;
    del(tableId: number, key: Uint8Array): Promise<boolean>;

    // validator node
    getValidatorNodeByAddress(nodeAddress: Uint8Array): Promise<ValidatorNodeByAddress | undefined>;
    putValidatorNodeByAddress(nodeAddress: Uint8Array, validatorNodeHash: Uint8Array, votingPower: number): Promise<boolean>;

    // data file
    getDataFileFromDataFileKey(dbFileKey: Uint8Array): Promise<DataFile | undefined>;
    putDataFile(dataFileKey: Uint8Array, dataFile: DataFile): Promise<boolean>;

    // account id by public key hash
    getAccountIdByPublicKeyHash(publicKeyBytesHash: Uint8Array): Promise<Uint8Array | undefined>;

    // account state
    getAccountStateByAccountId(accountId: Uint8Array): Promise<AccountState | undefined>;
    putAccountState(id: Uint8Array, accountState: AccountState): Promise<boolean>;

    // account history entry
    getAccountHistoryEntryByHistoryHash(
        historyHash: Uint8Array,
    ): Promise<AccountHistoryEntry | undefined>;
    putAccountHistoryEntry(historyHash: Uint8Array, entry: AccountHistoryEntry): Promise<boolean>;

    // microblock storage
    getMicroblockStorage(microblockHeaderHash: Uint8Array): Promise<MicroblockStorage | undefined>;
    putMicroblockStorage(
        microblockHeaderHash: Uint8Array,
        microblockStorage: MicroblockStorage,
    ): Promise<boolean>;

    // account with vesting locks
    containsAccountWithVestingLocks(accountId: Uint8Array): Promise<boolean>;
    putAccountWithVestingLocks(accountHash: Uint8Array): Promise<boolean>;

    // escrow
    getEscrow(escrowIdentifier: Uint8Array): Promise<Escrows | undefined>;
    putEscrow(escrowIdentifier: Uint8Array, escrowData: Escrows): Promise<boolean>;

    // block content
    getBlockContent(blockHeight: number): Promise<BlockContent | undefined>;
    putBlockContent(height: number, blockContent: BlockContent): Promise<boolean>;

    // block information
    getBlockInformation(blockHeight: number): Promise<BlockInformation | undefined>;
    putBlockInformation(blockHeight: number, info: BlockInformation): Promise<boolean>;

    // chain information
    getChainInformation(): Promise<ChainInformation>;
    putChainInformation(chainInfo: ChainInformation): Promise<boolean>;
}
