import {PersistentMerkleTree} from "./PersistentMerkleTree";
import {LevelDb} from "../database/LevelDb";
import {mkdtemp, rm} from "fs/promises";
import {join} from "path";
import {tmpdir} from "os";
import {CachedLevelDb} from "../database/CachedLevelDb";
import {describe, it, expect, beforeAll, afterAll} from 'vitest'

export async function createTempLevel() {
    const rand = Math.random().toString(36);
    const dir = await mkdtemp(join(tmpdir(), `level-test-${rand}`))
    const level = new LevelDb(dir);
    const cachedDb = new CachedLevelDb(level);

    return {
        cachedDb,
        async cleanup() {
            await rm(dir, {recursive: true, force: true})
        }
    }
}

let temp: Awaited<ReturnType<typeof createTempLevel>>;

describe('PersistentMerkleTree', () => {
    beforeAll(async () => {
        temp = await createTempLevel();
    })

    afterAll(async () => {
        await temp.cleanup();
    });

    it("Should create and verify proofs correctly", async () => {
        const db = temp.cachedDb;

        for (let size = 1; size <= 8; size++) {
            console.log("size", size);
            const treeId = new Uint8Array(32);
            treeId[0] = size;
            const tree = new PersistentMerkleTree(db, treeId);

            for (let n = 0; n < size; n++) {
                const leaf = new Uint8Array(32);
                leaf[0] = n;
                await tree.addLeaf(n, leaf);
            }
            for (let n = 0; n < size; n++) {
                console.log("tree.addLeaf", tree.addLeaf);
                console.log("tree.getProof", tree.getProof);
                const proof = await tree.getProof(n, size);
                const verified = PersistentMerkleTree.verifyProof(proof);
                expect(verified).toBe(true);
            }
        }
    });
});
