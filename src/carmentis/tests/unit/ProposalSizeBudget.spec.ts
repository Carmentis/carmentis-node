import { describe, it, expect } from 'vitest';
import {
    COMET_GRPC_MAX_RECEIVE_MESSAGE_BYTES,
    encodedTxSizeInBytes,
    ProposalSizeBudget,
    protobufVarintSize,
} from '../../abci/ProposalSizeBudget';
import { ResponsePrepareProposal } from '../../../proto/tendermint/abci/types';

/**
 * Mimics the selection loop of PrepareProposal: adds transactions while they fit, stops at the first that does not.
 */
function selectTxs(budget: ProposalSizeBudget, txLengths: number[]): Uint8Array[] {
    const selected: Uint8Array[] = [];
    for (const length of txLengths) {
        if (!budget.canFit(length)) break;
        budget.add(length);
        selected.push(new Uint8Array(length));
    }
    return selected;
}

function encodedResponseSize(txs: Uint8Array[]): number {
    return ResponsePrepareProposal.encode({ txs }).finish().length;
}

describe('ProposalSizeBudget (encoded PrepareProposal response size)', () => {
    it('computes varint sizes at the boundaries', () => {
        expect(protobufVarintSize(0)).toBe(1);
        expect(protobufVarintSize(127)).toBe(1);
        expect(protobufVarintSize(128)).toBe(2);
        expect(protobufVarintSize(16_383)).toBe(2);
        expect(protobufVarintSize(16_384)).toBe(3);
        expect(protobufVarintSize(2_097_151)).toBe(3);
        expect(protobufVarintSize(2_097_152)).toBe(4);
        expect(() => protobufVarintSize(-1)).toThrow();
    });

    it('matches the actual protobuf encoding of ResponsePrepareProposal', () => {
        const lengths = [0, 1, 127, 128, 16_383, 16_384, 1_048_576];
        const txs = lengths.map((length) => new Uint8Array(length));
        const expected = lengths.reduce((sum, length) => sum + encodedTxSizeInBytes(length), 0);
        expect(encodedResponseSize(txs)).toBe(expected);
    });

    it('keeps the response below the CometBFT gRPC limit when raw sizes sum to exactly 4 MiB', () => {
        // 4 txs of 1 MiB: raw sum = 4,194,304 bytes, which passes the raw protocol check but not the transport
        const budget = new ProposalSizeBudget(Number.MAX_SAFE_INTEGER);
        const selected = selectTxs(budget, [1_048_576, 1_048_576, 1_048_576, 1_048_576]);
        expect(selected.length).toBe(3);
        expect(encodedResponseSize(selected)).toBeLessThan(COMET_GRPC_MAX_RECEIVE_MESSAGE_BYTES);
    });

    it('keeps the response below the CometBFT gRPC limit with many tiny transactions (framing dominates)', () => {
        const budget = new ProposalSizeBudget(Number.MAX_SAFE_INTEGER);
        const selected = selectTxs(budget, new Array(3_000_000).fill(1));
        expect(encodedResponseSize(selected)).toBe(budget.getEncodedSizeInBytes());
        expect(budget.getEncodedSizeInBytes()).toBeLessThanOrEqual(budget.getMaxEncodedSizeInBytes());
        expect(encodedResponseSize(selected)).toBeLessThan(COMET_GRPC_MAX_RECEIVE_MESSAGE_BYTES);
        // 3 encoded bytes per 1-byte tx: far fewer txs than a raw-size budget would allow
        expect(selected.length).toBe(Math.floor(budget.getMaxEncodedSizeInBytes() / 3));
    });

    it('honors max_tx_bytes given by CometBFT, using the same size as ComputeProtoSizeForTxs', () => {
        const maxTxBytes = 1_000_000;
        const budget = new ProposalSizeBudget(maxTxBytes);
        expect(budget.getMaxEncodedSizeInBytes()).toBe(maxTxBytes);
        const selected = selectTxs(budget, new Array(100).fill(99_996));
        expect(encodedResponseSize(selected)).toBeLessThanOrEqual(maxTxBytes);
        // 99,996 + 4 (1-byte tag + 3-byte varint) = 100,000 bytes per tx: exactly 10 txs fit
        expect(selected.length).toBe(10);
        expect(encodedResponseSize(selected)).toBe(maxTxBytes);
    });

    it('accepts a transaction that exactly reaches the budget and rejects one more byte', () => {
        const budget = new ProposalSizeBudget(102);
        expect(budget.canFit(99)).toBe(true); // 1 + 1 + 99 = 101
        expect(budget.canFit(100)).toBe(true); // 1 + 1 + 100 = 102
        expect(budget.canFit(101)).toBe(false); // 1 + 1 + 101 = 103
    });

    it('falls back to the transport limit when max_tx_bytes is not set', () => {
        for (const maxTxBytes of [0, -1, NaN]) {
            const budget = new ProposalSizeBudget(maxTxBytes);
            expect(budget.getMaxEncodedSizeInBytes()).toBeLessThan(COMET_GRPC_MAX_RECEIVE_MESSAGE_BYTES);
            expect(budget.getMaxEncodedSizeInBytes()).toBeGreaterThan(0);
        }
    });

    it('uses the smallest of max_tx_bytes and the transport limit', () => {
        const budget = new ProposalSizeBudget(22_020_096);
        expect(budget.getMaxEncodedSizeInBytes()).toBeLessThan(COMET_GRPC_MAX_RECEIVE_MESSAGE_BYTES);
    });
});
