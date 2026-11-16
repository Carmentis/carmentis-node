// Regression suite derived from audits/abci-2026-11-09/run-1/REPORT.md.
//
// Every test asserts the SECURE behavior: a passing test means the finding is fixed, a failing test means the
// vulnerability is still present. Test names start with the finding identifier of the report.
//
// NOT covered here (too large for a unit test, they need a running CometBFT, the NestJS gRPC server, a crash
// injection harness, the network or deployment files): F-03 (intent ambiguity), F-04, F-09, F-11, F-13,
// F-15, F-16, F-17, F-18, F-19, F-20, F-21, F-25, F-26, F-27, F-29, F-32, F-33, F-34, F-35, F-37, F-38, F-40.
// See the comment at the bottom of the file for the reason of each.
// NB: ./helpers/testState must be imported first (it loads LevelDb before CachedLevelDb, avoiding a circular import).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    TestNode, createTestNode, createIssuer, buildAccountCreation, buildTransfers, buildOnAccount, applyMicroblock,
    balanceOf, cometParameters, stateFingerprint, blockFeesAccountId, REFERENCE_TIMESTAMP, TestAccount,
} from './helpers/testState';
import { randomBytes } from 'node:crypto';
import {
    CMTSToken, ECO, Economics, Hash, Microblock, Provider, ProtocolInternalState, Secp256k1PrivateSignatureKey, SectionType, Utils,
    VirtualBlockchainType, ChainReferenceType,
} from '@cmts-dev/carmentis-sdk-core';
import { CachedLevelDb } from '../../abci/database/CachedLevelDb';
import { Transfer } from '../../abci/accounts/AccountManager';

const CMTS = (n: number) => CMTSToken.createCMTS(n).getAmountAsAtomic();
const DAY = 24 * 3600;
const T0 = REFERENCE_TIMESTAMP;
const NODE_TYPE = VirtualBlockchainType.NODE_VIRTUAL_BLOCKCHAIN;
const protocol = () => ProtocolInternalState.createInitialState();
const ref = () => ({ type: ChainReferenceType.SECTION as const, microblockHash: Utils.getNullHash(), sectionIndex: 0 });
const burntAccountId = () => Economics.getSpecialAccountTypeIdentifier(ECO.ACCOUNT_BURNT_TOKENS);

let node: TestNode;
beforeEach(async () => { node = await createTestNode(); });
afterEach(async () => { await node.cleanup(); });

/** creates a standalone account holding `amount` atomics (no virtual blockchain), for AccountManager-level tests */
async function rawAccount(amount: number) {
    const sk = Secp256k1PrivateSignatureKey.gen();
    const id = new Uint8Array(randomBytes(32));
    await node.state.getAccountManager().createIssuerAccount(await sk.getPublicKey(), id, amount);
    return id;
}

/** creates, through a microblock, an account funded by `issuer` */
async function createAccount(issuer: TestAccount, amount: number) {
    const { serialized, account } = await buildAccountCreation(node, issuer, amount);
    const result = await applyMicroblock(node, serialized);
    expect(result.error).toBeUndefined();
    return account;
}

const stakeInfo = async (id: Uint8Array) => (await node.state.getAccountManager().getStakedAmount(Hash.from(id)));
const balance = async (id: Uint8Array) => (await node.state.getAccountManager().getAccountBalanceByAccountId(id)).getAmountAsAtomic();

/** the daily steps of GlobalStateUpdater.updateGlobalStateOnBlock concerning staking, in the same order */
async function stakingDailyJob(id: Uint8Array, timestamp: number) {
    const am = node.state.getAccountManager();
    await am.applyNodeStakingUnlocks(id, timestamp);
    await am.applyNodeSlashing(id, timestamp);
}

