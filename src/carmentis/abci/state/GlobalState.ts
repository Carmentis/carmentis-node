import { getLogger, Logger } from '@logtape/logtape';
import { LevelDb } from '../database/LevelDb';
import { CachedLevelDb } from '../database/CachedLevelDb';
import { Storage } from '../storage/Storage';
import { CachedStorage } from '../storage/CachedStorage';
import { RadixTree } from '../radixTree/RadixTree';
import { AccountManager } from '../accounts/AccountManager';
import { ApplicationStateHashes } from '../types/valibot/ApplicationStateHashes';
import {
    AbstractProvider,
    BlockchainUtils,
    Hash,
    Microblock,
    MicroblockBody,
    MicroblockHeader,
    ProtocolInternalState,
    PublicSignatureKey,
    Utils,
    VirtualBlockchain,
    VirtualBlockchainState,
} from '@cmts-dev/carmentis-sdk-core';
import { NodeCrypto } from '../crypto/NodeCrypto';
import { ChallengeManager } from '../challenge/ChallengeManager';
import { Performance } from '../Performance';
import { LevelDbTable } from '../database/LevelDbTable';
import { PersistentMerkleTree } from '../persistentMerkleTree/PersistentMerkleTree';

export class GlobalState extends AbstractProvider {
    private readonly logger: Logger;
    private cachedStorage: CachedStorage;
    private cachedDb: CachedLevelDb;
    private readonly vbRadix: RadixTree;
    private newDayTimestamp: number;
    private perf: Performance;

    private readonly cachedAccountManager: AccountManager;

    constructor(
        private readonly db: LevelDb,
        private readonly storage: Storage,
        logger?: Logger,
    ) {
        super();
        this.logger = logger || getLogger([ 'node', 'state', GlobalState.name ]);
        this.cachedDb = new CachedLevelDb(this.db);
        this.cachedStorage = new CachedStorage(this.storage, this.cachedDb);
        this.vbRadix = new RadixTree(this.cachedDb, LevelDbTable.VB_RADIX);
        this.cachedAccountManager = new AccountManager(this.cachedDb);
        this.newDayTimestamp = 0;
        this.perf = new Performance(this.logger);
    }

    setNewDayTimestamp(dayTimestamp: number) {
        this.newDayTimestamp = dayTimestamp;
    }

    getNewDayTimestamp() {
        return this.newDayTimestamp;
    }

    async getAccountHashFromPublicKey(publicKey: PublicSignatureKey): Promise<Hash> {
        const accountHashInBytes =
            await this.cachedAccountManager.loadAccountByPublicKey(publicKey);
        return Hash.from(accountHashInBytes);
    }

    async getVirtualBlockchainStatus(
        virtualBlockchainId: Uint8Array,
    ): Promise<VirtualBlockchainState | null> {
        const vbState = await this.getVirtualBlockchainState(virtualBlockchainId);
        if (vbState === null) {
            this.logger.debug(`Virtual Blockchain with id ${Utils.binaryToHexa(virtualBlockchainId)} not found: returning null`);
            return null;
        }

        return vbState;
    }

    async storeProtocolVirtualBlockchainIdentifier(identifier: Uint8Array) {
        const chainInformation = await this.cachedDb.getChainInformation();
        const nullHash = Utils.getNullHash();
        if (!Utils.binaryIsEqual(chainInformation.protocolVirtualBlockchainId, nullHash)) {
            throw new Error(`attempt to update the protocol VB identifier after it has already been set`);
        }
        this.logger.info(`Saving protocolo VB id in CHAIN_INFORMATION: ${Utils.binaryToHexa(identifier)}`);
        chainInformation.protocolVirtualBlockchainId = identifier;
        await this.cachedDb.putChainInformation(chainInformation);
    }

    async storeNodeVirtualBlockchainIndex(identifier: Uint8Array) {
        await this.cachedDb.putRaw(LevelDbTable.VALIDATOR_INDEX, identifier, new Uint8Array(0));
    }

    async getProtocolState(): Promise<ProtocolInternalState> {
       try {
           const protocolVirtualBlockchainIdentifier =
               await this.cachedDb.getProtocolVirtualBlockchainIdentifier();
           const protocolVbStatus = await this.getVirtualBlockchainState(
               protocolVirtualBlockchainIdentifier,
           );
           if (protocolVbStatus !== null) {
               const internalState = protocolVbStatus.internalState;
               return ProtocolInternalState.createFromObject(internalState);
           } else {
               this.logger.warn("Protocol VB id found but VB status cannot be loaded: returning default protocol variables")
               return ProtocolInternalState.createInitialState()
           }

       } catch (e) {
           if (e instanceof Error) {
               this.logger.warn("Unabled to return the protocol variables: " + e.message)
               this.logger.warn("Returning default protocol variables")
           }
           return ProtocolInternalState.createInitialState();
       }
    }

