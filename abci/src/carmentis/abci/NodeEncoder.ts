import * as v from 'valibot';
import { Encoder } from 'cbor-x';
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
    BlockModifiedAccounts,
    BlockModifiedAccountsSchema,
} from './types/valibot/db/db';
import {
    CryptoEncoderFactory,
    AccountHistory,
    AccountHistorySchema,
    AccountHistoryEntry,
    AccountHistoryEntrySchema,
} from '@cmts-dev/carmentis-sdk/server';

export class NodeEncoder {
    private static encoder = CryptoEncoderFactory.getCryptoBinaryEncoder();
    
    private static encodeObject(data: object): Uint8Array {
        return this.encoder.encode(data);
    }

    private static decodeBinary(data: Uint8Array): object {
        return this.encoder.decode(data);
    }
    
    // MicroblockStorage
    static encodeMicroblockStorage(microblockStorage: MicroblockStorage): Uint8Array {
        const validated = v.parse(MicroblockStorageSchema, microblockStorage);
        return this.encodeObject(validated);
    }

    static decodeMicroblockStorage(encodedMicroblockStorage: Uint8Array): MicroblockStorage {
        const decoded = this.decodeBinary(encodedMicroblockStorage);
        return v.parse(MicroblockStorageSchema, decoded);
    }

    // StoredSnapshot
    static encodeStoredSnapshot(storedSnapshot: StoredSnapshot): Uint8Array {
        const validated = v.parse(StoredSnapshotSchema, storedSnapshot);
        return this.encodeObject(validated);
    }

    static decodeStoredSnapshot(encodedStoredSnapshot: Uint8Array): StoredSnapshot {
        const decoded = this.decodeBinary(encodedStoredSnapshot);
        return v.parse(StoredSnapshotSchema, decoded);
    }

    // StoredGenesisSnapshot
    static encodeStoredGenesisSnapshot(storedGenesisSnapshot: StoredGenesisSnapshot): Uint8Array {
        const validated = v.parse(StoredGenesisSnapshotSchema, storedGenesisSnapshot);
        return this.encodeObject(validated);
    }

    static decodeStoredGenesisSnapshot(encodedStoredGenesisSnapshot: Uint8Array): StoredGenesisSnapshot {
        const decoded = this.decodeBinary(encodedStoredGenesisSnapshot);
        return v.parse(StoredGenesisSnapshotSchema, decoded);
    }

    // ChainInformation (DB_CHAIN_INFORMATION)
    static encodeChainInformation(chainInformation: ChainInformation): Uint8Array {
        const validated = v.parse(ChainInformationSchema, chainInformation);
        return this.encodeObject(validated);
    }

    static decodeChainInformation(encodedChainInformation: Uint8Array): ChainInformation {
        const decoded = this.decodeBinary(encodedChainInformation);
        return v.parse(ChainInformationSchema, decoded);
    }

    // DataFile (DB_DATA_FILE)
    static encodeDataFile(dataFile: DataFile): Uint8Array {
        const validated = v.parse(DataFileSchema, dataFile);
        return this.encodeObject(validated);
    }

    static decodeDataFile(encodedDataFile: Uint8Array): DataFile {
        const decoded = this.decodeBinary(encodedDataFile);
        return v.parse(DataFileSchema, decoded);
    }

    // VbRadix (DB_INDEX_FILE)
    static encodeVbRadix(vbRadix: VbRadix): Uint8Array {
        const validated = v.parse(VbRadixSchema, vbRadix);
        return this.encodeObject(validated);
    }

    static decodeVbRadix(encodedVbRadix: Uint8Array): VbRadix {
        const decoded = this.decodeBinary(encodedVbRadix);
        return v.parse(VbRadixSchema, decoded);
    }

    // TokenRadix
    static encodeTokenRadix(tokenRadix: TokenRadix): Uint8Array {
        const validated = v.parse(TokenRadixSchema, tokenRadix);
        return this.encodeObject(validated);
    }

    static decodeTokenRadix(encodedTokenRadix: Uint8Array): TokenRadix {
        const decoded = this.decodeBinary(encodedTokenRadix);
        return v.parse(TokenRadixSchema, decoded);
    }

    // AccountByPublicKey
    static encodeAccountByPublicKey(accountByPublicKey: AccountByPublicKey): Uint8Array {
        const validated = v.parse(AccountByPublicKeySchema, accountByPublicKey);
        return this.encodeObject(validated);
    }

    static decodeAccountByPublicKey(encodedAccountByPublicKey: Uint8Array): AccountByPublicKey {
        const decoded = this.decodeBinary(encodedAccountByPublicKey);
        return v.parse(AccountByPublicKeySchema, decoded);
    }

    // AccountsWithVestingLocks
    static encodeAccountsWithVestingLocks(accountsWithVestingLocks: AccountsWithVestingLocks): Uint8Array {
        const validated = v.parse(AccountsWithVestingLocksSchema, accountsWithVestingLocks);
        return this.encodeObject(validated);
    }

