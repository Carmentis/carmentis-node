import * as v from 'valibot';
import { encode, decode } from 'cbor-x';
import { MicroblockStorage, MicroblockStorageSchema } from './types/valibot/storage/MicroblockStorage';
import { StoredSnapshot, StoredSnapshotSchema } from './types/valibot/snapshots/StoredSnapshot';
import { StoredGenesisSnapshot, StoredGenesisSnapshotSchema } from './types/valibot/StoredGenesisSnapshot';
import {
    ChainInformation,
    ChainInformationSchema,
    DataFile,
    DataFileSchema,
    VbRadix,
    VbRadixSchema,
    TokenRadix,
    TokenRadixSchema,
    AccountByPublicKey,
    AccountByPublicKeySchema,
    AccountsWithVestingLocks,
    AccountsWithVestingLocksSchema,
    Escrows,
    EscrowsSchema,
    ValidatorNodeByAddress,
    ValidatorNodeByAddressSchema,
    AccountBlockReference,
    AccountBlockReferenceSchema,
    AccountMbReference,
    AccountMbReferenceSchema,
    AccountSectionReference,
    AccountSectionReferenceSchema,
    BlockInformation,
    BlockInformationSchema,
    BlockContent,
    BlockContentSchema,
} from './types/valibot/db/db';
import { AccountHistory, AccountHistorySchema } from './types/valibot/account/AccountHistory';
import {
    AccountHistoryEntry,
    AccountHistoryEntrySchema,
} from './types/valibot/account/AccountHistoryEntry';

export class NodeEncoder {
    // MicroblockStorage
    static encodeMicroblockStorage(microblockStorage: MicroblockStorage): Uint8Array {
        const validated = v.parse(MicroblockStorageSchema, microblockStorage);
        return encode(validated);
    }

    static decodeMicroblockStorage(encodedMicroblockStorage: Uint8Array): MicroblockStorage {
        const decoded = decode(encodedMicroblockStorage);
        return v.parse(MicroblockStorageSchema, decoded);
    }

    // StoredSnapshot
    static encodeStoredSnapshot(storedSnapshot: StoredSnapshot): Uint8Array {
        const validated = v.parse(StoredSnapshotSchema, storedSnapshot);
        return encode(validated);
    }

    static decodeStoredSnapshot(encodedStoredSnapshot: Uint8Array): StoredSnapshot {
        const decoded = decode(encodedStoredSnapshot);
        return v.parse(StoredSnapshotSchema, decoded);
    }

    // StoredGenesisSnapshot
    static encodeStoredGenesisSnapshot(storedGenesisSnapshot: StoredGenesisSnapshot): Uint8Array {
        const validated = v.parse(StoredGenesisSnapshotSchema, storedGenesisSnapshot);
        return encode(validated);
    }

    static decodeStoredGenesisSnapshot(encodedStoredGenesisSnapshot: Uint8Array): StoredGenesisSnapshot {
        const decoded = decode(encodedStoredGenesisSnapshot);
        return v.parse(StoredGenesisSnapshotSchema, decoded);
    }

    // ChainInformation (DB_CHAIN_INFORMATION)
    static encodeChainInformation(chainInformation: ChainInformation): Uint8Array {
        const validated = v.parse(ChainInformationSchema, chainInformation);
        return encode(validated);
    }

    static decodeChainInformation(encodedChainInformation: Uint8Array): ChainInformation {
        const decoded = decode(encodedChainInformation);
        return v.parse(ChainInformationSchema, decoded);
    }

    // DataFile (DB_DATA_FILE)
    static encodeDataFile(dataFile: DataFile): Uint8Array {
        const validated = v.parse(DataFileSchema, dataFile);
        return encode(validated);
    }

    static decodeDataFile(encodedDataFile: Uint8Array): DataFile {
        const decoded = decode(encodedDataFile);
        return v.parse(DataFileSchema, decoded);
    }

    // VbRadix (DB_INDEX_FILE)
    static encodeVbRadix(vbRadix: VbRadix): Uint8Array {
        const validated = v.parse(VbRadixSchema, vbRadix);
        return encode(validated);
    }

    static decodeVbRadix(encodedVbRadix: Uint8Array): VbRadix {
        const decoded = decode(encodedVbRadix);
        return v.parse(VbRadixSchema, decoded);
    }

    // TokenRadix
    static encodeTokenRadix(tokenRadix: TokenRadix): Uint8Array {
        const validated = v.parse(TokenRadixSchema, tokenRadix);
        return encode(validated);
    }

    static decodeTokenRadix(encodedTokenRadix: Uint8Array): TokenRadix {
        const decoded = decode(encodedTokenRadix);
        return v.parse(TokenRadixSchema, decoded);
    }

    // AccountByPublicKey
    static encodeAccountByPublicKey(accountByPublicKey: AccountByPublicKey): Uint8Array {
        const validated = v.parse(AccountByPublicKeySchema, accountByPublicKey);
        return encode(validated);
    }

