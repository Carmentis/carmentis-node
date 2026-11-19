import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
    CMTSToken, ChainReferenceType, ECO, Hash, ProtocolInternalState, Secp256k1PrivateSignatureKey, Utils,
    VirtualBlockchainType,
} from '@cmts-dev/carmentis-sdk-core';
import { TestNode, createTestNode } from './helpers/testState';
import { AccountManager, Transfer } from '../../abci/accounts/AccountManager';
import { ErrorMessages } from '../../abci/accounts/ErrorMessages';

const CMTS = (n: number) => CMTSToken.createCMTS(n).getAmountAsAtomic();
const DAY = 24 * 3600;
const T0 = Math.floor(Date.parse('2026/06/01 00:00') / 1000);
const ref = (n = 0) => ({ type: ChainReferenceType.SECTION as const, microblockHash: Utils.getNullHash(), sectionIndex: n });

let node: TestNode;
let am: AccountManager;
beforeEach(async () => {
    node = await createTestNode();
    am = node.state.getAccountManager();
});
afterEach(async () => { await node.cleanup(); });

/** creates an account holding `amount` atomics, funded from a fresh issuer */
async function newAccount(amount: number) {
    const sk = Secp256k1PrivateSignatureKey.gen();
    const id = new Uint8Array(randomBytes(32));
    await am.createIssuerAccount(await sk.getPublicKey(), id, amount);
    return id;
}

const payment = (from: Uint8Array, to: Uint8Array, amount: number, fees = 0): Transfer => ({
    type: ECO.BK_SENT_PAYMENT, payerAccount: from, payeeAccount: to, amountAsAtomics: amount, feesAsAtomics: fees,
});
const bal = async (id: Uint8Array) => (await am.getAccountBalanceByAccountId(id)).getAmountAsAtomic();

describe('AccountManager - transfers', () => {
    it('debits the amount from the payer and credits the payee', async () => {
        const a = await newAccount(CMTS(10));
        const b = await newAccount(0);
        await am.tokenTransfer(payment(a, b, CMTS(3)), ref(), T0);
        expect(await bal(b)).toBe(CMTS(3));
        expect(await bal(a)).toBe(CMTS(7));
    });

    it('requires amount + fees to be spendable but only debits the amount (fees are charged by a separate transfer)', async () => {
        const a = await newAccount(CMTS(10));
        const b = await newAccount(0);
        await expect(am.tokenTransfer(payment(a, b, CMTS(9), CMTS(2)), ref(), T0)).rejects.toThrow(/insufficient funds/);
        await am.tokenTransfer(payment(a, b, CMTS(9), CMTS(1)), ref(), T0);
        expect(await bal(a)).toBe(CMTS(1));
        expect(await bal(b)).toBe(CMTS(9));
    });

    it('rejects a transfer exceeding the spendable balance (fees included) and changes nothing', async () => {
        const a = await newAccount(CMTS(10));
        const b = await newAccount(0);
        const rootBefore = Utils.binaryToHexa(await am.getAccountRootHash());
        await expect(am.tokenTransfer(payment(a, b, CMTS(10), 1), ref(), T0)).rejects.toThrow(/insufficient funds/);
        expect(await bal(a)).toBe(CMTS(10));
        expect(await bal(b)).toBe(0);
        expect(Utils.binaryToHexa(await am.getAccountRootHash())).toBe(rootBefore);
    });

    it('rejects a payment to an account that does not exist', async () => {
        const a = await newAccount(CMTS(10));
        await expect(am.tokenTransfer(payment(a, new Uint8Array(randomBytes(32)), CMTS(1)), ref(), T0))
            .rejects.toThrow(ErrorMessages.INVALID_PAYEE);
    });

    it('rejects the public key of an existing account', async () => {
        const sk = Secp256k1PrivateSignatureKey.gen();
        const pkBytes = await (await sk.getPublicKey()).getPublicKeyAsBytes();
        expect(await am.isPublicKeyAvailable(pkBytes)).toBe(true);
        await am.saveAccountByPublicKey(new Uint8Array(randomBytes(32)), pkBytes);
        expect(await am.isPublicKeyAvailable(pkBytes)).toBe(false);
        await expect(am.checkPublicKeyAvailabilityOrFail(pkBytes)).rejects.toThrow(ErrorMessages.PUBLIC_KEY_IN_USE);
    });

    it('fails to load an account by an unknown public key hash and rejects an undefined hash', async () => {
        await expect(am.loadAccountIdByPublicKeyHash(new Uint8Array(32))).rejects.toThrow(ErrorMessages.UNKNOWN_ACCOUNT_KEY_HASH);
        await expect(am.loadAccountInformation(undefined as any)).rejects.toThrow(ErrorMessages.UNDEFINED_ACCOUNT_HASH);
    });
});

