import {
    TestNode, createTestNode, createIssuer, buildAccountCreation,
} from './helpers/testState';
// NB: the helper must be imported first (it loads LevelDb before CachedLevelDb, avoiding a circular import)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Microblock, CMTSToken } from '@cmts-dev/carmentis-sdk-core';
import { CachedStorage } from '../../abci/storage/CachedStorage';
import { CachedLevelDb } from '../../abci/database/CachedLevelDb';
import { Storage } from '../../abci/storage/Storage';

let node: TestNode;
let cachedDb: CachedLevelDb;
let cachedStorage: CachedStorage;

beforeEach(async () => {
    node = await createTestNode();
    cachedDb = new CachedLevelDb(node.db);
    cachedStorage = new CachedStorage(node.storage, cachedDb);
});
afterEach(async () => { await node.cleanup(); });

async function someMicroblock() {
    const issuer = await createIssuer(node);
    const { serialized } = await buildAccountCreation(node, issuer, CMTSToken.createCMTS(1).getAmountAsAtomic());
    return { mb: Microblock.loadFromSerializedMicroblock(serialized), serialized };
}

// expiration day 0 => "endless" storage, file chosen from the first byte of the microblock hash
const fileOf = (mb: Microblock) => Storage.getFileIdentifier(0, mb.getHashAsBytes());

describe('CachedStorage savepoints', () => {
    it('removes the microblocks buffered since the savepoint on rollback', async () => {
        const first = await someMicroblock();
        await cachedStorage.addMicroblockToBuffer(0, first.mb, first.serialized);

        cachedDb.createSavepoint();
        cachedStorage.createSavepoint();
        const second = await someMicroblock();
        await cachedStorage.addMicroblockToBuffer(0, second.mb, second.serialized);
        cachedStorage.rollback();
        cachedDb.rollback();

        expect(cachedStorage.getPendingTransactionsByFileIdentifier(fileOf(first.mb))).toEqual([first.serialized]);
        if (fileOf(second.mb) !== fileOf(first.mb)) {
            expect(cachedStorage.getPendingTransactionsByFileIdentifier(fileOf(second.mb))).toBeUndefined();
        }
        expect(await cachedStorage.readFullMicroblock(second.mb.getHashAsBytes(), false)).toBeUndefined();
        expect(await cachedStorage.readFullMicroblock(first.mb.getHashAsBytes(), false)).toEqual(first.serialized);
    });

    it('keeps the DATA_FILE accounting consistent after a rollback', async () => {
        const first = await someMicroblock();
        await cachedStorage.addMicroblockToBuffer(0, first.mb, first.serialized);
        const dataFileBefore = await cachedDb.getFullDataFileTable();

        cachedDb.createSavepoint();
        cachedStorage.createSavepoint();
        const second = await someMicroblock();
        await cachedStorage.addMicroblockToBuffer(0, second.mb, second.serialized);
        cachedStorage.rollback();
        cachedDb.rollback();

        expect(await cachedDb.getFullDataFileTable()).toEqual(dataFileBefore);
    });

    it('keeps the buffered microblocks on release', async () => {
        const first = await someMicroblock();
        cachedDb.createSavepoint();
        cachedStorage.createSavepoint();
        await cachedStorage.addMicroblockToBuffer(0, first.mb, first.serialized);
        cachedStorage.releaseSavepoint();
        cachedDb.releaseSavepoint();
        expect(cachedStorage.getPendingTransactionsByFileIdentifier(fileOf(first.mb))).toEqual([first.serialized]);
        expect(() => cachedStorage.rollback()).toThrow();
    });
});
