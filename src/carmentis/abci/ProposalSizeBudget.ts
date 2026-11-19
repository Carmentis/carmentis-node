/**
 * Receive limit of the CometBFT gRPC ABCI client.
 *
 * CometBFT v0.38 creates its gRPC client without any call option (abci/client/grpc_client.go), so it keeps the
 * grpc-go default receive limit of 4 MiB. Any response of the application whose protobuf encoding exceeds it is
 * rejected by CometBFT, which then panics when this happens for PrepareProposal.
 */
export const COMET_GRPC_MAX_RECEIVE_MESSAGE_BYTES = 4 * 1024 * 1024;

/**
 * Margin kept below the CometBFT receive limit.
 */
export const PREPARE_PROPOSAL_RESPONSE_SAFETY_MARGIN_BYTES = 16 * 1024;

/**
 * Returns the number of bytes of the protobuf varint encoding of a non-negative integer.
 */
export function protobufVarintSize(value: number): number {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError(`Invalid varint value: ${value}`);
    }
    let size = 1;
    while (value >= 0x80) {
        value = Math.floor(value / 0x80);
        size++;
    }
    return size;
}

/**
 * Returns the encoded size of one transaction in a `repeated bytes txs = 1` field: 1 byte of tag, the varint-encoded
 * length, then the transaction itself.
 *
 * This is both the size added to the encoded ResponsePrepareProposal and the size counted by CometBFT in
 * `types.ComputeProtoSizeForTxs`, which it uses to validate the returned transactions against `max_tx_bytes`.
 */
export function encodedTxSizeInBytes(txLengthInBytes: number): number {
    return 1 + protobufVarintSize(txLengthInBytes) + txLengthInBytes;
}

/**
 * Tracks the encoded size of the transactions selected by PrepareProposal, so that the response never exceeds:
 * - `max_tx_bytes`, given by CometBFT in RequestPrepareProposal (otherwise CometBFT rejects the proposal and panics);
 * - the receive limit of the CometBFT gRPC client, minus a safety margin (otherwise the response is not delivered
 *   and CometBFT panics).
 *
 * This is a local constraint of the proposer, not a consensus rule: it must not be enforced in ProcessProposal.
 */
export class ProposalSizeBudget {
    private readonly maxEncodedSizeInBytes: number;
    private encodedSizeInBytes = 0;

    /**
     * @param maxTxBytes The `max_tx_bytes` field of RequestPrepareProposal. A non-positive value is ignored.
     * @param transportLimitInBytes The maximum size of the encoded response accepted by the transport.
     */
    constructor(
        maxTxBytes: number,
        transportLimitInBytes: number = COMET_GRPC_MAX_RECEIVE_MESSAGE_BYTES - PREPARE_PROPOSAL_RESPONSE_SAFETY_MARGIN_BYTES,
    ) {
        const maxTxBytesLimit = Number.isFinite(maxTxBytes) && maxTxBytes > 0 ? maxTxBytes : Number.MAX_SAFE_INTEGER;
        this.maxEncodedSizeInBytes = Math.min(maxTxBytesLimit, transportLimitInBytes);
    }

    /**
     * Returns true if a transaction of the given length can be added without exceeding the budget.
     */
    canFit(txLengthInBytes: number): boolean {
        return this.encodedSizeInBytes + encodedTxSizeInBytes(txLengthInBytes) <= this.maxEncodedSizeInBytes;
    }

    /**
     * Accounts for a transaction that has been accepted in the proposal.
     */
    add(txLengthInBytes: number): void {
        this.encodedSizeInBytes += encodedTxSizeInBytes(txLengthInBytes);
    }

    getEncodedSizeInBytes(): number {
        return this.encodedSizeInBytes;
    }

    getMaxEncodedSizeInBytes(): number {
        return this.maxEncodedSizeInBytes;
    }
}