// NB: these tests call AccountManager directly, with the agent as caller. They do NOT exercise the way
// GlobalStateUpdater invokes escrowSettlement: see Escrow.spec.ts for the end-to-end behavior.
describe('AccountManager - escrow', () => {
    const escrowTransfer = (payer: Uint8Array, payee: Uint8Array, agent: Uint8Array, id: Uint8Array, amount: number): Transfer => ({
        type: ECO.BK_SENT_ESCROW, payerAccount: payer, payeeAccount: payee, amountAsAtomics: amount, feesAsAtomics: 0,
        escrowParameters: {
            escrowIdentifier: id, fundEmitterAccountId: payee, transferAuthorizerAccountId: agent,
            startTimestamp: T0, durationDays: 10,
        },
    });

    async function setup() {
        const payer = await newAccount(CMTS(10));
        const payee = await newAccount(0);
        const agent = await newAccount(0);
        const id = new Uint8Array(randomBytes(32));
        await am.tokenTransfer(escrowTransfer(payer, payee, agent, id, CMTS(4)), ref(), T0);
        return { payer, payee, agent, id };
    }

    it('locks the funds: the payee cannot spend them', async () => {
        const { payer, payee } = await setup();
        expect(await bal(payer)).toBe(CMTS(6));
        expect(await bal(payee)).toBe(CMTS(4));
        const other = await newAccount(0);
        await expect(am.tokenTransfer(payment(payee, other, CMTS(1)), ref(), T0)).rejects.toThrow(/insufficient funds/);
    });

    it('confirmed settlement releases the funds to the payee', async () => {
        const { payer, payee, agent, id } = await setup();
        await am.escrowSettlement(agent, id, true, T0 + DAY, ref());
        expect(await bal(payee)).toBe(CMTS(4));
        expect(await bal(payer)).toBe(CMTS(6));
        const other = await newAccount(0);
        await am.tokenTransfer(payment(payee, other, CMTS(1)), ref(), T0 + DAY);
        expect(await bal(other)).toBe(CMTS(1));
    });

    it('canceled settlement refunds the payer', async () => {
        const { payer, payee, agent, id } = await setup();
        await am.escrowSettlement(agent, id, false, T0 + DAY, ref());
        expect(await bal(payee)).toBe(0);
        expect(await bal(payer)).toBe(CMTS(10));
    });

    it('rejects a settlement by someone other than the agent, or of an unknown/settled escrow', async () => {
        const { payer, agent, id } = await setup();
        await expect(am.escrowSettlement(payer, id, true, T0 + DAY, ref())).rejects.toThrow(/not the agent/);
        await expect(am.escrowSettlement(agent, new Uint8Array(randomBytes(32)), true, T0, ref())).rejects.toThrow(/unknown or out-of-date/);
        await am.escrowSettlement(agent, id, true, T0 + DAY, ref());
        await expect(am.escrowSettlement(agent, id, false, T0 + DAY, ref())).rejects.toThrow(/unknown or out-of-date/);
    });

    it('refunds the payer when the escrow expires, and not before', async () => {
        const { payer, payee, id } = await setup();
        await am.updateExpiredEscrow(id, T0 + 5 * DAY, 10);
        expect(await bal(payee)).toBe(CMTS(4));
        await am.updateExpiredEscrow(id, T0 + 11 * DAY, 11);
        expect(await bal(payee)).toBe(0);
        expect(await bal(payer)).toBe(CMTS(10));
    });
});

describe('AccountManager - vesting', () => {
    it('only releases vested tokens after the cliff, linearly', async () => {
        const payer = await newAccount(CMTS(100));
        const payee = await newAccount(0);
        await am.tokenTransfer({
            type: ECO.BK_SENT_VESTING, payerAccount: payer, payeeAccount: payee,
            amountAsAtomics: CMTS(30), feesAsAtomics: 0,
            vestingParameters: {
                initialVestedAmountInAtomics: CMTS(30), cliffStartTimestamp: T0, cliffDurationDays: 10, vestingDurationDays: 30,
            },
        }, ref(), T0);
        const other = await newAccount(0);

        // locked: balance is there but nothing is spendable
        expect(await bal(payee)).toBe(CMTS(30));
        await expect(am.tokenTransfer(payment(payee, other, 1), ref(), T0)).rejects.toThrow(/insufficient funds/);

        // before the end of the cliff nothing is released
        await am.applyLinearVesting(payee, T0 + 5 * DAY);
        await expect(am.tokenTransfer(payment(payee, other, 1), ref(), T0 + 5 * DAY)).rejects.toThrow(/insufficient funds/);

        // half way through the vesting period, part of it is spendable but not all
        await am.applyLinearVesting(payee, T0 + 25 * DAY);
        await am.tokenTransfer(payment(payee, other, 1), ref(), T0 + 25 * DAY);
        await expect(am.tokenTransfer(payment(payee, other, CMTS(30)), ref(), T0 + 25 * DAY)).rejects.toThrow(/insufficient funds/);

        // after the vesting period everything is spendable
        await am.applyLinearVesting(payee, T0 + 100 * DAY);
        await am.tokenTransfer(payment(payee, other, CMTS(30) - 1), ref(), T0 + 100 * DAY);
        expect(await bal(payee)).toBe(0);
    });
});

