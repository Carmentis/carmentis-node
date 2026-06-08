import { DbInterface} from "../database/DbInterface";
import {MicroblockProof, Hash, BlockchainUtils} from "@cmts-dev/carmentis-sdk-core";
import {PersistentMerkleTree} from "../persistentMerkleTree/PersistentMerkleTree";

export class MicroblockAnchoringProof {
    constructor(private readonly db: DbInterface) {}

    async createProof(microblockHash: Hash) {
        const chainInfo = await this.db.getChainInformation();
        const block = await this.db.getBlockInformation(chainInfo.height);
        if (block === undefined) {
            throw new Error(`Anchoring proof failure: cannot retrieve last block`);
        }
        const applicationStateHashes = block.applicationStateHashes;
        const microblockInfo = await this.db.getMicroblockInformation(microblockHash.toBytes());
        if (microblockInfo === undefined) {
            throw new Error(`Anchoring proof failure: cannot retrieve microblock`);
        }
        const virtualBlockchainId = microblockInfo.virtualBlockchainId;
        const serializedVbState = await this.db.getSerializedVirtualBlockchainState(virtualBlockchainId);
        if (serializedVbState === undefined) {
            throw new Error(`Anchoring proof failure: cannot retrieve VB state`);
        }
        const vbState = BlockchainUtils.decodeVirtualBlockchainState(serializedVbState);
        const merkleProof = await PersistentMerkleTree.getTreeProof(
            this.db,
            virtualBlockchainId,
            microblockInfo.header.height - 1,
            vbState.height,
        );
    }
}
