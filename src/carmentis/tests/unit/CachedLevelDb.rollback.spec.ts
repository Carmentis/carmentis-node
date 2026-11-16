import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTempLevel } from '../../abci/database/TempLevel';
import { LevelDbTable } from '../../abci/database/LevelDbTable';

let temp: Awaited<ReturnType<typeof createTempLevel>>;
const T = LevelDbTable.VB_RADIX;
const k = (n: number) => new Uint8Array([n]);
const v = (n: number) => new Uint8Array([n, n]);

describe('CachedLevelDb savepoints', () => {
    beforeAll(async () => { temp = await createTempLevel(); });
    afterAll(async () => { await temp.cleanup(); });

    it('rolls back insertions, overwrites and deletions', async () => {
        const db = temp.cachedDb;
        await db.putRaw(T, k(1), v(1));
        await db.putRaw(T, k(2), v(2));
        await db.putRaw(T, k(3), v(3)); // cached insertion before the savepoint

        db.createSavepoint();
        await db.putRaw(T, k(1), v(9)); // overwrite pre-savepoint
        await db.putRaw(T, k(3), v(8)); // overwrite cached
        await db.del(T, k(2));          // delete pre-savepoint
        await db.putRaw(T, k(4), v(4)); // new key
        await db.del(T, k(4));          // new key then delete
        db.rollback();

        expect(await db.getRaw(T, k(1))).toEqual(v(1));
        expect(await db.getRaw(T, k(2))).toEqual(v(2));
        expect(await db.getRaw(T, k(3))).toEqual(v(3));
        expect(await db.getRaw(T, k(4))).toBeUndefined();
        const keys = (await db.getKeys(T)).map((x) => x[0]).sort();
        expect(keys).toEqual([1, 2, 3]);
    });

    it('keeps modifications on release', async () => {
        const db = temp.cachedDb;
        db.createSavepoint();
        await db.putRaw(T, k(5), v(5));
        db.releaseSavepoint();
        expect(await db.getRaw(T, k(5))).toEqual(v(5));
        expect(() => db.rollback()).toThrow();
    });
});