    async genesisSeedExists(seed: Uint8Array): Promise<boolean> {
        const dbSeed = await this.cachedDb.getRaw(LevelDbTable.GENESIS_SEED, seed);
        return dbSeed !== undefined;
    }

    async getVirtualBlockchainState(
        virtualBlockchainId: Uint8Array,
    ): Promise<VirtualBlockchainState | null> {
        const serializedVbState =
            await this.cachedDb.getSerializedVirtualBlockchainState(virtualBlockchainId);
        if (serializedVbState !== undefined) {
            return BlockchainUtils.decodeVirtualBlockchainState(serializedVbState);
        } else {
            this.logger.warn(
                'Virtual blockchain state not found in database: ' +
                    Utils.binaryToHexa(virtualBlockchainId) +
                    ': returning null',
            );
            return null;
        }
    }

    async getAccountIdFromPublicKey(publicKey: PublicSignatureKey): Promise<Hash> {
        const accountIdAsBytes = await this.cachedAccountManager.loadAccountByPublicKey(publicKey);
        return Hash.from(accountIdAsBytes);
    }

    async getFullSerializedMicroblock(microblockHash: Hash): Promise<Uint8Array | null> {
        const serializedMicroblock = await this.cachedStorage.readFullMicroblock(
            microblockHash.toBytes(),
        );
        return serializedMicroblock || null;
    }

    async getSerializedMicroblockByHeight(virtualBlockchainId: Uint8Array, height: number): Promise<Uint8Array | null> {
        // get the hash of the microblock from the Merkle tree
        const microblockHash = await PersistentMerkleTree.getTreeLeaf(
            this.cachedDb,
            virtualBlockchainId,
            height - 1,
        );
        // get the serialized content of the microblock from the cached storage
        // we disable the sanity check to bypass the deserialization and speed up the process
        // it is the caller's responsibility to verify the content
        const serializedMicroblock = await this.cachedStorage.readFullMicroblock(
            microblockHash,
            false,
        );
        return serializedMicroblock || null;
    }

    async getMicroblockBody(microblockHash: Hash): Promise<MicroblockBody | null> {
        const serializedBody = await this.cachedStorage.readSerializedMicroblockBody(
            microblockHash.toBytes(),
        );
        return serializedBody ?
            BlockchainUtils.decodeMicroblockBody(serializedBody) :
            null;
    }

    async getMicroblockHeader(microblockHash: Hash): Promise<MicroblockHeader | null> {
        const serializedHeader = await this.cachedStorage.readSerializedMicroblockHeader(
            microblockHash.toBytes(),
        );
        return serializedHeader ?
            BlockchainUtils.decodeMicroblockHeader(serializedHeader) :
            null;
    }

    async getVirtualBlockchainIdContainingMicroblock(microblockHash: Hash): Promise<Hash> {
        this.logger.debug(`Getting the virtual blockchain id containing the microblock ${microblockHash.encode()}`)
        const microblockInformation = await this.cachedDb.getMicroblockInformation(
            microblockHash.toBytes(),
        );
        if (microblockInformation === undefined) throw new Error(`Cannot find vb containing microblock: Microblock ${microblockHash.encode()} not found`);
        return Hash.from(microblockInformation.virtualBlockchainId);
    }

    async getListOfMicroblockBody(microblockHashes: Uint8Array[]): Promise<MicroblockBody[]> {
        const result: MicroblockBody[] = [];
        for (const hash of microblockHashes) {
            const serializedBody = await this.cachedStorage.readSerializedMicroblockBody(hash);
            if (serializedBody === undefined) throw new Error(`Body for microblock ${Utils.binaryToHexa(hash)} not found`);
            const body = BlockchainUtils.decodeMicroblockBody(serializedBody);
            result.push(body);
        }
        return result;
    }

