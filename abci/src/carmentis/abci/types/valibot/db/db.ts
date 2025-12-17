import * as v from 'valibot';
import { number } from 'zod';


export function uint8array() {
    return v.instance(Uint8Array<ArrayBuffer | ArrayBufferLike>)
}

// ChainInformation
export const ChainInformationSchema = v.object({
    height: v.number(),
    lastBlockTimestamp: v.number(),
    microblockCount: v.number(),
    objectCounts: v.array(v.number()),
});
export type ChainInformation = v.InferOutput<typeof ChainInformationSchema>;

// DataFile
export const DataFileSchema = v.object({
    fileSize: v.number(),
    microblockCount: v.number(),
});
export type DataFile = v.InferOutput<typeof DataFileSchema>;

// VbRadix
export const VbRadixSchema = v.object({});
export type VbRadix = v.InferOutput<typeof VbRadixSchema>;

// TokenRadix
export const TokenRadixSchema = v.object({});
export type TokenRadix = v.InferOutput<typeof TokenRadixSchema>;

// MicroblockStorage
export const MicroblockStorageSchema = v.object({
    fileIdentifier: v.number(),
    offset: v.number(),
    size: v.number(),
});
export type MicroblockStorage = v.InferOutput<typeof MicroblockStorageSchema>;

// AccountByPublicKey
export const AccountByPublicKeySchema = v.object({
    accountHash: uint8array(),
});
export type AccountByPublicKey = v.InferOutput<typeof AccountByPublicKeySchema>;

// AccountsWithVestingLocks
export const AccountsWithVestingLocksSchema = v.object({});
export type AccountsWithVestingLocks = v.InferOutput<typeof AccountsWithVestingLocksSchema>;

// Escrows
export const EscrowsSchema = v.object({
    payerAccount: uint8array(),
    payeeAccount: uint8array(),
    agentAccount: uint8array(),
});
export type Escrows = v.InferOutput<typeof EscrowsSchema>;

// ValidatorNodeByAddress
export const ValidatorNodeByAddressSchema = v.object({
    validatorNodeHash: uint8array(),
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


// Block information
export const BlockInformationSchema = v.object({
    hash: uint8array(),
    timestamp: v.pipe(v.number(), v.integer(), v.minValue(0)),
    proposerAddress: uint8array(),
    size: v.pipe(v.number(), v.integer(), v.minValue(0)),
    microblockCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
})
export type BlockInformation = v.InferOutput<typeof BlockInformationSchema>;

// Block information
export const BlockContentSchema = v.object({
    microblocks: v.array(v.object({
        hash: uint8array(),
        vbIdentifier: uint8array(),
        vbType: v.number(),
        height: v.number(),
        size: v.number(),
        sectionCount: v.number(),
    })),
});
export type BlockContent = v.InferOutput<typeof BlockContentSchema>;


