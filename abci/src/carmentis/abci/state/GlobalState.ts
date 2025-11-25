import { Logger } from '@nestjs/common';
import { LevelDb } from '../database/LevelDb';
import { CachedLevelDb } from '../database/CachedLevelDb';
import { Storage } from '../storage/Storage';
import { CachedStorage } from '../storage/CachedStorage';
import { RadixTree } from '../RadixTree';
import { AccountManager } from '../AccountManager';
import {
    AbstractProvider,
    BlockchainUtils,
    Hash,
    Microblock,
    MicroblockBody,
    MicroblockHeaderObject,
    PublicSignatureKey,
    Utils,
    VirtualBlockchain,
    VirtualBlockchainState,
    VirtualBlockchainStatus,
} from '@cmts-dev/carmentis-sdk/server';
import { NODE_SCHEMAS } from '../constants/constants';
import { NodeCrypto } from '../crypto/NodeCrypto';
import { ChallengeManager } from '../challenge/ChallengeManager';
import {Performance} from '../Performance';

export class GlobalState extends AbstractProvider {

    private readonly logger: Logger;
    private cachedStorage: CachedStorage;
    private cachedDb: CachedLevelDb;

    // instantiate radix trees
    private readonly vbRadix: RadixTree;
    //private readonly tokenRadix: RadixTree;

    private perf: Performance;

    private readonly cachedAccountManager: AccountManager;

    constructor(
        private readonly db: LevelDb,
        private readonly storage: Storage,
        logger?: Logger,
    ) {
        super();
        this.logger = logger || new Logger(GlobalState.name);
        this.cachedDb = new CachedLevelDb(this.db);
        this.cachedStorage = new CachedStorage(this.storage, this.cachedDb);
        this.vbRadix = new RadixTree(this.cachedDb, NODE_SCHEMAS.DB_VB_RADIX);
        this.cachedAccountManager = new AccountManager(this.cachedDb, this.logger);
        this.perf = new Performance(this.logger);
    }

    async getAccountHashFromPublicKey(publicKey: PublicSignatureKey): Promise<Hash> {
        const accountHashInBytes =
            await this.cachedAccountManager.loadAccountByPublicKey(publicKey);
        return Hash.from(accountHashInBytes);
    }

    getVirtualBlockchainStatus(
        virtualBlockchainId: Uint8Array,
    ): Promise<VirtualBlockchainStatus | null> {
        // TODO implement
        throw new Error('Method not implemented.');
    }

    async getVirtualBlockchainState(
        virtualBlockchainId: Uint8Array,
    ): Promise<VirtualBlockchainState | null> {
        const serializedVbState = await this.cachedDb.getSerializedVirtualBlockchainState(virtualBlockchainId);
        if (serializedVbState !== null) {
            return BlockchainUtils.decodeVirtualBlockchainState(serializedVbState);
        } else {
            return null;
        }
    }

    async getAccountIdFromPublicKey(publicKey: PublicSignatureKey): Promise<Hash> {
        const accountIdAsBytes = await this.cachedAccountManager.loadAccountByPublicKey(
            publicKey
        );
        return Hash.from(accountIdAsBytes)
    }

    async getMicroblockBody(microblockHash: Hash): Promise<MicroblockBody | null> {
        const serializedBody = await this.cachedStorage.readSerializedMicroblockBody(
            microblockHash.toBytes(),
        );
        return BlockchainUtils.decodeMicroblockBody(serializedBody);
    }

    async getMicroblockHeader(microblockHash: Hash): Promise<MicroblockHeaderObject | null> {
        const serializedHeader = await this.cachedStorage.readSerializedMicroblockHeader(
            microblockHash.toBytes(),
        );
        return BlockchainUtils.decodeMicroblockHeader(serializedHeader);
    }

    async getVirtualBlockchainIdContainingMicroblock(microblockHash: Hash): Promise<Hash> {
        const microblockInformation = await this.cachedDb.getMicroblockInformation(
            microblockHash.toBytes(),
        );
        return Hash.from(microblockInformation.virtualBlockchainId);
    }

    async getListOfMicroblockBody(microblockHashes: Uint8Array[]): Promise<MicroblockBody[]> {
        const result: MicroblockBody[] = [];
        for (const hash of microblockHashes) {
            const serializedBody = await this.cachedStorage.readSerializedMicroblockBody(hash);
            const body = BlockchainUtils.decodeMicroblockBody(serializedBody);
            result.push(body);
        }
        return result;
    }

