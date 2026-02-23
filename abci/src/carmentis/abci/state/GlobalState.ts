import { getLogger, Logger } from '@logtape/logtape';
import { LevelDb } from '../database/LevelDb';
import { CachedLevelDb } from '../database/CachedLevelDb';
import { Storage } from '../storage/Storage';
import { CachedStorage } from '../storage/CachedStorage';
import { RadixTree } from '../RadixTree';
import { AccountManager } from '../accounts/AccountManager';
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
    VirtualBlockchainStatus,
} from '@cmts-dev/carmentis-sdk/server';
import { NodeCrypto } from '../crypto/NodeCrypto';
import { ChallengeManager } from '../challenge/ChallengeManager';
import { Performance } from '../Performance';
import { LevelDbTable } from '../database/LevelDbTable';

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
    ): Promise<VirtualBlockchainStatus | null> {
        // first search for the state
        const vbState = await this.getVirtualBlockchainState(virtualBlockchainId);
        if (vbState === null) {
            this.logger.debug(`Virtual Blockchain with id ${Utils.binaryToHexa(virtualBlockchainId)} not found: returning null`);
            return null;
        }

        // we now search for the microblock hashes contained in the virtual blockchain
        const latestMicroblockHash = vbState.lastMicroblockHash;
        const latestMicroblockHeader = await this.getMicroblockHeader(Hash.from(latestMicroblockHash));
        if (latestMicroblockHeader === null) {
            this.logger.warn(`Microblock ${Utils.binaryToHexa(latestMicroblockHash)} not found in database: returning null`);
            return null;
        }

        let currentMicroblockHeader = latestMicroblockHeader;
        const microblockHashes = [ latestMicroblockHash ]
        for (let currentMicroblockHeight = currentMicroblockHeader.height; currentMicroblockHeight > 1; currentMicroblockHeight--) {
            const previousMicrolockHash = currentMicroblockHeader.previousHash;
            microblockHashes.unshift(previousMicrolockHash);

            // obtain the previous microblock header
            const previousMicroblockHeader= await this.getMicroblockHeader(Hash.from(previousMicrolockHash));
            if (previousMicroblockHeader === null) {
                this.logger.warn(`Microblock ${Utils.binaryToHexa(previousMicrolockHash)} not found in database during chain recovery (highly corrupted storage): returning null`);
                return null;
            }
            currentMicroblockHeader = previousMicroblockHeader;
        }

        const status: VirtualBlockchainStatus = {
            microblockHashes: microblockHashes,
            state: vbState
        };
        return status;
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
               this.logger.warn("Unabled to return the protocol variables: " + e.message + `(${e.stack})`)
               this.logger.warn("Returning default protocol variables")
           }
           return ProtocolInternalState.createInitialState();
       }
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

    getCachedDatabase() {
        return this.cachedDb;
    }

    getDatabase() {
        return this.db;
    }

    getCachedStorage() {
        return this.cachedStorage;
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
    }

    async indexVirtualBlockchain(virtualBlockchain: VirtualBlockchain) {
        if (virtualBlockchain.getHeight() === 1) {
            this.logger.debug(
                `Add virtual blockchain ${Utils.binaryToHexa(virtualBlockchain.getId())} to index`,
            );
            await this.db.indexVirtualBlockchain(virtualBlockchain);
        } else {
            // in this case, the virtual blockchain is (and should be) already indexed so no need to index it again
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
