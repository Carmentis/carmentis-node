import { AccountManager } from '../abci/accounts/AccountManager';
import { CachedLevelDb } from '../abci/database/CachedLevelDb';

import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { LevelDb } from '../abci/database/LevelDb';
import {
    CMTSToken,
    PrivateSignatureKey,
    PublicSignatureKey,
    Secp256k1,
    Secp256k1PrivateSignatureKey,
    Utils,
} from '@cmts-dev/carmentis-sdk/server';
import { randomBytes } from 'node:crypto';

export async function createTempLevel() {
    const rand = Math.random().toString(36);
    const dir = await mkdtemp(join(tmpdir(), `level-test-${rand}`))
    const level = new LevelDb(dir);
    const cachedDb = new CachedLevelDb(level);

    return {
        cachedDb,
        async cleanup() {
            await rm(dir, { recursive: true, force: true })
        }
    }
}

let temp: Awaited<ReturnType<typeof createTempLevel>>;
describe('AccountManager', () => {
    beforeAll(async () => {
        temp = await createTempLevel();
    })

    afterAll(async () => {
        await temp.cleanup();
    });


    it("Should manipulate accounts correctly", async () => {
        const db = temp.cachedDb;
        const accountManager = new AccountManager(db);

        // should create several zero-balance accounts based on public keys
        const publicKeys = [];
        const accountIds: Uint8Array[] = [];

        // we now create the account for the issuer
        const issuerAccountInitialAmount = CMTSToken.createCMTS(100000);
        const issuerAccountPrivateKey = Secp256k1PrivateSignatureKey.gen();
        const issuerAccountPublicKey = await issuerAccountPrivateKey.getPublicKey();
        const issuerAccountId = randomBytes(32);
        await accountManager.createIssuerAccount(
            issuerAccountPublicKey,
            issuerAccountId,
            issuerAccountInitialAmount.getAmountAsAtomic()
        );
        const issuerAccountBalance = await accountManager.getAccountBalanceByAccountId(issuerAccountId);
        expect(issuerAccountBalance.getAmountAsAtomic()).toEqual(issuerAccountInitialAmount.getAmountAsAtomic());

        for (let index = 0; index < 100; index++) {
            const sk =  Secp256k1PrivateSignatureKey.gen();
            const pk = await sk.getPublicKey();
            const pkBytes = await pk.getPublicKeyAsBytes();
            publicKeys.push(pk);

            // expect the public key to be available
            expect(await accountManager.isPublicKeyAvailable(pkBytes))
                .toBeTruthy();

            // create the account
            // TODO(explain): the account creation is done using only pk: the id of the account is the
            // hash of the pk. Why not the the hash of the first account microblock?
            //await accountManager.createAccountWithNoTokens(pk);
            const randomAccountId = randomBytes(32);
            await accountManager.saveAccountByPublicKey(randomAccountId, pkBytes);
            const accountId = await accountManager.loadAccountByPublicKey(pk);
            expect(randomAccountId).toEqual(accountId);
            accountIds.push(accountId)

            // each account should have a balance of 0
            const balance = await accountManager.getAccountBalanceByAccountId(accountId)
            expect(balance.getAmountAsAtomic()).toEqual(0);

            // expect the public key to be not available anymore
            expect(await accountManager.isPublicKeyAvailable(pkBytes))
                .toBeFalsy();
        }


        // feeds accounts randomly
        const balanceForAccounts = new Map<Uint8Array, CMTSToken>([
            [issuerAccountId, issuerAccountBalance]
        ]);
        for (const accountId of accountIds) {
            const randomBalance = CMTSToken.createCMTS(
                Number.parseInt((Math.random() * 100).toString())
            )
            await accountManager.transferToken(issuerAccountId, accountId, randomBalance.getAmountAsAtomic())
            balanceForAccounts.set(accountId, randomBalance);

            // each account should have the specified balance
            const balance = await accountManager.getAccountBalanceByAccountId(accountId)
            expect(balance.getAmountAsAtomic()).toEqual(randomBalance.getAmountAsAtomic());

        }

        // we now perform the stake
        for (const accountId of accountIds) {
            const accountBalance = balanceForAccounts.get(accountId);
            const percentToStack = Math.random();
            const dumbType = 1;
            const dumbId = Utils.getNullHash();
            /*
            await accountManager.stake(
                accountId,
                accountBalance.getAmountAsAtomic() * percentToStack,
                dumbType,
                dumbId,
                );

             */
        }



    })
})