    async getApplicationStateHashes(): Promise<ApplicationStateHashes> {
        //const perfMeasure = this.perf.start('computeApplicationHash');

        const chainInformation = await this.db.getChainInformation();
        const currentHeight = chainInformation.height;
        let lastRadixHash: Uint8Array;
        this.logger.debug(`computing application hash`);
        if (currentHeight > 0) {
            const lastBlock = await this.db.getBlockInformation(currentHeight);
            if (lastBlock === undefined) throw new Error(`unable to fetch last block information (height ${currentHeight})`);
            lastRadixHash = lastBlock.applicationStateHashes.radixHash;
        }
        else {
            lastRadixHash = Utils.getNullHash();
        }
        this.logger.debug(`last radix hash is ${Utils.binaryToHexa(lastRadixHash)} (height ${currentHeight})`);

        const tokenRadixHash = await this.cachedAccountManager.getAccountRootHash();
        const vbRadixHash = await this.vbRadix.getRootHash();
        const radixHash = NodeCrypto.Hashes.sha256AsBinary(
            Utils.binaryFrom(vbRadixHash, tokenRadixHash),
        );
        const challengeGenerator = new ChallengeManager(this.storage, this.db);
        const storageHash = await challengeGenerator.processChallenge(lastRadixHash);
        const appHash = NodeCrypto.Hashes.sha256AsBinary(Utils.binaryFrom(radixHash, storageHash));

        //perfMeasure.end();

        this.logger.debug(`VB radix hash ...... : ${Utils.binaryToHexa(vbRadixHash)}`);
        this.logger.debug(`Token radix hash ... : ${Utils.binaryToHexa(tokenRadixHash)}`);
        this.logger.debug(`Radix hash ......... : ${Utils.binaryToHexa(radixHash)}`);
        this.logger.debug(`Storage hash ....... : ${Utils.binaryToHexa(storageHash)}`);
        this.logger.debug(`Application hash ... : ${Utils.binaryToHexa(appHash)}`);

        return {
            vbRadixHash,
            tokenRadixHash,
            radixHash,
            storageHash,
            appHash,
        };
    }

    hasSomethingToCommit() {
        // TODO: implement
        return true;
    }

    clearCaches() {
        this.cachedDb.resetCache();
        this.cachedStorage.clear();
        this.getAccountManager().clearModifiedAccounts();
    }

    async commit() {
        await this.cachedStorage.flush();
        await this.cachedDb.commit();
    }

    getAccountManager() {
        return this.cachedAccountManager;
    }

    getCachedDatabase() {
        return this.cachedDb;
    }

    getDatabase() {
        return this.db;
    }

    getCachedStorage() {
        return this.cachedStorage;
    }

    async storeMicroblockHashInMerkleTree(virtualBlockchain: VirtualBlockchain, microblock: Microblock) {
        const vbId = virtualBlockchain.getId();
        const microblockHeight = microblock.getHeight();
        const microblockHash = microblock.getHash().toBytes();
        const newRootHash = await PersistentMerkleTree.addTreeLeaf(
            this.cachedDb,
            vbId,
            microblockHeight - 1,
            microblockHash,
        )
        virtualBlockchain.setMerkleRootHash(newRootHash);
    }

    /**
     * Stores the virtual blockchain's state hash into the vbRadix storage.
     *
     * @param {VirtualBlockchain} virtualBlockchain - The virtual blockchain instance to be stored.
     * @return {Promise<void>} - A promise that resolves when the virtual blockchain state has been stored successfully.
     */
    async storeVirtualBlockchainState(virtualBlockchain: VirtualBlockchain): Promise<void> {
        const vbId = virtualBlockchain.getId();
        this.logger.debug(
            `Store virtual blockchain state for ${Utils.binaryToHexa(vbId)}`,
        );
        const serializedState = await virtualBlockchain.getSerializedVirtualBlockchainState();
        const stateHash = NodeCrypto.Hashes.sha256AsBinary(serializedState);
        await this.vbRadix.set(vbId, stateHash);
        await this.cachedDb.setSerializedVirtualBlockchainState(vbId, serializedState);
    }

    /**
     * Stores the given microblock along with its associated transaction in the buffered storage.
     * If this is a genesis microblock, saves the seed.
     *
     * @param {number} expirationDay - The day when the microblock should expire and be removed from storage.
     *
     * @param {Microblock} microblock - The microblock object that needs to be stored.
     * @param {Uint8Array} transaction - The transaction data associated with the microblock.
     * @return {Promise<void>} A promise that resolves when the microblock is successfully stored.
     */
    async storeMicroblock(expirationDay: number, virtualBlockchain: VirtualBlockchain, microblock: Microblock, transaction: Uint8Array) {
        await this.cachedStorage.addMicroblockToBuffer(expirationDay, microblock, transaction);
        await this.cachedDb.setMicroblockInformation(microblock, {
            header: microblock.getHeader(),
            virtualBlockchainId: virtualBlockchain.getId(),
            virtualBlockchainType: virtualBlockchain.getType(),
        });
        if (microblock.getHeight() === 1) {
            const seed = microblock.getPreviousHash().toBytes().slice(8);
            await this.cachedDb.putRaw(LevelDbTable.GENESIS_SEED, seed, new Uint8Array(0));
        }
    }

    async isProtocolVbDefined() {
        this.logger.debug('Check if protocol VB state is defined in database');
        try {
            await this.getProtocolState();
            return true;
        } catch (e) {
            this.logger.debug(
                `Protocol VB state cannot be accessed in database (reason: ${e}): returning false`,
            );
            return false;
        }
    }

    async getAccountPublicKeyByAccountId(feesPayerAccountId: Uint8Array) {
        const vb = await this.loadAccountVirtualBlockchain(Hash.from(feesPayerAccountId));
        return await vb.getPublicKey();
    }
}
