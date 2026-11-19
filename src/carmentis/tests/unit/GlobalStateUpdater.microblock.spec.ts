import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CMTSToken, ECO, Secp256k1PrivateSignatureKey } from '@cmts-dev/carmentis-sdk-core';
import {
    TestNode, createTestNode, createIssuer, buildAccountCreation, buildTransfers, applyMicroblock,
    applyGenesisMicroblock, balanceOf, blockFeesAccountId, stateFingerprint, REFERENCE_TIMESTAMP,
} from './helpers/testState';

const CMTS = (n: number) => CMTSToken.createCMTS(n).getAmountAsAtomic();

let node: TestNode;
beforeEach(async () => { node = await createTestNode(); });
afterEach(async () => { await node.cleanup(); });

/** creates an account funded by `seller` and applies the microblock, failing the test if rejected */
async function fundNewAccount(seller: Awaited<ReturnType<typeof createIssuer>>, amount: number) {
    const { serialized, account } = await buildAccountCreation(node, seller, amount);
    const result = await applyMicroblock(node, serialized);
    expect(result.error).toBeUndefined();
    return { account, serialized };
}

describe('GlobalStateUpdater - valid microblocks', () => {
    it('creates an account funded by the issuer and collects fees', async () => {
        const issuer = await createIssuer(node);
        const { account } = await fundNewAccount(issuer, CMTS(5));

        expect(await balanceOf(node, account.id)).toBe(CMTS(5));
        const fees = await balanceOf(node, blockFeesAccountId());
        expect(fees).toBeGreaterThan(0);
        expect(await balanceOf(node, issuer.id)).toBe(ECO.INITIAL_OFFER - CMTS(5) - fees);
    });

    it('chains transfers and conserves the total supply', async () => {
        const issuer = await createIssuer(node);
        const { account: a } = await fundNewAccount(issuer, CMTS(100));
        const { account: b } = await fundNewAccount(issuer, CMTS(1));
        const { account: c } = await fundNewAccount(issuer, CMTS(1));

        let r = await applyMicroblock(node, await buildTransfers(node, a, [{ to: b.id, amountInAtomics: CMTS(10) }]));
        expect(r.error).toBeUndefined();
        r = await applyMicroblock(node, await buildTransfers(node, b, [{ to: c.id, amountInAtomics: CMTS(4) }]));
        expect(r.error).toBeUndefined();

        const ids = [issuer.id, a.id, b.id, c.id, blockFeesAccountId()];
        const total = (await Promise.all(ids.map((id) => balanceOf(node, id)))).reduce((x, y) => x + y, 0);
        expect(total).toBe(ECO.INITIAL_OFFER);
        expect(await balanceOf(node, c.id)).toBe(CMTS(5));
    });

    it('supports several transfer sections in one microblock', async () => {
        const issuer = await createIssuer(node);
        const { account: a } = await fundNewAccount(issuer, CMTS(100));
        const { account: b } = await fundNewAccount(issuer, CMTS(1));
        const { account: c } = await fundNewAccount(issuer, CMTS(1));
        const r = await applyMicroblock(node, await buildTransfers(node, a, [
            { to: b.id, amountInAtomics: CMTS(3) },
            { to: c.id, amountInAtomics: CMTS(7) },
        ]));
        expect(r.error).toBeUndefined();
        expect(await balanceOf(node, b.id)).toBe(CMTS(4));
        expect(await balanceOf(node, c.id)).toBe(CMTS(8));
    });

    it('is deterministic: two nodes applying the same microblocks reach the same hashes', async () => {
        const other = await createTestNode();
        try {
            const issuer = await createIssuer(node);
            await applyGenesisMicroblock(other, issuer.genesis!);
            const { account: a, serialized: creationA } = await fundNewAccount(issuer, CMTS(50));
            const { account: b, serialized: creationB } = await fundNewAccount(issuer, CMTS(1));
            const transfer = await buildTransfers(node, a, [{ to: b.id, amountInAtomics: CMTS(2) }]);
            expect((await applyMicroblock(node, transfer)).error).toBeUndefined();

            for (const tx of [creationA, creationB, transfer]) {
                expect((await applyMicroblock(other, tx)).error).toBeUndefined();
            }
            const ids = [issuer.id, a.id, b.id, blockFeesAccountId()];
            expect(await stateFingerprint(other, ids)).toEqual(await stateFingerprint(node, ids));
        } finally {
            await other.cleanup();
        }
    });
});

