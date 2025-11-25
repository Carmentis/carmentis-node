import { ExecTxResult } from '../../../proto-ts/cometbft/abci/v1/types';

/**
 * Information about a processed microblock.
 */
export interface ProcessedMicroblock {
    hash: Uint8Array;
    vbIdentifier: Uint8Array;
    vbType: number;
    height: number;
    size: number;
    sectionCount: number;
}

/**
 * Result of processing a block, containing transaction results,
 * fees, application hash, and microblock information.
 */
export interface ProcessBlockResult {
    /**
     * Results for each transaction in the block.
     */
    txResults: ExecTxResult[];

    /**
     * Total fees collected from all transactions in the block (in atomic units).
     */
    totalFees: number;

    /**
     * The computed application hash after processing the block.
     */
    appHash: Uint8Array;

    /**
     * Total size of the block in bytes.
     */
    blockSize: number;

    /**
     * List of processed microblocks in this block.
     */
    microblocks: ProcessedMicroblock[];
}