    async getApplicationHash() {
        //const perfMeasure = this.perf.start('computeApplicationHash');

        const tokenRadixHash = await this.cachedAccountManager.getAccountRootHash();
        const vbRadixHash = await this.vbRadix.getRootHash();
        const radixHash = NodeCrypto.Hashes.sha256AsBinary(
            Utils.binaryFrom(vbRadixHash, tokenRadixHash),
        );
        const challengeGenerator = new ChallengeManager(
            this.cachedStorage,
            this.cachedStorage.getCachedLevelDb(),
        );
        const storageHash = await challengeGenerator.processChallenge(radixHash);
        const appHash = NodeCrypto.Hashes.sha256AsBinary(Utils.binaryFrom(radixHash, storageHash));

        //perfMeasure.end();

        return { tokenRadixHash, vbRadixHash, appHash, storageHash, radixHash };
        /*
        const { appHash } = await this.computeApplicationHash(
            this.tokenRadix,
            this.vbRadix,
            new CachedStorage(this.storage, new CachedLevelDb(this.db))
        );

         */
    }

    hasSomethingToCommit() {
        // TODO: implement
        return true;
    }

    async commit() {
        await this.cachedDb.commit();
        await this.cachedStorage.flush();
    }

    getAccountManager() {
        return this.cachedAccountManager;
    }

    /*
    finalize(request: FinalizeBlockRequest) {
        // Extract the votes of validators involved in the publishing of this block.
        // Then proceed to the payment of the validators.
        const votes = request.decided_last_commit?.votes || [];
        await this.payValidators(this.finalizedBlockContext, votes, blockHeight, blockTimestamp);

        const processBlockResult = await this.processBlock(
            this.finalizedBlockContext,
            blockHeight,
            blockTimestamp,
            request.txs,
        );
        const fees = CMTSToken.createAtomic(processBlockResult.totalFees);
        this.logger.log(`Total block fees: ${fees.toString()}`);


        await this.setBlockInformation(
            this.finalizedBlockContext,
            blockHeight,
            request.hash,
            blockTimestamp,
            request.proposer_address,
            processBlockResult.blockSize,
            request.txs.length,
        );

        await this.setBlockContent(
            this.finalizedBlockContext,
            blockHeight,
            processBlockResult.microblocks,
        );

        this.finalizedBlockContext.validatorSetUpdate.forEach((entry) => {
            this.logger.log(
                `validatorSet update: pub_key=[${entry.pub_key_type}]${Base64.encodeBinary(entry.pub_key_bytes)}, power=${entry.power}`,
            );
        });

    }

     */

    getCachedDatabase() {
        return this.cachedDb;
    }

    getDatabase() {
        return this.db;
    }

    /**
     * Stores the virtual blockchain's state hash into the vbRadix storage.
     *
     * @param {VirtualBlockchain} virtualBlockchain - The virtual blockchain instance to be stored.
     * @return {Promise<void>} - A promise that resolves when the virtual blockchain state has been stored successfully.
     */
    async storeVirtualBlockchainState(virtualBlockchain: VirtualBlockchain) {
        const vbId = virtualBlockchain.getId();
        // TODO(fix): need to export the virtual blockchain state
        const stateData = await this.getSerializedVirtualBlockchainState(vbId);
        const stateHash = NodeCrypto.Hashes.sha256AsBinary(stateData);
        await this.vbRadix.set(vbId, stateHash);
    }

    /**
     * Stores the given microblock along with its associated transaction in the buffered storage.
     *
     * @param {number} expirationDay - The day when the microblock should expire and be removed from storage.
     * @param {Microblock} microblock - The microblock object that needs to be stored.
     * @param {Uint8Array} transaction - The transaction data associated with the microblock.
     * @return {Promise<void>} A promise that resolves when the microblock is successfully stored.
     */
    async storeMicroblock(expirationDay: number, microblock: Microblock, transaction: Uint8Array) {
        await this.cachedStorage.addMicroblockToBuffer(expirationDay, microblock, transaction);
    }

    private async getSerializedVirtualBlockchainState(
        vbIdentifier: Uint8Array,
    ): Promise<Uint8Array> {
        const serializedVbState =
            await this.cachedDb.getSerializedVirtualBlockchainState(vbIdentifier);
        const vbState = BlockchainUtils.decodeVirtualBlockchainState(serializedVbState);
        return BlockchainUtils.encodeVirtualBlockchainState(vbState);
    }

    async createGenesisState(publicKey: PublicSignatureKey) {
        this.cachedAccountManager.createIssuerAccount(publicKey);
    }
}