describe('GlobalStateUpdater - rejected microblocks leave the state untouched', () => {
    async function setup() {
        const issuer = await createIssuer(node);
        const { account: a } = await fundNewAccount(issuer, CMTS(10));
        const { account: b } = await fundNewAccount(issuer, 0);
        const ids = [issuer.id, a.id, b.id, blockFeesAccountId()];
        return { issuer, a, b, ids, before: await stateFingerprint(node, ids) };
    }

    async function expectRejected(serialized: Uint8Array, ids: Uint8Array[], before: unknown) {
        const result = await applyMicroblock(node, serialized);
        expect(result.accepted).toBe(false);
        expect(await stateFingerprint(node, ids)).toEqual(before);
        return result;
    }

    it('rejects a transfer exceeding the balance', async () => {
        const { a, b, ids, before } = await setup();
        await expectRejected(await buildTransfers(node, a, [{ to: b.id, amountInAtomics: CMTS(11) }]), ids, before);
    });

    it('rejects a microblock whose fees payer has no funds for the fees', async () => {
        const { b, a, ids, before } = await setup();
        await expectRejected(await buildTransfers(node, b, [{ to: a.id, amountInAtomics: 0 }]), ids, before);
    });

    it('rejects a microblock not signed by the fees payer', async () => {
        const { a, b, ids, before } = await setup();
        const tx = await buildTransfers(node, a, [{ to: b.id, amountInAtomics: CMTS(1) }], {
            signWith: Secp256k1PrivateSignatureKey.gen(),
        });
        await expectRejected(tx, ids, before);
    });

    it('rejects a microblock without fees payer', async () => {
        const { a, b, ids, before } = await setup();
        const tx = await buildTransfers(node, a, [{ to: b.id, amountInAtomics: CMTS(1) }], { feesPayer: null });
        await expectRejected(tx, ids, before);
    });

    it('rejects a microblock whose fees payer does not exist', async () => {
        const { a, b, ids, before } = await setup();
        const tx = await buildTransfers(node, a, [{ to: b.id, amountInAtomics: CMTS(1) }], {
            feesPayer: new Uint8Array(32).fill(7),
        });
        await expectRejected(tx, ids, before);
    });

    it('rejects a fees payer that is not allowed to write on the virtual blockchain', async () => {
        const { issuer, a, b, ids, before } = await setup();
        // the issuer pays and signs, but the microblock extends the account VB of `a`
        const tx = await buildTransfers(node, a, [{ to: b.id, amountInAtomics: CMTS(1) }], {
            feesPayer: issuer.id,
            signWith: issuer.sk,
        });
        await expectRejected(tx, ids, before);
    });

    it('rejects zero gas and a wrongly declared gas', async () => {
        const { a, b, ids, before } = await setup();
        await expectRejected(await buildTransfers(node, a, [{ to: b.id, amountInAtomics: CMTS(1) }], { gas: 0 }), ids, before);
        await expectRejected(await buildTransfers(node, a, [{ to: b.id, amountInAtomics: CMTS(1) }], { gas: 1 }), ids, before);
    });

    it('rejects an account creation whose seller is not the fees payer', async () => {
        const { issuer, a, ids, before } = await setup();
        const { serialized } = await buildAccountCreation(node, issuer, CMTS(1), { sellerAccount: a.id });
        await expectRejected(serialized, ids, before);
    });

    it('rejects an account creation reusing the public key of an existing account', async () => {
        const { issuer, a, ids, before } = await setup();
        const { serialized } = await buildAccountCreation(node, issuer, CMTS(1), { publicKeyOf: a.sk });
        await expectRejected(serialized, ids, before);
    });

    it('rejects an account creation exceeding the seller balance', async () => {
        const { a, ids, before } = await setup();
        const { serialized } = await buildAccountCreation(node, a, CMTS(1000));
        await expectRejected(serialized, ids, before);
    });

    it('rejects a replayed microblock', async () => {
        const { a, b, ids } = await setup();
        const tx = await buildTransfers(node, a, [{ to: b.id, amountInAtomics: CMTS(1) }]);
        expect((await applyMicroblock(node, tx)).accepted).toBe(true);
        const after = await stateFingerprint(node, ids);
        await expectRejected(tx, ids, after);
    });

    it('rejects a microblock with a timestamp far from the block time', async () => {
        const { a, b, ids, before } = await setup();
        const tx = await buildTransfers(node, a, [{ to: b.id, amountInAtomics: CMTS(1) }], {
            timestamp: REFERENCE_TIMESTAMP + 30 * 24 * 3600,
        });
        await expectRejected(tx, ids, before);
    });
});

