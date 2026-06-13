import { DbInterface} from "../database/DbInterface";
import { LevelDbTable } from '../database/LevelDbTable';
import { PersistentMerkleTree } from "../persistentMerkleTree/PersistentMerkleTree";
import { RadixTree } from "../radixTree/RadixTree";
import { NodeCrypto } from '../crypto/NodeCrypto';
import {
    MicroblockProof,
    AccountProof,
    BlockchainUtils,
    Utils,
} from "@cmts-dev/carmentis-sdk-core";

export class StateProof {
    constructor(private readonly db: DbInterface) {}

    async createMicroblockProof(microblockHash: Uint8Array): Promise<MicroblockProof> {
        // get the current chain height and application hashes
        const { chainHeight, applicationHashes } = await this.getChainState();

        // get the microblock information
        const microblockInfo = await this.db.getMicroblockInformation(microblockHash);
        if (microblockInfo === undefined) {
            throw new Error(`State proof failure: cannot retrieve microblock`);
        }
        const virtualBlockchainId = microblockInfo.virtualBlockchainId;

        // get the VB state
        const serializedVbState = await this.db.getSerializedVirtualBlockchainState(virtualBlockchainId);
        if (serializedVbState === undefined) {
            throw new Error(`State proof failure: cannot retrieve VB state`);
        }
        const vbState = BlockchainUtils.decodeVirtualBlockchainState(serializedVbState);
        const vbStateHash = NodeCrypto.Hashes.sha256AsBinary(serializedVbState);

        // compute the Merkle proof
        const merkleProof = await PersistentMerkleTree.getTreeProof(
            this.db,
            virtualBlockchainId,
            microblockInfo.header.height - 1,
            vbState.height,
        );
        if (!Utils.binaryIsEqual(merkleProof.rootHash, vbState.merkleRootHash)) {
            throw new Error(`State proof failure: computed Merkle root hash does not match the one declared in the VB state`);
        }

        // get the VB radix proof
        const radixTree = new RadixTree(this.db, LevelDbTable.VB_RADIX);
        const { value: radixValue, proof: radixProof } = await radixTree.get(virtualBlockchainId);
        const radixRootHash = NodeCrypto.Hashes.sha256AsBinary(radixProof[0]);
        if (radixValue === null) {
            throw new Error(`State proof failure: got null when retrieving microblock hash from VB radix`);
        }
        if (!Utils.binaryIsEqual(applicationHashes.vbRadixHash, radixRootHash)) {
            throw new Error(`State proof failure: computed VB radix root hash does not match the one declared in the block`);
        }
        if (!Utils.binaryIsEqual(radixValue, vbStateHash)) {
            throw new Error(`State proof failure: VB state hash from VB radix does not match the computed value`);
        }

        const proof: MicroblockProof = {
            block: {
                height: chainHeight,
                ...applicationHashes,
            },
            microblock: {
                virtualBlockchainId,
                height: microblockInfo.header.height,
                hash: microblockHash,
            },
            virtualBlockchain: {
                state: vbState,
                merkleWitnesses: merkleProof.witnesses,
                radixProof,
            }
        };
        return proof;
    }

    async createAccountProof(accountHash: Uint8Array): Promise<AccountProof> {
        // get the current chain height and application hashes
        const { chainHeight, applicationHashes } = await this.getChainState();

        // get the account state
        const accountState = await this.db.getAccountStateByAccountId(accountHash);
        if (accountState === undefined) {
            throw new Error(`State proof failure: cannot retrieve VB state`);
        }
        const encodedAccountState = BlockchainUtils.encodeAccountState(accountState);
        const accountStateHash = NodeCrypto.Hashes.sha256AsBinary(encodedAccountState);

        // get the token radix proof
        const radixTree = new RadixTree(this.db, LevelDbTable.TOKEN_RADIX);
        const { value: radixValue, proof: radixProof } = await radixTree.get(accountHash);
        const radixRootHash = NodeCrypto.Hashes.sha256AsBinary(radixProof[0]);
        if (radixValue === null) {
            throw new Error(`State proof failure: got null when retrieving account hash from token radix`);
        }
        if (!Utils.binaryIsEqual(applicationHashes.tokenRadixHash, radixRootHash)) {
            throw new Error(`State proof failure: computed token radix root hash does not match the one declared in the block`);
        }
        if (!Utils.binaryIsEqual(radixValue, accountStateHash)) {
            throw new Error(`State proof failure: token state hash from token radix does not match the computed value`);
        }

        const proof: AccountProof = {
            block: {
                height: chainHeight,
                ...applicationHashes,
            },
            account: {
                virtualBlockchainId: accountHash,
                state: accountState,
                radixProof,
            }
        };
        return proof;
    }

    private async getChainState() {
        const chainInfo = await this.db.getChainInformation();
        const chainHeight = chainInfo.height;
        const block = await this.db.getBlockInformation(chainHeight);
        if (block === undefined) {
            throw new Error(`State proof failure: cannot retrieve last block`);
        }
        const applicationHashes = block.applicationStateHashes;

        // sanity check: verify app hash
        const radixHash = NodeCrypto.Hashes.sha256AsBinary(
            Utils.binaryFrom(applicationHashes.vbRadixHash, applicationHashes.tokenRadixHash),
        );
        const appHash = NodeCrypto.Hashes.sha256AsBinary(Utils.binaryFrom(radixHash, applicationHashes.storageHash));
        if (!Utils.binaryIsEqual(appHash, applicationHashes.appHash)) {
            throw new Error(`State proof failure: computed app hash does not match the one declared in the block`);
        }

        return { chainHeight, applicationHashes };
    }
}
