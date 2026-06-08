import { NodeCrypto } from "../crypto/NodeCrypto";
import { DbInterface } from '../database/DbInterface';
import { Utils } from "@cmts-dev/carmentis-sdk-core";

interface MerkleProof {
    size: number
    leafIndex: number
    leafHash: Uint8Array
    rootHash: Uint8Array
    witnesses: Uint8Array[]
}

/**
 * A Merkle tree persisted in the database, designed to handle a large number of leaves (up to 2**32).
 * Only the nodes required for each operation are read or written; the full tree is never loaded in memory.
 * Its sole use in the current version is to store the MB hashes of a given VB.
 */
export class PersistentMerkleTree {
    constructor(
        private readonly db: DbInterface,
        private readonly treeId: Uint8Array,
    ) {
        if (treeId.length !== 32) {
            throw new Error(`the tree ID must consist of exactly 32 bytes`);
        }
    }

    /**
     * A static helper to set a leaf of a tree.
     * @param db - The database.
     * @param treeId - The tree identifier.
     * @param index - The 0-based leaf index.
     * @param hash - The hash of the leaf.
     * @returns {Uint8Array} - The new root hash.
     */
    static async addTreeLeaf(db: DbInterface, treeId: Uint8Array, index: number, hash: Uint8Array): Promise<Uint8Array> {
        const tree = new PersistentMerkleTree(db, treeId);
        return await tree.addLeaf(index, hash);
    }

    /**
     * A static helper to get a leaf of a tree.
     * @param db - The database.
     * @param treeId - The tree identifier.
     * @param index - The 0-based leaf index.
     * @returns {Uint8Array} - The leaf hash.
     */
    static async getTreeLeaf(db: DbInterface, treeId: Uint8Array, index: number): Promise<Uint8Array> {
        const tree = new PersistentMerkleTree(db, treeId);
        return await tree.getNode(0, index);
    }

    /**
     * A static helper to get a proof from a tree.
     * @param db - The database.
     * @param treeId - The tree identifier.
     * @param index - The 0-based leaf index.
     * @param size - The current size of the tree.
     * @returns {MerkleProof} - The proof.
     */
    static async getTreeProof(db: DbInterface, treeId: Uint8Array, index: number, size: number): Promise<MerkleProof> {
        const tree = new PersistentMerkleTree(db, treeId);
        return await tree.getProof(index, size);
    }

    /**
     * Verifies a Merkle proof.
     * @param proof - The proof to verify.
     * @returns {boolean} - True if the proof is valid, false otherwise.
     */
    static verifyProof(proof: MerkleProof): boolean {
        const treeHeight = PersistentMerkleTree.sizeToHeight(proof.size);
        let currentHash = proof.leafHash;
        for (let row = 0; row < treeHeight - 1; row++) {
            const witness = proof.witnesses[row];
            if (proof.leafIndex >>> row & 1) {
                currentHash = PersistentMerkleTree.mergeHashes(witness, currentHash);
            }
            else {
                currentHash = PersistentMerkleTree.mergeHashes(currentHash, witness);
            }
        }
        return Utils.binaryIsEqual(currentHash, proof.rootHash);
    }

    /**
     * Gets the current height of the tree given its current size.
     * @param size - The size of the tree (number of leaves).
     * @returns {number} - The height of the tree.
     */
    private static sizeToHeight(size: number): number {
        if (size < 1) {
            throw new Error('size must be at least 1');
        }
        // For size == 1, the height is 1.
        // For size > 1, the height is the 1-indexed position of the highest significant bit in size-1, plus one.
        // By using clz32(), we don't have to worry about the edge case.
        return 33 - Math.clz32(size - 1);
    }

    /**
     * Merges two child hashes into a parent hash.
     * @param leftChild - The hash of the left child.
     * @param rightChild - The hash of the right child.
     * @returns {Uint8Array} - The hash of the parent node.
     */
    private static mergeHashes(leftChild: Uint8Array, rightChild: Uint8Array): Uint8Array {
        const concatenation = new Uint8Array(64);
        concatenation.set(leftChild, 0);
        concatenation.set(rightChild, 32);
        return NodeCrypto.Hashes.sha256AsBinary(concatenation);
    }