    static decodeAccountsWithVestingLocks(encodedAccountsWithVestingLocks: Uint8Array): AccountsWithVestingLocks {
        const decoded = this.decodeBinary(encodedAccountsWithVestingLocks);
        return v.parse(AccountsWithVestingLocksSchema, decoded);
    }

    // Escrows
    static encodeEscrows(escrows: Escrows): Uint8Array {
        const validated = v.parse(EscrowsSchema, escrows);
        return this.encodeObject(validated);
    }

    static decodeEscrows(encodedEscrows: Uint8Array): Escrows {
        const decoded = this.decodeBinary(encodedEscrows);
        return v.parse(EscrowsSchema, decoded);
    }

    // ValidatorNodeByAddress
    static encodeValidatorNodeByAddress(validatorNodeByAddress: ValidatorNodeByAddress): Uint8Array {
        const validated = v.parse(ValidatorNodeByAddressSchema, validatorNodeByAddress);
        return this.encodeObject(validated);
    }

    static decodeValidatorNodeByAddress(encodedValidatorNodeByAddress: Uint8Array): ValidatorNodeByAddress {
        const decoded = this.decodeBinary(encodedValidatorNodeByAddress);
        return v.parse(ValidatorNodeByAddressSchema, decoded);
    }

    // AccountBlockReference
    static encodeAccountBlockReference(accountBlockReference: AccountBlockReference): Uint8Array {
        const validated = v.parse(AccountBlockReferenceSchema, accountBlockReference);
        return this.encodeObject(validated);
    }

    static decodeAccountBlockReference(encodedAccountBlockReference: Uint8Array): AccountBlockReference {
        const decoded = this.decodeBinary(encodedAccountBlockReference);
        return v.parse(AccountBlockReferenceSchema, decoded);
    }

    // AccountMbReference
    static encodeAccountMbReference(accountMbReference: AccountMbReference): Uint8Array {
        const validated = v.parse(AccountMbReferenceSchema, accountMbReference);
        return this.encodeObject(validated);
    }

    static decodeAccountMbReference(encodedAccountMbReference: Uint8Array): AccountMbReference {
        const decoded = this.decodeBinary(encodedAccountMbReference);
        return v.parse(AccountMbReferenceSchema, decoded);
    }

    // AccountSectionReference
    static encodeAccountSectionReference(accountSectionReference: AccountSectionReference): Uint8Array {
        const validated = v.parse(AccountSectionReferenceSchema, accountSectionReference);
        return this.encodeObject(validated);
    }

    static decodeAccountSectionReference(encodedAccountSectionReference: Uint8Array): AccountSectionReference {
        const decoded = this.decodeBinary(encodedAccountSectionReference);
        return v.parse(AccountSectionReferenceSchema, decoded);
    }

    // BlockInformation
    static encodeBlockInformation(blockInformation: BlockInformation): Uint8Array {
        const validated = v.parse(BlockInformationSchema, blockInformation);
        return this.encodeObject(validated);
    }

    static decodeBlockInformation(encodedBlockInformation: Uint8Array): BlockInformation {
        const decoded = this.decodeBinary(encodedBlockInformation);
        return v.parse(BlockInformationSchema, decoded);
    }

    // BlockContent
    static encodeBlockContent(blockContent: BlockContent): Uint8Array {
        const validated = v.parse(BlockContentSchema, blockContent);
        return this.encodeObject(validated);
    }

    static decodeBlockContent(encodedBlockContent: Uint8Array): BlockContent {
        const decoded = this.decodeBinary(encodedBlockContent);
        return v.parse(BlockContentSchema, decoded);
    }

    // BlockModifiedAccounts
    static encodeBlockModifiedAccounts(blockModifiedAccounts: BlockModifiedAccounts): Uint8Array {
        const validated = v.parse(BlockModifiedAccountsSchema, blockModifiedAccounts);
        return this.encodeObject(validated);
    }

    static decodeBlockModifiedAccounts(encodedBlockModifiedAccounts: Uint8Array): BlockModifiedAccounts {
        const decoded = this.decodeBinary(encodedBlockModifiedAccounts);
        return v.parse(BlockModifiedAccountsSchema, decoded);
    }

    // AccountHistory
    static encodeAccountHistory(accountHistory: AccountHistory): Uint8Array {
        const validated = v.parse(AccountHistorySchema, accountHistory);
        return this.encodeObject(validated);
    }

    static decodeAccountHistory(encodedAccountHistory: Uint8Array): AccountHistory {
        const decoded = this.decodeBinary(encodedAccountHistory);
        return v.parse(AccountHistorySchema, decoded);
    }

    static encodeAccountHistoryEntry(accountHistoryEntry: AccountHistoryEntry): Uint8Array {
       return this.encodeObject(v.parse(AccountHistoryEntrySchema, accountHistoryEntry));
    }

    static decodeAccountHistoryEntry(serializedAccountHistoryEntry: Uint8Array): AccountHistoryEntry {
        const decoded = this.decodeBinary(serializedAccountHistoryEntry);
        return v.parse(AccountHistoryEntrySchema, decoded);
    }
}