    static decodeAccountByPublicKey(encodedAccountByPublicKey: Uint8Array): AccountByPublicKey {
        const decoded = decode(encodedAccountByPublicKey);
        return v.parse(AccountByPublicKeySchema, decoded);
    }

    // AccountsWithVestingLocks
    static encodeAccountsWithVestingLocks(accountsWithVestingLocks: AccountsWithVestingLocks): Uint8Array {
        const validated = v.parse(AccountsWithVestingLocksSchema, accountsWithVestingLocks);
        return encode(validated);
    }

    static decodeAccountsWithVestingLocks(encodedAccountsWithVestingLocks: Uint8Array): AccountsWithVestingLocks {
        const decoded = decode(encodedAccountsWithVestingLocks);
        return v.parse(AccountsWithVestingLocksSchema, decoded);
    }

    // Escrows
    static encodeEscrows(escrows: Escrows): Uint8Array {
        const validated = v.parse(EscrowsSchema, escrows);
        return encode(validated);
    }

    static decodeEscrows(encodedEscrows: Uint8Array): Escrows {
        const decoded = decode(encodedEscrows);
        return v.parse(EscrowsSchema, decoded);
    }

    // ValidatorNodeByAddress
    static encodeValidatorNodeByAddress(validatorNodeByAddress: ValidatorNodeByAddress): Uint8Array {
        const validated = v.parse(ValidatorNodeByAddressSchema, validatorNodeByAddress);
        return encode(validated);
    }

    static decodeValidatorNodeByAddress(encodedValidatorNodeByAddress: Uint8Array): ValidatorNodeByAddress {
        const decoded = decode(encodedValidatorNodeByAddress);
        return v.parse(ValidatorNodeByAddressSchema, decoded);
    }

    // AccountBlockReference
    static encodeAccountBlockReference(accountBlockReference: AccountBlockReference): Uint8Array {
        const validated = v.parse(AccountBlockReferenceSchema, accountBlockReference);
        return encode(validated);
    }

    static decodeAccountBlockReference(encodedAccountBlockReference: Uint8Array): AccountBlockReference {
        const decoded = decode(encodedAccountBlockReference);
        return v.parse(AccountBlockReferenceSchema, decoded);
    }

    // AccountMbReference
    static encodeAccountMbReference(accountMbReference: AccountMbReference): Uint8Array {
        const validated = v.parse(AccountMbReferenceSchema, accountMbReference);
        return encode(validated);
    }

    static decodeAccountMbReference(encodedAccountMbReference: Uint8Array): AccountMbReference {
        const decoded = decode(encodedAccountMbReference);
        return v.parse(AccountMbReferenceSchema, decoded);
    }

    // AccountSectionReference
    static encodeAccountSectionReference(accountSectionReference: AccountSectionReference): Uint8Array {
        const validated = v.parse(AccountSectionReferenceSchema, accountSectionReference);
        return encode(validated);
    }

    static decodeAccountSectionReference(encodedAccountSectionReference: Uint8Array): AccountSectionReference {
        const decoded = decode(encodedAccountSectionReference);
        return v.parse(AccountSectionReferenceSchema, decoded);
    }

    // BlockInformation
    static encodeBlockInformation(blockInformation: BlockInformation): Uint8Array {
        const validated = v.parse(BlockInformationSchema, blockInformation);
        return encode(validated);
    }

    static decodeBlockInformation(encodedBlockInformation: Uint8Array): BlockInformation {
        const decoded = decode(encodedBlockInformation);
        return v.parse(BlockInformationSchema, decoded);
    }

    // BlockContent
    static encodeBlockContent(blockContent: BlockContent): Uint8Array {
        const validated = v.parse(BlockContentSchema, blockContent);
        return encode(validated);
    }

    static decodeBlockContent(encodedBlockContent: Uint8Array): BlockContent {
        const decoded = decode(encodedBlockContent);
        return v.parse(BlockContentSchema, decoded);
    }

    // AccountHistory
    static encodeAccountHistory(accountHistory: AccountHistory): Uint8Array {
        const validated = v.parse(AccountHistorySchema, accountHistory);
        return encode(validated);
    }

    static decodeAccountHistory(encodedAccountHistory: Uint8Array): AccountHistory {
        const decoded = decode(encodedAccountHistory);
        return v.parse(AccountHistorySchema, decoded);
    }


    static encodeAccountHistoryEntry(accountHistoryEntry: AccountHistoryEntry): Uint8Array {
       return encode(v.parse(AccountHistoryEntrySchema, accountHistoryEntry));
    }


    static decodeAccountHistoryEntry(serializedAccountHistoryEntry: Uint8Array): AccountHistoryEntry {
        const decoded = decode(serializedAccountHistoryEntry);
        return v.parse(AccountHistoryEntrySchema, decoded);
    }
}