describe('AccountManager - node staking, unstaking and slashing', () => {
    const nodeId = () => new Uint8Array(32).fill(9);
    const protocol = () => ProtocolInternalState.createInitialState();
    const NODE = VirtualBlockchainType.NODE_VIRTUAL_BLOCKCHAIN;

    it('stakes within the protocol limits and rejects an amount below the minimum or a wrong object type', async () => {
        const min = protocol().getMinimumNodeStakingAmountInAtomics();
        const acc = await newAccount(min * 2);
        await expect(am.stake(acc, min - 1, NODE, nodeId(), protocol())).rejects.toThrow(/Staking amount/);
        await expect(am.stake(acc, min, VirtualBlockchainType.ACCOUNT_VIRTUAL_BLOCKCHAIN, nodeId(), protocol())).rejects.toThrow();
        await expect(am.stake(acc, 1.5, NODE, nodeId(), protocol())).rejects.toThrow(/integer/);
        await am.stake(acc, min, NODE, nodeId(), protocol());
        expect(await am.getStakedAmount(Hash.from(acc))).toBe(min);
    });

    it('staked tokens are not spendable', async () => {
        const min = protocol().getMinimumNodeStakingAmountInAtomics();
        const acc = await newAccount(min + CMTS(1));
        await am.stake(acc, min, NODE, nodeId(), protocol());
        const other = await newAccount(0);
        await am.tokenTransfer(payment(acc, other, CMTS(1)), ref(), T0);
        await expect(am.tokenTransfer(payment(acc, other, 1), ref(), T0)).rejects.toThrow(/insufficient funds/);
    });

    it('unstaking is delayed, then the unlock frees the funds', async () => {
        const min = protocol().getMinimumNodeStakingAmountInAtomics();
        const acc = await newAccount(min);
        await am.stake(acc, min, NODE, nodeId(), protocol());
        await am.planUnstake(acc, min, NODE, nodeId(), T0, protocol());
        const delay = protocol().getUnstakingDelayInDays();
        const other = await newAccount(0);

        await am.applyNodeStakingUnlocks(acc, T0 + (delay - 1) * DAY);
        await expect(am.tokenTransfer(payment(acc, other, 1), ref(), T0 + (delay - 1) * DAY)).rejects.toThrow(/insufficient funds/);

        await am.applyNodeStakingUnlocks(acc, T0 + (delay + 1) * DAY);
        await am.tokenTransfer(payment(acc, other, 1), ref(), T0 + (delay + 1) * DAY);
        expect(await bal(other)).toBe(1);
    });

    it('rejects unstaking more than staked', async () => {
        const min = protocol().getMinimumNodeStakingAmountInAtomics();
        const acc = await newAccount(min);
        await am.stake(acc, min, NODE, nodeId(), protocol());
        await expect(am.planUnstake(acc, min + 1, NODE, nodeId(), T0, protocol())).rejects.toThrow();
    });

    it('applies a planned slashing once its date is reached, unless it is cancelled', async () => {
        const min = protocol().getMinimumNodeStakingAmountInAtomics();
        const slashed = await newAccount(min);
        const spared = await newAccount(min);
        const id = nodeId();
        await am.stake(slashed, min, NODE, id, protocol());
        await am.stake(spared, min, NODE, id, protocol());
        await am.setSlashing(slashed, id, T0 + 30 * DAY);
        await am.setSlashing(spared, id, T0 + 30 * DAY);
        await am.cancelSlashing(spared, id);

        await am.applyNodeSlashing(slashed, T0 + 29 * DAY);
        await am.applyNodeSlashing(spared, T0 + 31 * DAY);
        expect(await bal(slashed)).toBe(min); // not yet
        expect(await bal(spared)).toBe(min);  // cancelled

        await am.applyNodeSlashing(slashed, T0 + 31 * DAY);
        expect(await bal(slashed)).toBe(0);
    });
});

describe('AccountManager - savepoints', () => {
    it('rollback restores balances, modified accounts and the radix root', async () => {
        const a = await newAccount(CMTS(10));
        const b = await newAccount(0);
        const modifiedBefore = am.getModifiedAccounts().length;
        const rootBefore = Utils.binaryToHexa(await am.getAccountRootHash());

        node.state.createSavepoint();
        await am.tokenTransfer(payment(a, b, CMTS(4)), ref(), T0);
        expect(await bal(b)).toBe(CMTS(4));
        node.state.rollbackToSavepoint();

        expect(await bal(a)).toBe(CMTS(10));
        expect(await bal(b)).toBe(0);
        expect(am.getModifiedAccounts().length).toBe(modifiedBefore);
        expect(Utils.binaryToHexa(await am.getAccountRootHash())).toBe(rootBefore);
    });

    it('release keeps the changes and rollback without savepoint throws', async () => {
        const a = await newAccount(CMTS(10));
        const b = await newAccount(0);
        node.state.createSavepoint();
        await am.tokenTransfer(payment(a, b, CMTS(4)), ref(), T0);
        node.state.releaseSavepoint();
        expect(await bal(b)).toBe(CMTS(4));
        expect(() => am.rollback()).toThrow();
    });
});