// ---------------------------------------------------------------------------------------------------------------
describe('Staking and slashing (F-06, F-07, F-10, F-23, F-31)', () => {
    const nodeId = new Uint8Array(32).fill(9);

    it('F-06: an executed unstake plan is not re-applied on the following days', async () => {
        const min = protocol().getMinimumNodeStakingAmountInAtomics();
        const am = node.state.getAccountManager();
        const acc = await rawAccount(min * 2);
        await am.stake(acc, min * 2, NODE_TYPE, nodeId, protocol());
        await am.planUnstake(acc, min, NODE_TYPE, nodeId, T0, protocol());

        const firstDay = T0 + (protocol().getUnstakingDelayInDays() + 1) * DAY;
        await am.applyNodeStakingUnlocks(acc, firstDay);
        expect(await stakeInfo(acc)).toBe(min);

        // the next days must neither throw nor unstake the remaining half
        for (let d = 1; d <= 3; d++) {
            await expect(am.applyNodeStakingUnlocks(acc, firstDay + d * DAY)).resolves.not.toThrow();
            expect(await stakeInfo(acc)).toBe(min);
        }
    });

    it('F-07: a partial unstake followed by a slashing never makes locks or balances negative', async () => {
        const min = protocol().getMinimumNodeStakingAmountInAtomics();
        const am = node.state.getAccountManager();
        const acc = await rawAccount(min * 2);
        await am.stake(acc, min * 2, NODE_TYPE, nodeId, protocol());
        await am.planUnstake(acc, min, NODE_TYPE, nodeId, T0, protocol());
        await am.setSlashing(acc, nodeId, T0 + 30 * DAY); // misbehavior on the same day: slash amount frozen at 2 * min

        const day = T0 + 31 * DAY;
        await stakingDailyJob(acc, day);

        expect(await stakeInfo(acc)).toBeGreaterThanOrEqual(0);
        expect(await balance(acc)).toBeGreaterThanOrEqual(0);
    });

    it('F-10: planning a full unstake before the misbehavior does not evade the slashing', async () => {
        const min = protocol().getMinimumNodeStakingAmountInAtomics();
        const am = node.state.getAccountManager();
        const acc = await rawAccount(min);
        await am.stake(acc, min, NODE_TYPE, nodeId, protocol());
        await am.planUnstake(acc, min, NODE_TYPE, nodeId, T0, protocol());
        await am.setSlashing(acc, nodeId, T0 + 31 * DAY); // misbehavior (and evidence) the day after

        await stakingDailyJob(acc, T0 + 32 * DAY);

        expect(await balance(acc)).toBeLessThan(min);
    });

    it('F-23: repeated misbehavior does not postpone the slashing date', async () => {
        const min = protocol().getMinimumNodeStakingAmountInAtomics();
        const am = node.state.getAccountManager();
        const acc = await rawAccount(min);
        await am.stake(acc, min, NODE_TYPE, nodeId, protocol());
        await am.setSlashing(acc, nodeId, T0 + 30 * DAY);
        await am.setSlashing(acc, nodeId, T0 + 50 * DAY); // new evidence 20 days later

        await am.applyNodeSlashing(acc, T0 + 31 * DAY);

        expect(await balance(acc)).toBeLessThan(min);
    });

    it('F-31: slashed tokens are credited to the burnt account (conservation of the supply)', async () => {
        const min = protocol().getMinimumNodeStakingAmountInAtomics();
        const am = node.state.getAccountManager();
        const acc = await rawAccount(min);
        const burntBefore = await balance(burntAccountId());
        await am.stake(acc, min, NODE_TYPE, nodeId, protocol());
        await am.setSlashing(acc, nodeId, T0 + 30 * DAY);
        await am.applyNodeSlashing(acc, T0 + 31 * DAY);

        const slashed = min - (await balance(acc));
        expect(slashed).toBeGreaterThan(0);
        expect((await balance(burntAccountId())) - burntBefore).toBe(slashed);
    });
});

