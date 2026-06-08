import { RadixTree } from "./RadixTree";
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTempLevel } from "../database/TempLevel";
import { LevelDbTable } from "../database/LevelDbTable";
import { verifyRadixProof, Utils } from "@cmts-dev/carmentis-sdk-core";

let temp: Awaited<ReturnType<typeof createTempLevel>>;

describe('RadixTree', () => {
    beforeAll(async () => {
        temp = await createTempLevel();
    })

    afterAll(async () => {
        await temp.cleanup();
    });

    it("Should set values, retrieve values and verify proofs correctly", async () => {
        const tree = new RadixTree(temp.cachedDb, LevelDbTable.VB_RADIX);
        const N_KEYS = 100;
        const N_UNKNOWN_KEYS = 100;
        const N_WRITES = 1000;
        const keys = [...Array(N_KEYS)].map(() => randomHash());
        const store = new Map<string, Uint8Array>;

        for (let n = 0; n < N_WRITES; n++) {
            const key = keys[Math.floor(Math.random() * N_KEYS)];
            const value = randomHash();
            store.set(Utils.binaryToHexa(key), value);
            await tree.set(key, value);
        }

        const rootHash = await tree.getRootHash();

        for (const [keyAsHex, value] of store) {
            const key = Utils.binaryFromHexa(keyAsHex);
            const { value: storedValue, proof } = await tree.get(key);
            expect(storedValue).toEqual(value);
            const verified = await verifyRadixProof(key, value, proof);
            expect(verified).toEqual(rootHash);
        }
        for (let n = 0; n < N_UNKNOWN_KEYS; n++) {
            const unknownKey = randomHash();
            const { value } = await tree.get(unknownKey);
            expect(value).toEqual(null);
        }
    });
});

function randomHash() {
    const hash = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
        hash[i] = Math.floor(Math.random() * 0x100);
    }
    return hash;
}
