// End-to-end escrow tests going through the real pipeline (consistency checks + GlobalStateUpdater), as
// opposed to AccountManager.locks.spec.ts which calls AccountManager directly.
//
// Escrow model:
//  - the PAYER sends an ACCOUNT_ESCROW_TRANSFER from its own account VB; the funds are locked on the PAYEE;
//  - the AGENT (a third account) settles with an ACCOUNT_ESCROW_SETTLEMENT section, in a microblock that is
//    appended to the AGENT'S OWN account VB, signed and paid by the AGENT (the lock is found through the ESCROWS
//    record, so the VB of the payee is never written);
//  - if nobody settles before the end of the duration, the daily update refunds the payer automatically.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
    BalanceAvailability, CMTSToken, Hash, ProtocolInternalState, Utils, SectionType, VirtualBlockchainType,
} from '@cmts-dev/carmentis-sdk-core';
import {
    TestNode, TestAccount, createTestNode, createIssuer, buildAccountCreation, buildOnAccount, buildTransfers,
    applyMicroblock, balanceOf, cometParameters, REFERENCE_TIMESTAMP,
} from './helpers/testState';

const CMTS = (n: number) => CMTSToken.createCMTS(n).getAmountAsAtomic();
const DAY = 24 * 3600;

let node: TestNode;
beforeEach(async () => { node = await createTestNode(); });
afterEach(async () => { await node.cleanup(); });

async function createAccount(issuer: TestAccount, amount: number) {
    const { serialized, account } = await buildAccountCreation(node, issuer, amount);
    const result = await applyMicroblock(node, serialized);
    expect(result.error).toBeUndefined();
    return account;
}

async function setup(durationDays = 10) {
    const issuer = await createIssuer(node);
    const payer = await createAccount(issuer, CMTS(100));
    const payee = await createAccount(issuer, CMTS(1));
    const agent = await createAccount(issuer, CMTS(5)); // the agent needs funds to pay the fees of the settlement
    const escrowIdentifier = new Uint8Array(randomBytes(32));

    const lockTx = await buildOnAccount(node, payer.id, [{
        type: SectionType.ACCOUNT_ESCROW_TRANSFER,
        account: payee.id,
        amount: CMTS(10),
        escrowIdentifier,
        agentAccount: agent.id,
        durationDays,
        publicReference: '',
        privateReference: '',
    }], payer);
    const result = await applyMicroblock(node, lockTx);
    expect(result.error).toBeUndefined();

    // microblock settling the escrow: appended to the VB of `onVb` (default: the signer's own VB), paid and signed
    // by `signer` (default: the agent)
    const settle = (confirmed: boolean, opts: { signer?: TestAccount, onVb?: TestAccount } = {}) => {
        const signer = opts.signer ?? agent;
        return buildOnAccount(node, (opts.onVb ?? signer).id, [{
            type: SectionType.ACCOUNT_ESCROW_SETTLEMENT, escrowIdentifier, confirmed,
        }], signer, { feesPayer: signer.id });
    };

    return { issuer, payer, payee, agent, escrowIdentifier, settle };
}

describe('Escrow - creation', () => {
    it('locks the funds on the payee until the escrow is settled', async () => {
        const { payer, payee } = await setup();
        expect(await balanceOf(node, payee.id)).toBe(CMTS(1) + CMTS(10));
        const before = await balanceOf(node, payer.id);
        expect(before).toBeLessThan(CMTS(90) + 1);

        // the locked 10 CMTS are not spendable by the payee: only its own 1 CMTS (minus fees) is
        const tx = await buildTransfers(node, payee, [{ to: payer.id, amountInAtomics: CMTS(5) }]);
        expect((await applyMicroblock(node, tx)).accepted).toBe(false);
    });
});

describe('Escrow - lock parameters', () => {
    it('records the payer (not the payee) as the fund emitter of the lock', async () => {
        const { payer, payee, agent } = await setup();
        const state = await node.state.getCachedDatabase().getAccountStateByAccountId(payee.id);
        const lock = new BalanceAvailability(state!.balance, state!.locks).getEscrowLocks()[0];
        expect(Utils.binaryIsEqual(lock.parameters.fundEmitterAccountId, payer.id)).toBe(true);
        expect(Utils.binaryIsEqual(lock.parameters.transferAuthorizerAccountId, agent.id)).toBe(true);
    });
});