// ---------------------------------------------------------------------------------------------------------------
describe('Escrow (F-02, F-22)', () => {
    it('F-02: a failing expiry refund does not leave the escrowed funds spendable by the payee', async () => {
        const am = node.state.getAccountManager();
        const payer = await rawAccount(CMTS(10));
        const payee = await rawAccount(0);
        const agent = await rawAccount(0);
        const escrowIdentifier = new Uint8Array(randomBytes(32));
        const transfer: Transfer = {
            type: ECO.BK_SENT_ESCROW, payerAccount: payer, payeeAccount: payee, amountAsAtomics: CMTS(4), feesAsAtomics: 0,
            escrowParameters: {
                escrowIdentifier, fundEmitterAccountId: payee, transferAuthorizerAccountId: agent,
                startTimestamp: T0, durationDays: 10,
            },
        };
        await am.tokenTransfer(transfer, ref(), T0);
        // corrupt the ESCROWS record so that the refund fails (the payer does not exist)
        await node.state.getCachedDatabase().putEscrow(escrowIdentifier, {
            payerAccount: new Uint8Array(randomBytes(32)), payeeAccount: payee, agentAccount: agent,
        });

        // daily update after the expiration
        await node.updater.updateGlobalStateOnBlock(node.state, cometParameters(3, T0 + 20 * DAY));

        // either the refund happened or the lock is still there: in both cases the payee cannot keep the funds
        const payeeBalance = await balance(payee);
        const payerBalance = await balance(payer);
        if (payerBalance === CMTS(10)) {
            expect(payeeBalance).toBe(0);
        } else {
            const other = await rawAccount(0);
            await expect(am.tokenTransfer({
                type: ECO.BK_SENT_PAYMENT, payerAccount: payee, payeeAccount: other, amountAsAtomics: CMTS(4), feesAsAtomics: 0,
            }, ref(), T0 + 20 * DAY)).rejects.toThrow();
        }
    });

    it('F-22: an absurd escrow duration is rejected', async () => {
        const issuer = await createIssuer(node);
        const payer = await createAccount(issuer, CMTS(100));
        const payee = await createAccount(issuer, CMTS(1));
        const agent = await createAccount(issuer, CMTS(1));
        const tx = await buildOnAccount(node, payer.id, [{
            type: SectionType.ACCOUNT_ESCROW_TRANSFER,
            account: payee.id, amount: CMTS(10), escrowIdentifier: new Uint8Array(randomBytes(32)),
            agentAccount: agent.id, durationDays: 1e12, publicReference: '', privateReference: '',
        }], payer);
        expect((await applyMicroblock(node, tx)).accepted).toBe(false);
    });
});

