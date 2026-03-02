import * as v from 'valibot';

export function uint8array() {
    return v.instance(Uint8Array<ArrayBuffer | ArrayBufferLike>)
}

// (0x00) CHAIN_INFORMATION - ChainInformation
export const ChainInformationSchema = v.object({
    height: v.number(),
    lastBlockTimestamp: v.number(),
    microblockCount: v.number(),
    objectCounts: v.array(v.number()),
});
export type ChainInformation = v.InferOutput<typeof ChainInformationSchema>;

// (0x01) DATA_FILE - DataFile
export const DataFileSchema = v.object({
    fileSize: v.number(),
    microblockCount: v.number(),
});
export type DataFile = v.InferOutput<typeof DataFileSchema>;

// (0x02) VB_RADIX - VbRadix
export const VbRadixSchema = v.object({});
export type VbRadix = v.InferOutput<typeof VbRadixSchema>;

// (0x03) TOKEN_RADIX - TokenRadix
export const TokenRadixSchema = v.object({});
export type TokenRadix = v.InferOutput<typeof TokenRadixSchema>;

// (0x04) BLOCK_INFORMATION - BlockInformation
export const BlockInformationSchema = v.object({
    hash: uint8array(),
    timestamp: v.pipe(v.number(), v.integer(), v.minValue(0)),
    proposerAddress: uint8array(),
    applicationHash: uint8array(),
    radixHash: uint8array(),
    size: v.pipe(v.number(), v.integer(), v.minValue(0)),
    microblockCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
})
export type BlockInformation = v.InferOutput<typeof BlockInformationSchema>;

// (0x05) BLOCK_CONTENT - BlockContent
export const BlockContentSchema = v.object({
    microblocks: v.array(v.object({
        hash: uint8array(),
        vbId: uint8array(),
        vbType: v.number(),
        height: v.number(),
        size: v.number(),
        sectionCount: v.number(),
    })),
});
export type BlockContent = v.InferOutput<typeof BlockContentSchema>;

// (0x06) BLOCK_MODIFIED_ACCOUNTS - BlockModifiedAccounts
export const BlockModifiedAccountsSchema = v.object({
    modifiedAccounts: v.array(uint8array()),
});
export type BlockModifiedAccounts = v.InferOutput<typeof BlockModifiedAccountsSchema>;

// (0x07) MICROBLOCK_VB_INFORMATION
// encoded with MicroblockInformationSchema from core

// (0x08) MICROBLOCK_STORAGE - MicroblockStorage
export const MicroblockStorageSchema = v.object({
    fileIdentifier: v.number(),
    offset: v.number(),
    size: v.number(),
});
export type MicroblockStorage = v.InferOutput<typeof MicroblockStorageSchema>;

// (0x09) VIRTUAL_BLOCKCHAIN_STATE
// encoded with VirtualBlockchainStateSchema from core

// (0x0a) ACCOUNT_STATE
// encoded with AccountStateSchema from core

// (0x0b) ACCOUNT_HISTORY
// encoded with AccountHistoryEntrySchema from core

// (0x0c) ACCOUNT_BY_PUBLIC_KEY - AccountByPublicKey
export const AccountByPublicKeySchema = v.object({
    accountHash: uint8array(),
});
export type AccountByPublicKey = v.InferOutput<typeof AccountByPublicKeySchema>;

// (0x0d) ACCOUNTS_WITH_VESTING_LOCKS - AccountsWithVestingLocks
export const AccountsWithVestingLocksSchema = v.object({});
export type AccountsWithVestingLocks = v.InferOutput<typeof AccountsWithVestingLocksSchema>;

// (0x0e) ACCOUNTS_WITH_STAKING_LOCKS - AccountsWithStakingLocks
export const AccountsWithStakingLocksSchema = v.object({});
export type AccountsWithStakingLocks = v.InferOutput<typeof AccountsWithStakingLocksSchema>;

// (0x0f) ESCROWS - Escrows
export const EscrowsSchema = v.object({
    payerAccount: uint8array(),
    payeeAccount: uint8array(),
    agentAccount: uint8array(),
});
export type Escrows = v.InferOutput<typeof EscrowsSchema>;

// (0x10) VALIDATOR_NODE_BY_ADDRESS - ValidatorNodeByAddress
export const ValidatorNodeByAddressSchema = v.object({
    validatorNodeHash: uint8array(),
    votingPower: v.number(),
});
export type ValidatorNodeByAddress = v.InferOutput<typeof ValidatorNodeByAddressSchema>;

// Account history references

// AccountBlockReference
export const AccountBlockReferenceSchema = v.object({
    height: v.number(),
});
export type AccountBlockReference = v.InferOutput<typeof AccountBlockReferenceSchema>;

// AccountMbReference
export const AccountMbReferenceSchema = v.object({
    mbHash: uint8array(),
});
export type AccountMbReference = v.InferOutput<typeof AccountMbReferenceSchema>;

// AccountSectionReference
export const AccountSectionReferenceSchema = v.object({
    mbHash: uint8array(),
    sectionIndex: v.number(),
});
export type AccountSectionReference = v.InferOutput<typeof AccountSectionReferenceSchema>;