describe('Escrow - settlement by the agent (through the microblock pipeline)', () => {
    it('the agent is neither payer nor payee: it settles from its own VB and the payee VB is untouched', async () => {
        const { payee, settle } = await setup();
        const payeeVb = await node.state.loadAccountVirtualBlockchain(Hash.from(payee.id));
        const heightBefore = payeeVb.getHeight();
        expect((await applyMicroblock(node, await settle(true))).accepted).toBe(true);
        const after = await node.state.loadAccountVirtualBlockchain(Hash.from(payee.id));
        expect(after.getHeight()).toBe(heightBefore);
    });

    it('rejects a settlement written by the agent on the payee VB, then accepts it on the agent VB', async () => {
        const { payee, settle } = await setup();
        expect((await applyMicroblock(node, await settle(true, { onVb: payee }))).accepted).toBe(false);
        expect(await balanceOf(node, payee.id)).toBe(CMTS(11));
        expect((await applyMicroblock(node, await settle(true))).accepted).toBe(true);
    });

    it('a payee that is also the agent settles from its own VB', async () => {
        const issuer = await createIssuer(node);
        const payer = await createAccount(issuer, CMTS(100));
        const payee = await createAccount(issuer, CMTS(5));
        const escrowIdentifier = new Uint8Array(randomBytes(32));
        const lockTx = await buildOnAccount(node, payer.id, [{
            type: SectionType.ACCOUNT_ESCROW_TRANSFER, account: payee.id, amount: CMTS(10), escrowIdentifier,
            agentAccount: payee.id, durationDays: 10, publicReference: '', privateReference: '',
        }], payer);
        expect((await applyMicroblock(node, lockTx)).accepted).toBe(true);
        const tx = await buildOnAccount(node, payee.id, [{
            type: SectionType.ACCOUNT_ESCROW_SETTLEMENT, escrowIdentifier, confirmed: true,
        }], payee);
        expect((await applyMicroblock(node, tx)).accepted).toBe(true);
    });

    it('confirmed settlement by the agent is accepted and releases the funds to the payee', async () => {
        const { payer, payee, settle } = await setup();
        const payerBefore = await balanceOf(node, payer.id);

        const result = await applyMicroblock(node, await settle(true));
        expect(result.error).toBeUndefined();
        expect(result.accepted).toBe(true);

        // the payee keeps the funds and can now spend them; the payer is not refunded
        expect(await balanceOf(node, payee.id)).toBe(CMTS(11));
        expect(await balanceOf(node, payer.id)).toBe(payerBefore);
        const spend = await buildTransfers(node, payee, [{ to: payer.id, amountInAtomics: CMTS(5) }]);
        expect((await applyMicroblock(node, spend)).accepted).toBe(true);
    });

    it('cancelled settlement by the agent is accepted and refunds the payer', async () => {
        const { payer, payee, settle } = await setup();
        const payerBefore = await balanceOf(node, payer.id);

        const result = await applyMicroblock(node, await settle(false));
        expect(result.error).toBeUndefined();
        expect(result.accepted).toBe(true);

        expect(await balanceOf(node, payee.id)).toBe(CMTS(1));
        expect(await balanceOf(node, payer.id)).toBe(payerBefore + CMTS(10));
    });

    it('the settlement fees are paid by the agent, not by the payee', async () => {
        const { payee, agent, settle } = await setup();
        const agentBefore = await balanceOf(node, agent.id);
        const payeeBefore = await balanceOf(node, payee.id);
        expect((await applyMicroblock(node, await settle(true))).accepted).toBe(true);
        expect(await balanceOf(node, agent.id)).toBeLessThan(agentBefore);
        expect(await balanceOf(node, payee.id)).toBe(payeeBefore);
    });

    it('the escrow cannot be settled twice', async () => {
        const { settle } = await setup();
        expect((await applyMicroblock(node, await settle(true))).accepted).toBe(true);
        expect((await applyMicroblock(node, await settle(false))).accepted).toBe(false);
    });

    it('rejects a settlement signed by someone who is not the agent (the payee included)', async () => {
        const { payer, payee, settle } = await setup();
        const payerBefore = await balanceOf(node, payer.id);
        expect((await applyMicroblock(node, await settle(false, { signer: payee }))).accepted).toBe(false);
        expect((await applyMicroblock(node, await settle(true, { signer: payer }))).accepted).toBe(false);
        expect(await balanceOf(node, payee.id)).toBe(CMTS(11));
        expect(await balanceOf(node, payer.id)).toBe(payerBefore);
    });

    it('a rejected settlement leaves the lock in place, so it can still be settled by the agent', async () => {
        const { payee, settle } = await setup();
        expect((await applyMicroblock(node, await settle(false, { signer: payee }))).accepted).toBe(false);
        expect((await applyMicroblock(node, await settle(true))).accepted).toBe(true);
    });
});