// ---------------------------------------------------------------------------------------------------------------
describe('Transaction processing', () => {
    async function setup() {
        const issuer = await createIssuer(node);
        const a = await createAccount(issuer, CMTS(10));
        const b = await createAccount(issuer, CMTS(1));
        return { issuer, a, b, ids: [issuer.id, a.id, b.id, blockFeesAccountId()] };
    }

    it('F-05: the partial writes of a failed microblock cannot be spent by a following one (phantom credit)', async () => {
        const { a, b, ids } = await setup();
        const before = await stateFingerprint(node, ids);

        // tx1: a valid credit of 5 CMTS to b, followed by a section that fails
        const tx1 = await buildTransfers(node, a, [
            { to: b.id, amountInAtomics: CMTS(5) },
            { to: b.id, amountInAtomics: CMTS(1000) },
        ]);
        expect((await applyMicroblock(node, tx1)).accepted).toBe(false);
        expect(await stateFingerprint(node, ids)).toEqual(before);

        // tx2: b spends the phantom credit (b only owns 1 CMTS)
        const tx2 = await buildTransfers(node, b, [{ to: a.id, amountInAtomics: CMTS(4) }]);
        expect((await applyMicroblock(node, tx2)).accepted).toBe(false);
    });

    it('F-24: a microblock with trailing padding bytes is rejected (only the canonical encoding is accepted)', async () => {
        const { a, b } = await setup();
        const tx = await buildTransfers(node, a, [{ to: b.id, amountInAtomics: CMTS(1) }]);
        const padded = new Uint8Array(tx.length + 1024);
        padded.set(tx);
        expect((await applyMicroblock(node, padded)).accepted).toBe(false);
    });

    it('F-30: the computed gas only depends on signed data (not on the unsigned signature schemeId)', async () => {
        const { a, b } = await setup();
        const tx = await buildTransfers(node, a, [{ to: b.id, amountInAtomics: CMTS(1) }]);
        const gasWith = async (schemeId: number) => {
            const mb = Microblock.loadFromSerializedMicroblock(tx);
            const signature = mb.getAllSections().find((section) => section.type === SectionType.SIGNATURE) as any;
            signature.schemeId = schemeId;
            return node.state.computeMicroblockGas(mb, { referenceTimestampInSeconds: T0 });
        };
        const original = Microblock.loadFromSerializedMicroblock(tx);
        const declared = (original.getAllSections().find((section) => section.type === SectionType.SIGNATURE) as any).schemeId;
        const gasOriginal = await gasWith(declared);
        for (const other of [0, 1, 2, 3, 255].filter((id) => id !== declared)) {
            expect(await gasWith(other)).toBe(gasOriginal);
        }
    });

    it('F-36: an account cannot be created for a public key whose owner did not sign', async () => {
        const issuer = await createIssuer(node);
        // the new account key never signs: the microblock is only signed by the seller
        const { serialized } = await buildAccountCreation(node, issuer, CMTS(1));
        expect((await applyMicroblock(node, serialized)).accepted).toBe(false);
    });
});

// ---------------------------------------------------------------------------------------------------------------
describe('Block processing and persistence', () => {
    it('F-28: evidence of misbehavior for an unregistered validator does not make the block processing throw', async () => {
        const params = {
            ...cometParameters(3, T0 + DAY),
            blockMisbehaviors: [{
                type: 1, height: 2, time: undefined, total_voting_power: 10,
                validator: { address: new Uint8Array(20).fill(5), power: 10 },
            }],
        } as any;
        await expect(node.updater.updateGlobalStateOnBlock(node.state, params)).resolves.not.toThrow();
    });

    it('F-39: a key deleted in the cache is not read back from the database', async () => {
        const cached = new CachedLevelDb(node.db);
        const table = 1;
        const key = new Uint8Array([1, 2, 3]);
        await cached.putRaw(table, key, new Uint8Array([9]));
        await cached.commit();
        expect(await cached.getRaw(table, key)).toEqual(new Uint8Array([9]));

        await cached.del(table, key);
        expect(await cached.getRaw(table, key)).toBeUndefined();
    });

    it('F-14: a failure while writing the LevelDB batch is reported to the caller of commit()', async () => {
        const issuer = await createIssuer(node);
        await createAccount(issuer, CMTS(1));
        // LevelDb.getBatch().write() catches the underlying error and RETURNS it instead of throwing:
        // simulate this contract for a failing write (e.g. disk full).
        const realGetBatch = node.db.getBatch.bind(node.db);
        (node.db as any).getBatch = () => {
            const batch = realGetBatch();
            (batch as any).write = async () => new Error('ENOSPC: no space left on device');
            return batch;
        };
        await expect(node.state.commit()).rejects.toThrow();
    });
});

// ---------------------------------------------------------------------------------------------------------------
/** seals and serializes a freshly created (genesis) microblock paid and signed by `payer` */
async function sealGenesis(mb: Microblock, payer: TestAccount) {
    mb.setFeesPayerAccount(payer.id);
    mb.setTimestamp(T0);
    mb.setGasPrice(CMTSToken.createMilliToken(1));
    await mb.setGasAndSeal(node.state as unknown as Provider, payer.sk);
    return { serialized: new Uint8Array(mb.serialize().microblockData), id: mb.getHashAsBytes() };
}