    /**
     * Adds a leaf to the tree and returns the new hash root.
     * @param index - The index of the leaf, starting at 0.
     * @param hash - Hash of the leaf.
     */
    async addLeaf(index: number, hash: Uint8Array): Promise<Uint8Array> {
        const treeHeight = PersistentMerkleTree.sizeToHeight(index + 1);

        // Set the new leaf on row 0.
        await this.setNode(0, index, hash);

        // Ahead of time creation of empty nodes, so that the tree is balanced.
        // There are as many of them as there are trailing zero-bits in 'index'.
        for (let row = 0, msk = index; !(msk & 1) && row < treeHeight - 1; row++) {
            const col = msk | 1;
            await this.setNode(row, col, Utils.getNullHash());
            msk >>>= 1;
        }

        // Update the parent nodes, up to the root.
        for (let row = 1, col = index >>> 1; row < treeHeight; row++) {
            await this.mergeChildrenOf(row, col);
            col >>>= 1;
        }
        return await this.getNode(treeHeight - 1, 0);
    }

    /**
     * Generates a Merkle proof for a given leaf index.
     * @param index - The 0-based index of the leaf to prove.
     * @param size - The current size of the tree (number of leaves).
     * @returns {Proof} - The proof object containing the tree size, proven leaf, root hash and witnesses.
     */
    async getProof(index: number, size: number): Promise<MerkleProof> {
        const treeHeight = PersistentMerkleTree.sizeToHeight(size);
        const proof: MerkleProof = {
            size,
            leafIndex: index,
            leafHash: await this.getNode(0, index),
            rootHash: await this.getNode(treeHeight - 1, 0),
            witnesses: [],
        };
        for (let row = 0, col = index; row < treeHeight - 1; row++) {
            col ^= 1;
            const witness = await this.getNode(row, col);
            proof.witnesses.push(witness);
            col >>>= 1;
        }
        return proof;
    }

    /**
     * Retrieves a node from the tree by its row and column.
     * @param row - The row of the node (0-indexed, 0 for leaves).
     * @param col - The column of the node (0-indexed).
     * @returns {Uint8Array} - The hash stored at that node.
     * @throws {Error} - If the node does not exist.
     */
    async getNode(row: number, col: number): Promise<Uint8Array> {
        const key = this.getNodeKey(row, col);
        const node = await this.db.getMerkleNode(key);
        if (node === undefined) {
            throw new Error(`unable to get node at row ${row}, column ${col}`);
        }
        return node;
    }

    /**
     * Stores a value at a given node position.
     * @param row - The row of the node (0-indexed, 0 for leaves).
     * @param col - The column of the node (0-indexed).
     * @param value - The hash to store.
     */
    private async setNode(row: number, col: number, value: Uint8Array) {
        const key = this.getNodeKey(row, col);
        await this.db.putMerkleNode(key, value);
    }

    /**
     * Computes the key of a node. The format is:
     * tree_id (32 bytes) || row (1 byte) || column (4 bytes, big-endian)
     * @param row - The row of the parent node (must be >= 1).
     * @param col - The column of the parent node.
     */
    private getNodeKey(row: number, col: number): Uint8Array {
        const key = new Uint8Array(37);
        key.set(this.treeId, 0);
        key[32] = row;
        key[33] = col >>> 24 & 0xFF;
        key[34] = col >>> 16 & 0xFF;
        key[35] = col >>> 8 & 0xFF;
        key[36] = col & 0xFF;
        return key;
    }

    /**
     * Computes and stores the hash of an internal node from its two children.
     * @param row - The row of the parent node (must be >= 1).
     * @param col - The column of the parent node.
     */
    private async mergeChildrenOf(row: number, col: number) {
        if (row < 1) {
            throw new Error(`can't merge children of node at row ${row}`);
        }
        const leftChild = await this.getNode(row - 1, col << 1);
        const rightChild = await this.getNode(row - 1, col << 1 | 1);
        const mergedHash = PersistentMerkleTree.mergeHashes(leftChild, rightChild);
        await this.setNode(row, col, mergedHash);
    }
}