describe('Escrow - expiration (daily updates)', () => {
    it('refunds the payer when the escrow expires', async () => {
        const { payer, payee } = await setup(10);
        const payerBefore = await balanceOf(node, payer.id);
        await node.updater.updateGlobalStateOnBlock(node.state, cometParameters(3, REFERENCE_TIMESTAMP + 20 * DAY));
        expect(await balanceOf(node, payee.id)).toBe(CMTS(1));
        expect(await balanceOf(node, payer.id)).toBe(payerBefore + CMTS(10));
    });

    it('does not refund before the end of the escrow duration', async () => {
        const { payee } = await setup(10);
        await node.updater.updateGlobalStateOnBlock(node.state, cometParameters(3, REFERENCE_TIMESTAMP + 5 * DAY));
        expect(await balanceOf(node, payee.id)).toBe(CMTS(11));
    });

    // A single inconsistent ESCROWS entry must not prevent the other escrows and the other daily steps from
    // being processed, neither today nor on the following days.
    it('an inconsistent escrow entry does not block the refund of the other escrows', async () => {
        const issuer = await createIssuer(node);
        const bogusPayer = await createAccount(issuer, CMTS(1));
        const bogusPayee = await createAccount(issuer, CMTS(1));
        // ESCROWS entry with no matching lock on the payee (inserted first, so it is processed first)
        await node.state.getCachedDatabase().putEscrow(new Uint8Array(randomBytes(32)), {
            payerAccount: bogusPayer.id, payeeAccount: bogusPayee.id, agentAccount: bogusPayer.id,
        });

        const { payer, payee } = await setup(10);
        const payerBefore = await balanceOf(node, payer.id);

        await node.updater.updateGlobalStateOnBlock(node.state, cometParameters(3, REFERENCE_TIMESTAMP + 20 * DAY));

        expect(await balanceOf(node, payee.id)).toBe(CMTS(1));
        expect(await balanceOf(node, payer.id)).toBe(payerBefore + CMTS(10));
    });

    // Daily steps run in this order: vesting, escrows, staking unlocks, slashing, data file purge.
    // The steps after the escrows must still run when an escrow entry is inconsistent.
    it('an inconsistent escrow entry does not block the following daily steps (staking unlocks)', async () => {
        const issuer = await createIssuer(node);
        const a = await createAccount(issuer, CMTS(1));
        const b = await createAccount(issuer, CMTS(1));
        await node.state.getCachedDatabase().putEscrow(new Uint8Array(randomBytes(32)), {
            payerAccount: a.id, payeeAccount: b.id, agentAccount: a.id,
        });

        const am = node.state.getAccountManager();
        const protocol = ProtocolInternalState.createInitialState();
        const nodeId = new Uint8Array(32).fill(9);
        const min = protocol.getMinimumNodeStakingAmountInAtomics();
        await am.stake(issuer.id, min, VirtualBlockchainType.NODE_VIRTUAL_BLOCKCHAIN, nodeId, protocol);
        await am.planUnstake(issuer.id, min, VirtualBlockchainType.NODE_VIRTUAL_BLOCKCHAIN, nodeId, REFERENCE_TIMESTAMP, protocol);
        expect(await am.getStakedAmount(Hash.from(issuer.id))).toBe(min);

        const afterDelay = REFERENCE_TIMESTAMP + (protocol.getUnstakingDelayInDays() + 10) * DAY;
        await node.updater.updateGlobalStateOnBlock(node.state, cometParameters(3, afterDelay));

        expect(await am.getStakedAmount(Hash.from(issuer.id))).toBe(0);
    });
});