async function createOrganization(owner: TestAccount) {
    const mb = Microblock.createGenesisOrganizationMicroblock();
    mb.addSections([
        { type: SectionType.ORG_CREATION, accountId: owner.id },
        { type: SectionType.ORG_DESCRIPTION, name: 'ACME', website: '', countryCode: 'FR', city: 'Paris' },
    ]);
    const { serialized, id } = await sealGenesis(mb, owner);
    const result = await applyMicroblock(node, serialized);
    expect(result.error).toBeUndefined();
    return id;
}

/** builds a validator-node genesis microblock declaring the given CometBFT key (not applied) */
async function buildValidatorNode(owner: TestAccount, organizationId: Uint8Array, cometKey: Uint8Array, keyType = 'tendermint/PubKeyEd25519') {
    const mb = Microblock.createGenesisValidatorNodeMicroblock();
    mb.addSections([
        { type: SectionType.VN_CREATION, organizationId },
        { type: SectionType.VN_COMETBFT_PUBLIC_KEY_DECLARATION, cometPublicKey: Buffer.from(cometKey).toString('base64'), cometPublicKeyType: keyType },
        { type: SectionType.VN_RPC_ENDPOINT, rpcEndpoint: 'http://localhost:26657' },
    ]);
    return sealGenesis(mb, owner);
}

describe('Validator nodes (F-01, F-12)', () => {
    async function setup() {
        const issuer = await createIssuer(node);
        const victim = await createAccount(issuer, CMTS(10));
        const squatter = await createAccount(issuer, CMTS(10));
        return { victim, squatter, victimOrg: await createOrganization(victim), squatterOrg: await createOrganization(squatter) };
    }
    const key = () => new Uint8Array(randomBytes(32));

    it('a validator node with a well-formed key is accepted (sanity check of the setup)', async () => {
        const { victim, victimOrg } = await setup();
        const { serialized } = await buildValidatorNode(victim, victimOrg, key());
        const result = await applyMicroblock(node, serialized);
        expect(result.error).toBeUndefined();
        expect(result.accepted).toBe(true);
    });

    it('F-01: a second validator node cannot declare a CometBFT key already declared by another node', async () => {
        const { victim, squatter, victimOrg, squatterOrg } = await setup();
        const k = key();
        // the victim declares its key; the node is not approved yet, so there is no VALIDATOR_SET record
        const first = await buildValidatorNode(victim, victimOrg, k);
        expect((await applyMicroblock(node, first.serialized)).accepted).toBe(true);

        const squat = await buildValidatorNode(squatter, squatterOrg, k);
        expect((await applyMicroblock(node, squat.serialized)).accepted).toBe(false);
    });

    it('F-12: a malformed CometBFT key (wrong length) is rejected at declaration', async () => {
        const { victim, victimOrg } = await setup();
        const { serialized } = await buildValidatorNode(victim, victimOrg, new Uint8Array(randomBytes(16)));
        expect((await applyMicroblock(node, serialized)).accepted).toBe(false);
    });

    it('F-12: an unsupported CometBFT key type is rejected at declaration', async () => {
        const { victim, victimOrg } = await setup();
        const { serialized } = await buildValidatorNode(victim, victimOrg, key(), 'tendermint/PubKeySecp256k1');
        expect((await applyMicroblock(node, serialized)).accepted).toBe(false);
    });
});

