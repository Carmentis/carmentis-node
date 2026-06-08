import { PersistentMerkleTree } from "./PersistentMerkleTree";
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTempLevel } from "../database/TempLevel";

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
