import {
    TestNode, createTestNode, createIssuer, buildAccountCreation, buildTransfers, applyMicroblock, balanceOf,
} from './helpers/testState';
// NB: the helper must be imported first (it loads LevelDb before CachedLevelDb, avoiding a circular import)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CMTSToken, Hash } from '@cmts-dev/carmentis-sdk-core';
import { GlobalState } from '../../abci/state/GlobalState';

const CMTS = (n: number) => CMTSToken.createCMTS(n).getAmountAsAtomic();

let node: TestNode;
beforeEach(async () => { node = await createTestNode(); });
afterEach(async () => { await node.cleanup(); });

describe('GlobalState commit', () => {
    it('persists accepted microblocks and drops rolled-back ones', async () => {
        const issuer = await createIssuer(node);
        const created = await buildAccountCreation(node, issuer, CMTS(10));
        expect((await applyMicroblock(node, created.serialized)).accepted).toBe(true);
        const a = created.account;

        const rejected = await buildTransfers(node, a, [{ to: issuer.id, amountInAtomics: CMTS(1000) }]);
        expect((await applyMicroblock(node, rejected)).accepted).toBe(false);
        const accepted = await buildTransfers(node, a, [{ to: issuer.id, amountInAtomics: CMTS(1) }]);
        expect((await applyMicroblock(node, accepted)).accepted).toBe(true);

        const balanceBeforeCommit = await balanceOf(node, a.id);
        await node.state.commit();

        // a fresh GlobalState on the same database only sees committed data
        const reopened = new GlobalState(node.db, node.storage);
        const reopenedNode = { ...node, state: reopened } as TestNode;
        expect(await balanceOf(reopenedNode, a.id)).toBe(balanceBeforeCommit);
        expect(balanceBeforeCommit).toBeLessThan(CMTS(10));

        const vb = await reopened.loadAccountVirtualBlockchain(Hash.from(a.id));
        expect(vb.getHeight()).toBe(2); // account creation + accepted transfer, the rejected one is absent
    });

    it('does not persist uncommitted changes', async () => {
        const issuer = await createIssuer(node);
        const created = await buildAccountCreation(node, issuer, CMTS(10));
        expect((await applyMicroblock(node, created.serialized)).accepted).toBe(true);

        const reopened = new GlobalState(node.db, node.storage);
        const reopenedNode = { ...node, state: reopened } as TestNode;
        expect(await balanceOf(reopenedNode, created.account.id)).toBe(0);
    });
});