// ---------------------------------------------------------------------------------------------------------------
describe('Application ledgers (F-08)', () => {
    async function createLedger(owner: TestAccount, organizationId: Uint8Array) {
        const app = Microblock.createGenesisApplicationMicroblock();
        app.addSections([
            { type: SectionType.APP_CREATION, organizationId },
            { type: SectionType.APP_DESCRIPTION, name: 'app', logoUrl: '', homepageUrl: '', description: '' },
        ]);
        const appSealed = await sealGenesis(app, owner);
        const appResult = await applyMicroblock(node, appSealed.serialized);
        expect(appResult.error).toBeUndefined();

        const ledger = Microblock.createGenesisApplicationLedgerMicroblock();
        ledger.addSections([{ type: SectionType.APP_LEDGER_CREATION, applicationId: appSealed.id }]);
        const ledgerSealed = await sealGenesis(ledger, owner);
        const ledgerResult = await applyMicroblock(node, ledgerSealed.serialized);
        expect(ledgerResult.error).toBeUndefined();
        return ledgerSealed.id;
    }

    async function setup() {
        const issuer = await createIssuer(node);
        const owner = await createAccount(issuer, CMTS(10));
        const attacker = await createAccount(issuer, CMTS(10));
        const org = await createOrganization(owner);
        const ledgerId = await createLedger(owner, org);
        return { owner, attacker, ledgerId };
    }

    it('F-08: a stranger cannot make itself a writer of someone else\'s application ledger', async () => {
        const { attacker, ledgerId } = await setup();
        const vb = await node.state.loadApplicationLedgerVirtualBlockchain(Hash.from(ledgerId));
        const mb = await vb.createMicroblock();
        mb.addSections([{ type: SectionType.ALLOWED_ADDITIONAL_WRITER, allowedWriterAccountId: attacker.id }]);
        const { serialized } = await (async () => {
            mb.setFeesPayerAccount(attacker.id);
            mb.setTimestamp(T0);
            mb.setGasPrice(CMTSToken.createMilliToken(1));
            await mb.setGasAndSeal(node.state as unknown as Provider, attacker.sk);
            return { serialized: new Uint8Array(mb.serialize().microblockData) };
        })();
        expect((await applyMicroblock(node, serialized)).accepted).toBe(false);
    });

    it('the owner of the ledger can add a writer (sanity check of the setup)', async () => {
        const { owner, attacker, ledgerId } = await setup();
        const vb = await node.state.loadApplicationLedgerVirtualBlockchain(Hash.from(ledgerId));
        const mb = await vb.createMicroblock();
        mb.addSections([{ type: SectionType.ALLOWED_ADDITIONAL_WRITER, allowedWriterAccountId: attacker.id }]);
        mb.setFeesPayerAccount(owner.id);
        mb.setTimestamp(T0);
        mb.setGasPrice(CMTSToken.createMilliToken(1));
        await mb.setGasAndSeal(node.state as unknown as Provider, owner.sk);
        const result = await applyMicroblock(node, new Uint8Array(mb.serialize().microblockData));
        expect(result.error).toBeUndefined();
        expect(result.accepted).toBe(true);
    });
});

// ---------------------------------------------------------------------------------------------------------------
// Findings NOT covered by this suite, and why:
//  F-03  fee share weighting: the intended rule is ambiguous (Q-04), no behavior to assert.
//  F-04  4 MiB gRPC limit and F-26 vote extensions: need the NestJS gRPC server and a CometBFT client.
//  F-09  CheckTx admitting fundless txs: CheckTx lives in AbciService (NestJS wiring, see tests/local, excluded).
//  F-11  unauthenticated ABCI gRPC / InitChain wipe: deployment and network configuration.
//  F-13  crash in the commit window: needs crash injection between the file append and the LevelDB batch.
//  F-15, F-16, F-19, F-27  state sync and genesis snapshots: need the snapshot manager and peers/HTTP.
//  F-17  expired file cleanup: needs Storage on a real directory tree plus the daily cleaner (dead code).
//  F-18  empty validator set guard: needs approved validators with stake and a full validator-set update cycle.
//  F-20  unbounded validator-node index: a performance/scale property, not a pass/fail unit test.
//  F-21  PROTOCOL_UPDATE validation: needs a governance organization and protocol VB (large setup).
//  F-25, F-32  queries: need the AbciService Query handler.
//  F-29, F-35  InitChain/Info handshake and multi-validator genesis: need the full ABCI lifecycle.
//  F-33, F-34  needs_validation in the audit itself (I/O faults, handler serialization).
//  F-37, F-38  governance tip racing and negative vesting release (delay only): low impact, large setup.
//  F-40  minimum gas price config key mismatch: configuration loading, not state logic.