describe('GlobalStateUpdater - rollback', () => {
    async function setup() {
        const issuer = await createIssuer(node);
        const { account: a } = await fundNewAccount(issuer, CMTS(10));
        const { account: b } = await fundNewAccount(issuer, CMTS(1));
        return { issuer, a, b, ids: [issuer.id, a.id, b.id, blockFeesAccountId()] };
    }

    it('undoes the first sections when a later section of the same microblock fails', async () => {
        const { a, b, ids } = await setup();
        const before = await stateFingerprint(node, ids);
        const updater = node.updater as any;
        const countBefore = updater.processedAndAcceptedMicroblocks.length;
        const feesBefore = updater.totalFees;

        // first transfer is valid, the second one exceeds the balance
        const tx = await buildTransfers(node, a, [
            { to: b.id, amountInAtomics: CMTS(2) },
            { to: b.id, amountInAtomics: CMTS(100) },
        ]);
        const result = await applyMicroblock(node, tx);
        expect(result.accepted).toBe(false);

        expect(await stateFingerprint(node, ids)).toEqual(before);
        expect(updater.processedAndAcceptedMicroblocks.length).toBe(countBefore);
        expect(updater.totalFees).toBe(feesBefore);
    });

    it('releases the savepoint after both a success and a failure', async () => {
        const { a, b } = await setup();
        const bad = await buildTransfers(node, a, [{ to: b.id, amountInAtomics: CMTS(100) }]);
        expect((await applyMicroblock(node, bad)).accepted).toBe(false);
        expect(() => { node.state.createSavepoint(); node.state.releaseSavepoint(); }).not.toThrow();

        const good = await buildTransfers(node, a, [{ to: b.id, amountInAtomics: CMTS(1) }]);
        expect((await applyMicroblock(node, good)).accepted).toBe(true);
        expect(() => { node.state.createSavepoint(); node.state.releaseSavepoint(); }).not.toThrow();
    });

    it('valid / invalid / valid gives the same state as valid / valid', async () => {
        const other = await createTestNode();
        try {
            const issuer = await createIssuer(node);
            await applyGenesisMicroblock(other, issuer.genesis!);
            const { account: a, serialized: creationA } = await fundNewAccount(issuer, CMTS(10));
            const { account: b, serialized: creationB } = await fundNewAccount(issuer, CMTS(1));
            for (const tx of [creationA, creationB]) expect((await applyMicroblock(other, tx)).accepted).toBe(true);

            const tx1 = await buildTransfers(node, a, [{ to: b.id, amountInAtomics: CMTS(1) }]);
            expect((await applyMicroblock(node, tx1)).accepted).toBe(true);
            const invalid = await buildTransfers(node, a, [
                { to: b.id, amountInAtomics: CMTS(1) },
                { to: b.id, amountInAtomics: CMTS(1000) },
            ]);
            expect((await applyMicroblock(node, invalid)).accepted).toBe(false);
            const tx3 = await buildTransfers(node, a, [{ to: b.id, amountInAtomics: CMTS(2) }]);
            expect((await applyMicroblock(node, tx3)).accepted).toBe(true);

            for (const tx of [tx1, tx3]) expect((await applyMicroblock(other, tx)).accepted).toBe(true);
            const ids = [issuer.id, a.id, b.id, blockFeesAccountId()];
            expect(await stateFingerprint(node, ids)).toEqual(await stateFingerprint(other, ids));
        } finally {
            await other.cleanup();
        }
    });
});
