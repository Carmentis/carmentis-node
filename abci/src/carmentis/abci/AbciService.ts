import {
    ApplySnapshotChunkRequest,
    ApplySnapshotChunkResponse,
    ApplySnapshotChunkResult,
    CheckTxRequest,
    CommitRequest,
    CommitResponse,
    EchoRequest,
    EchoResponse,
    ExecTxResult,
    ExtendVoteRequest,
    ExtendVoteResponse,
    FinalizeBlockRequest,
    FinalizeBlockResponse,
    FlushRequest,
    FlushResponse,
    InfoRequest,
    InfoResponse,
    InitChainRequest,
    InitChainResponse,
    ListSnapshotsRequest,
    ListSnapshotsResponse,
    LoadSnapshotChunkRequest,
    LoadSnapshotChunkResponse,
    OfferSnapshotRequest,
    OfferSnapshotResponse,
    OfferSnapshotResult,
    PrepareProposalRequest,
    PrepareProposalResponse,
    ProcessProposalRequest,
    ProcessProposalResponse,
    ProcessProposalStatus,
    QueryRequest,
    QueryResponse,
    Snapshot as SnapshotProto,
    VerifyVoteExtensionRequest,
    VerifyVoteExtensionResponse,
} from '../../proto-ts/cometbft/abci/v1/types';

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KeyManagementService } from './services/KeyManagementService';
import { CometBFTNodeConfigService } from './CometBFTNodeConfigService';
import { GenesisSnapshotStorageService } from './GenesisSnapshotStorageService';
import { CachedLevelDb } from './database/CachedLevelDb';
import { Storage } from './storage/Storage';
import { Performance } from './Performance';
import { NodeCrypto } from './crypto/NodeCrypto';

import {
    Base64,
    CHAIN,
    CMTSToken,
    CryptographicHash,
    CryptoSchemeFactory,
    ECO,
    Economics,
    EncoderFactory,
    GenesisSnapshotDTO,
    Hash,
    KeyedProvider,
    MessageSerializer,
    MessageUnserializer,
    MicroblockChecker,
    MicroblockImporter,
    NetworkProvider,
    NullNetworkProvider,
    PrivateSignatureKey,
    Provider,
    PublicSignatureKey,
    SCHEMAS,
    SECTIONS,
    Utils,
    VirtualBlockchain,
    Logger as SDKLogger
} from '@cmts-dev/carmentis-sdk/server';

import { AccountManager } from './AccountManager';
import { RadixTree } from './RadixTree';
import { LevelDb } from './database/LevelDb';
import { SnapshotsManager } from './SnapshotsManager';
import { SectionCallback } from './types/SectionCallback';
import { ABCIQueryHandler } from './ABCIQueryHandler';
import { NodeProvider } from './NodeProvider';
import { NODE_SCHEMAS } from './constants/constants';
import { CometBFTPublicKeyConverter } from './CometBFTPublicKeyConverter';
import { InitialBlockchainStateBuilder } from './InitialBlockchainStateBuilder';
import { AccountInformation } from './types/AccountInformation';
import { AbciHandlerInterface } from './AbciHandlerInterface';
import { NodeConfigService } from '../config/services/NodeConfigService';
import { Context } from './types/Context';
import { MicroblockCheckResult } from './types/MicroblockCheckResult';
import { GlobalStateUpdater } from './globalState/GlobalStateUpdater';
import { CachedStorage } from './storage/CachedStorage';
import { ChallengeManager } from './challenge/ChallengeManager';

const APP_VERSION = 1;

const KEY_TYPE_MAPPING = {
    'tendermint/PubKeyEd25519': 'ed25519',
};

@Injectable()
export class AbciService implements OnModuleInit, AbciHandlerInterface {
    private logger = new Logger(AbciService.name);
    accountManager: AccountManager;
    provider: Provider;
    db: LevelDb;
    storage: Storage; // TODO(storage): It might be interesting to use cachedStorage instead of Storage
    snapshot: SnapshotsManager;
    sectionCallbacks: Map<number, SectionCallback>;
    finalizedBlockContext: Context | null;
    importedSnapshot: SnapshotProto | null;
    perf: Performance;

    // storage paths
    private dbPath: string;
    private storagePath: string;
    private snapshotPath: string;

    // Serializers are used to serialize/deserialize the messages sent to the application.
    private messageSerializer = new MessageSerializer(SCHEMAS.NODE_MESSAGES);
    private messageUnserializer = new MessageUnserializer(SCHEMAS.NODE_MESSAGES);

    // Two radix trees are used to maintain the state of tokens and virtual blockchains.
    private vbRadix: RadixTree;
    private tokenRadix: RadixTree;

    // The ABCI query handler is used to handle queries sent to the application via the abci_query method.
    private abciQueryHandler: ABCIQueryHandler;

    // storage paths

    constructor(
        private readonly nodeConfig: NodeConfigService,
        private readonly cometConfig: CometBFTNodeConfigService,
        private readonly kms: KeyManagementService,
        private genesisSnapshotStorage: GenesisSnapshotStorageService,
    ) {
        // define the paths where are stored the database, the storage and the snapshots.
        const {
            rootStoragePath: abciStoragePath,
            dbStoragePath,
            microblocksStoragePath,
            snapshotStoragePath,
        } = this.nodeConfig.getStoragePaths();
        this.logger.log(`ABCI storage at ${abciStoragePath}`);
        this.dbPath = dbStoragePath;
        this.storagePath = microblocksStoragePath;
        this.snapshotPath = snapshotStoragePath;

        // Create and initialize the database.
        this.db = new LevelDb(this.dbPath);
        this.db.initialize();

        // Create and initialize file storage management and snapshot management.
        this.storage = new Storage(this.db, this.storagePath);
        this.snapshot = new SnapshotsManager(this.db, this.snapshotPath, this.logger);

        // Create unauthenticated blockchain client
        const internalProvider = new NodeProvider(this.db, this.storage);
        this.provider = new Provider(internalProvider, new NullNetworkProvider());
        this.accountManager = new AccountManager(this.db, this.tokenRadix, this.logger);

        // Set up the ABCI query handler
        this.abciQueryHandler = new ABCIQueryHandler(
            this.provider,
            this.db,
            this.accountManager,
            this.genesisSnapshotStorage,
        );

        // instantiate radix trees
        this.vbRadix = new RadixTree(this.db, NODE_SCHEMAS.DB_VB_RADIX);
        this.tokenRadix = new RadixTree(this.db, NODE_SCHEMAS.DB_TOKEN_RADIX);

        this.finalizedBlockContext = null;

        // we do not import snapshot by default
        this.importedSnapshot = null;

        // we register the callbacks for the sections
        //this.sectionCallbacks = new Map();
        //this.registerSectionCallbacks();

        this.perf = new Performance(this.logger, true);
        ////////////////////////////
        // TEST CODE ///////////////
        ////////////////////////////
        //      const account = new Account;
        //
        //      account.addSpendableTokens(1000);
        //      account.addVestedTokens(500, 0, 5, 20);
        //      account.addEscrowedTokens(250, new Uint8Array(32), null);
        //      //account.setStake(1500, new Uint8Array(32));
        //
        //      console.log(account.getBreakdown());
        //
        //      for(let time = 0; time <= 30; time++) {
        //        account.applyLinearVesting(time);
        //        console.log(time, JSON.stringify(account.getBreakdown()));
        //      }
        ////////////////////////////
    }

    /*
    private registerSectionCallbacks() {
        this.registerSectionPostUpdateCallbacks(CHAIN.VB_ACCOUNT, [
            [SECTIONS.ACCOUNT_TOKEN_ISSUANCE, this.accountTokenIssuanceCallback],
            [SECTIONS.ACCOUNT_CREATION, this.accountCreationCallback],
            [SECTIONS.ACCOUNT_TRANSFER, this.accountTokenTransferCallback],
        ]);

        this.registerSectionPostUpdateCallbacks(CHAIN.VB_VALIDATOR_NODE, [
            [SECTIONS.VN_DESCRIPTION, this.validatorNodeDescriptionCallback],
            [SECTIONS.VN_VOTING_POWER_UPDATE, this.validatorNodeVotingPowerUpdateCallback],
        ]);
    }

     */

    onModuleInit() {

    }



    registerSectionPreUpdateCallbacks(
        objectType: number,
        callbackList: Array<[number, SectionCallback]>,
    ) {
        this.putSectionCallbackInRegister(objectType, callbackList, 0);
    }

    registerSectionPostUpdateCallbacks(
        objectType: number,
        callbackList: Array<[number, SectionCallback]>,
    ) {
        this.putSectionCallbackInRegister(objectType, callbackList, 1);
    }

    putSectionCallbackInRegister(
        objectType: number,
        callbackList: Array<[number, SectionCallback]>,
        isPostUpdate: number,
    ) {
        for (const [sectionType, callback] of callbackList) {
            const key = (sectionType << 5) | (objectType << 1) | isPostUpdate;
            this.sectionCallbacks.set(key, callback.bind(this));
        }
    }

    /*
    async invokeSectionPreUpdateCallback(objectType: number, sectionType: number, context: any) {
        await this.invokeSectionCallback(objectType, sectionType, context, 0);
    }

     */

    async invokeSectionPostUpdateCallback(objectType: number, sectionType: number, context: any) {
        await this.invokeSectionCallback(objectType, sectionType, context, 1);
    }

    async invokeSectionCallback(
        objectType: number,
        sectionType: number,
        context: any,
        isPostUpdate: number,
    ) {
        const key = (sectionType << 5) | (objectType << 1) | isPostUpdate;

        if (this.sectionCallbacks.has(key)) {
            const sectionCallback = this.sectionCallbacks.get(key);

            if (!sectionCallback) {
                throw new Error(`internal error: undefined section callback`);
            }
            await sectionCallback(context);
        }
    }


    /*
    async accountTokenIssuanceCallback(context: any) {
        const rawPublicKey = await context.vb.getPublicKey();
        await context.cache.accountManager.testPublicKeyAvailability(rawPublicKey);

        await context.cache.accountManager.tokenTransfer(
            {
                type: ECO.BK_SENT_ISSUANCE,
                payerAccount: null,
                payeeAccount: context.vb.identifier,
                amount: context.section.object.amount,
            },
            {
                mbHash: context.mb.hash,
                sectionIndex: context.section.index,
            },
            context.timestamp,
        );

        await context.cache.accountManager.saveAccountByPublicKey(
            context.vb.identifier,
            rawPublicKey,
        );
    }

    async accountCreationCallback(context: any) {
        const rawPublicKey = await context.vb.getPublicKey();
        await context.cache.accountManager.testPublicKeyAvailability(rawPublicKey);

        await context.cache.accountManager.tokenTransfer(
            {
                type: ECO.BK_SALE,
                payerAccount: context.section.object.sellerAccount,
                payeeAccount: context.vb.identifier,
                amount: context.section.object.amount,
            },
            {
                mbHash: context.mb.hash,
                sectionIndex: context.section.index,
            },
            context.timestamp,
        );

        await context.cache.accountManager.saveAccountByPublicKey(
            context.vb.identifier,
            rawPublicKey,
        );
    }

    async accountTokenTransferCallback(context: any) {
        await context.cache.accountManager.tokenTransfer(
            {
                type: ECO.BK_SENT_PAYMENT,
                payerAccount: context.vb.identifier,
                payeeAccount: context.section.object.account,
                amount: context.section.object.amount,
            },
            {
                mbHash: context.mb.hash,
                sectionIndex: context.section.index,
            },
            context.timestamp,
        );
    }

    async validatorNodeDescriptionCallback(context: any) {
        const cometPublicKeyBytes = Base64.decodeBinary(context.section.object.cometPublicKey);
        const cometAddress =
            CometBFTPublicKeyConverter.convertRawPublicKeyIntoAddress(cometPublicKeyBytes);

        const networkIntegration = await context.object.getNetworkIntegration();

        // create the new link: Comet address -> identifier
        await context.cache.db.putRaw(
            NODE_SCHEMAS.DB_VALIDATOR_NODE_BY_ADDRESS,
            cometAddress,
            context.vb.identifier,
        );

        if (networkIntegration.votingPower) {
            this.storeValidatorSetUpdateEntry(
                context.cache.validatorSetUpdate,
                networkIntegration.votingPower,
                context.section.object.cometPublicKeyType,
                cometPublicKeyBytes,
            );
        }
    }

    async validatorNodeVotingPowerUpdateCallback(context: any) {
        const description = await context.object.getDescription();
        const cometPublicKeyBytes = Base64.decodeBinary(description.cometPublicKey);

        this.storeValidatorSetUpdateEntry(
            context.cache.validatorSetUpdate,
            context.section.object.votingPower,
            description.cometPublicKeyType,
            cometPublicKeyBytes,
        );
    }

    storeValidatorSetUpdateEntry(
        validatorSetUpdate: any,
        votingPower: number,
        pubKeyType: string,
        pubKeyBytes: Uint8Array,
    ) {
        const translatedPubKeyType = KEY_TYPE_MAPPING[pubKeyType];

        if (!translatedPubKeyType) {
            this.logger.error(`invalid key type '${pubKeyType}' for validator set update`);
            return false;
        }

        const validatorSetUpdateEntry = {
            power: votingPower,
            pub_key_type: translatedPubKeyType,
            pub_key_bytes: pubKeyBytes,
        };

        validatorSetUpdate.push(validatorSetUpdateEntry);
        return true;
    }*/

    /**
     * Handle queries sent to the CometBFT's abci_query method.
     *
     * @param serializedQuery
     */
    async Query(request: QueryRequest): Promise<QueryResponse> {
        const response = await this.forwardAbciQueryToHandler(new Uint8Array(request.data));
        return Promise.resolve({
            code: 2,
            log: '',
            info: '',
            index: 0,
            key: new Uint8Array(),
            value: response,
            proof_ops: undefined,
            height: 0,
            codespace: 'Carmentis',
        });
    }

    private async forwardAbciQueryToHandler(serializedQuery: Uint8Array) {
        // We deserialize the query to identity the request type and content.
        const { type, object } = this.messageUnserializer.unserialize(serializedQuery);
        this.logger.log(`Received query ${SCHEMAS.NODE_MESSAGES[type].label} (${type})`);
        try {
            return await this.abciQueryHandler.handleQuery(type, object);
        } catch (error) {
            this.logger.error(error);
            const errorMsg = error instanceof Error ? error.toString() : 'error';
            return this.messageSerializer.serialize(SCHEMAS.MSG_ERROR, {
                error: errorMsg,
            });
        }
    }

    async Info(request: InfoRequest) {
        this.logger.log(`info`);
        this.importedSnapshot = null; // TODO(explain): why this.importedSnapshot is set to null here?
        const chainInformation = await this.db.getChainInformationObject();
        const last_block_height = chainInformation?.height || 0;
        if (last_block_height === 0) {
            this.logger.log(`(Info) Aborting info request because the chain is empty.`);
            return InfoResponse.create({
                version: '1',
                data: 'Carmentis ABCI application',
                app_version: APP_VERSION,
                last_block_height,
            });
        } else {
            const { appHash } = await this.computeApplicationHash(
                this.tokenRadix,
                this.vbRadix,
                new CachedStorage(this.storage, new CachedLevelDb(this.db))
            );

            const hex = EncoderFactory.bytesToHexEncoder();
            this.logger.log(`(Info) last_block_height: ${last_block_height}`);
            this.logger.log(`(Info) last_block_app_hash: ${hex.encode(appHash)}`);

            return InfoResponse.create({
                version: '1',
                data: 'Carmentis ABCI application',
                app_version: APP_VERSION,
                last_block_height,
                last_block_app_hash: appHash,
            });
        }
    }

    async InitChain(request: InitChainRequest) {
        this.logger.log(`EVENT: initChain`);

        // we start by cleaning database, snapshots and storage
        await this.clearDatabase();
        await this.clearStorage();
        await this.clearSnapshots();

        // depending on if the current node is a genesis node or not
        const isGenesisNode = this.isGenesisNode(request);
        if (isGenesisNode) {
            this.logger.log(`This node is the genesis node.`);
            const issuerPrivateKey = this.kms.getIssuerPrivateKey();
            const appHash = await this.initChainAsGenesis(request, issuerPrivateKey);
            return this.createInitChainResponse(appHash);
        } else {
            this.logger.log(`This node is not the genesis node.`);
            const appHash = await this.initChainAsNode(request);
            return this.createInitChainResponse(appHash);
        }
    }

    /**
     * Checks whether the current node is a genesis node or not.
     *
     * A node is considered a genesis node if it belongs to the initial validator set (assumed to contain exactly one validator).
     * @private
     */
    private isGenesisNode(request: InitChainRequest) {
        // NOTE: I have identified a difference between the public key type provided by the InitChainRequest and the one
        // inside the cometbft config. For this reason, I ignore the public key type for the moment.
        // Hence, I assume that the types of both keys are identical.
        const currentNodePublicKey = this.cometConfig.getPublicKey();
        const initialValidatorSet = request.validators;
        this.logger.debug(`Current node public key: ${currentNodePublicKey.value}`);
        for (const validator of initialValidatorSet) {
            const base64 = EncoderFactory.bytesToBase64Encoder();
            const validatorPublicKeyValue = base64.encode(validator.pub_key_bytes);
            const validatorPublicKeyType = validator.pub_key_type;
            this.logger.debug(`Validator node public key: ${validatorPublicKeyValue}`);
            const isPublicKeyValueMatching = validatorPublicKeyValue === currentNodePublicKey.value;
            const isPublicKeyTypeMatching = validatorPublicKeyType === currentNodePublicKey.type;

            const isGenesisNode = isPublicKeyValueMatching;
            if (isGenesisNode) {
                return true;
            }
        }
        return false;
    }

    private async initChainAsNode(request: InitChainRequest) {
        const genesisSnapshot = await this.searchGenesisSnapshotChunksFromGenesisNode();
        await this.loadReceivedGenesisSnapshotChunks(genesisSnapshot);
        await this.genesisSnapshotStorage.writeGenesisSnapshotChunksToDiskFromEncodedChunks(
            genesisSnapshot,
        );
        const { appHash } = await this.computeApplicationHash(
            this.tokenRadix,
            this.vbRadix,
            new CachedStorage(this.storage, new CachedLevelDb(this.db))
        );
        return appHash;
    }

    private async loadReceivedGenesisSnapshotChunks(genesisSnapshotChunks: Uint8Array[]) {
        // we load the chunks using the SnapshotManager
        for (let chunkIndex = 0; chunkIndex < genesisSnapshotChunks.length; chunkIndex++) {
            const chunk = genesisSnapshotChunks[chunkIndex];
            const isLastChunk = chunkIndex === genesisSnapshotChunks.length - 1;
            await this.snapshot.loadReceivedChunk(this.storage, chunkIndex, chunk, isLastChunk);
        }
    }

    private async initChainAsGenesis(
        request: InitChainRequest,
        issuerPrivateKey: PrivateSignatureKey,
    ) {
        //
        await this.storeInitialValidatorSet(request);

        // we construct a keyed blockchain client equipped with a dummy, static private key
        const internalProvider = new NodeProvider(this.db, this.storage);
        const provider = new KeyedProvider(
            issuerPrivateKey,
            internalProvider,
            new NullNetworkProvider(),
        );
        //const blockchain = new Blockchain(provider);

        this.logger.log(`Creating initial state for initial height ${request.initial_height}`);
        const appHash = await this.publishInitialBlockchainState(
            issuerPrivateKey,
            request,
        );

        // we create the genesis state snapshot and export it.
        await this.storeGenesisStateSnapshotInSnapshotsFolder();
        await this.saveGenesisSnapshotToDisk();

        return appHash;
    }

    private async storeGenesisStateSnapshotInSnapshotsFolder() {
        this.logger.log(`Creating genesis snapshot`);
        await this.snapshot.create();
    }

    private async searchGenesisSnapshotChunksFromGenesisNode() {
        const genesisNodeUrl = this.nodeConfig.getGenesisSnapshotRpcEndpoint();
        this.logger.verbose(`Looking for genesis snapshot on the genesis node: ${genesisNodeUrl}`);
        const provider = new NetworkProvider(genesisNodeUrl);
        const snapshot = await provider.getGenesisSnapshot();
        const encoder = EncoderFactory.bytesToBase64Encoder();
        const genesisSnapshotChunks = snapshot.base64EncodedChunks.map((chunk) =>
            encoder.decode(chunk),
        );
        return genesisSnapshotChunks;
    }

    private async saveGenesisSnapshotToDisk() {
        // we assume that after the genesis state, the chain contains three blocks (starting at zero).
        const chainHeightAfterGenesis = 2;

        // the genesis state's chunks are encoded in base64
        const base64Encoder = EncoderFactory.bytesToBase64Encoder();

        // we generate and export the genesis state as a snapshot
        const numberOfChunksToExport = 4;
        const genesisChunks = [];
        for (
            let chunkIndexToExport = 0;
            chunkIndexToExport < numberOfChunksToExport;
            chunkIndexToExport++
        ) {
            const chunk = await this.snapshot.getChunk(
                this.storage,
                chainHeightAfterGenesis,
                chunkIndexToExport,
            );
            genesisChunks.push(chunk);
        }

        const genesisState: GenesisSnapshotDTO = {
            base64EncodedChunks: genesisChunks.map((chunk) => base64Encoder.encode(chunk)),
        };

        await this.genesisSnapshotStorage.writeGenesisSnapshotToDisk(genesisState);
    }

    private createInitChainResponse(appHash: Uint8Array) {
        const consensusParams = {
            validator: {
                pub_key_types: ['ed25519'], // ['tendermint/PubKeyEd25519']
            },
        };
        /*
          consensus_params: {
              feature: {
                  vote_extensions_enable_height: 2,
                  pbts_enable_height: undefined
              },
              block: {
                  max_bytes: 16777216,
                  max_gas: -1,
              },
              evidence: {
                  max_age_duration: {
                      seconds: 172800,
                      nanos: 0
                  },
                  max_bytes: 2097152,
                  max_age_num_blocks: 100000
              },
              validator: {
                  pub_key_types: ['ed25519']
              },
              version: {
                  app: 1
              },
              abci: undefined,
              synchrony: {
                  precision: {
                      seconds: 172800,
                      nanos: 0
                  },
                  message_delay: {
                      seconds: 172800,
                      nanos: 0
                  }
              }
          },
        */
        //      const consensusParams = {};
        return InitChainResponse.create({
            consensus_params: consensusParams,
            validators: [],
            app_hash: appHash,
        });
    }

    private async storeInitialValidatorSet(request: InitChainRequest) {
        for (const validator of request.validators) {
            const address = CometBFTPublicKeyConverter.convertRawPublicKeyIntoAddress(
                Utils.bufferToUint8Array(validator.pub_key_bytes),
            );
            const record = await this.db.getRaw(NODE_SCHEMAS.DB_VALIDATOR_NODE_BY_ADDRESS, address);

            if (!record) {
                this.logger.log(`Adding unknown validator address: ${Utils.binaryToHexa(address)}`);
                await this.db.putRaw(
                    NODE_SCHEMAS.DB_VALIDATOR_NODE_BY_ADDRESS,
                    address,
                    Utils.getNullHash(),
                );
            }
        }
    }

    private async publishInitialBlockchainState(
        issuerPrivateKey: PrivateSignatureKey,
        request: InitChainRequest,
    ) {
        // we first create a blockchain client equipped with the key of the
        const stateBuilder = new InitialBlockchainStateBuilder(
            this.provider,
            request,
            issuerPrivateKey,
        );

        // we first publish the issuer account creation transaction and Carmentis organization creation transaction
        const issuerAccountCreationTransaction =
            await stateBuilder.createIssuerAccountCreationTransaction();
        const { organizationId, organizationCreationTransaction } =
            stateBuilder.createCarmentisOrganisationCreationTransaction();
        const transactionsPublishedInFirstBlock = [
            issuerAccountCreationTransaction,
            organizationCreationTransaction,
        ];
        await this.publishGenesisTransactions(transactionsPublishedInFirstBlock, 0);

        // in the second block, we publish the genesis node declaration transaction
        const { genesisNodePublicKey, genesisNodePublicKeyType } =
            stateBuilder.getValidatorPublicKeyFromRequest(KEY_TYPE_MAPPING);
        const genesisNodeCometbftRpcEndpoint = this.nodeConfig.getCometbftExposedRpcEndpoint();
        const { genesisNodeId, genesisNodeDeclarationTransaction } =
            stateBuilder.createGenesisNodeDeclarationTransaction(
                organizationId,
                genesisNodePublicKey,
                genesisNodePublicKeyType,
                genesisNodeCometbftRpcEndpoint,
            );
        await this.publishGenesisTransactions([genesisNodeDeclarationTransaction], 1);

        // finally, in the third block, we publish the grant to be a validator for the genesis node
        const genesisNodeValidatorGrantTransaction =
            await stateBuilder.createGenesisNodeValidatorGrantTransaction(genesisNodeId);
        return await this.publishGenesisTransactions([genesisNodeValidatorGrantTransaction], 2);
    }

    private async publishGenesisTransactions(
        transactions: Uint8Array[],
        publishedBlockHeight: number,
    ) {
        // Since we are publishing transactions at the genesis, publication timestamp is at the lowest possible value.
        // The proposer address is undefined since we do not have published this node.
        const blockTimestamp = Utils.getTimestampInSeconds();
        const proposerAddress = new Uint8Array(32);

        const cache = this.getCacheInstance(transactions);
        const processBlockResult = await this.processBlock(
            cache,
            publishedBlockHeight,
            blockTimestamp,
            transactions,
            true,
        );
        const appHash = processBlockResult.appHash;
        await this.setBlockInformation(
            cache,
            publishedBlockHeight,
            Utils.getNullHash(),
            blockTimestamp,
            proposerAddress,
            processBlockResult.blockSize,
            transactions.length,
        );
        await this.setBlockContent(cache, publishedBlockHeight, processBlockResult.microblocks);

        // commit database and flush storage.
        await cache.db.commit();
        await cache.storage.flush();

        return appHash;
    }
    /**
     Incoming transaction
     */
    async CheckTx(request: CheckTxRequest) {
        const perfMeasure = this.perf.start('CheckTx');

        this.logger.log(`EVENT: checkTx (${request.tx.length} bytes)`);

        const cache = this.getCacheInstance([]);
        const checker = new MicroblockChecker(cache.provider, Utils.bufferToUint8Array(request.tx))
        /*
        const importer = new MicroblockImporter({
            data: ,
            provider: cache.provider
        });

         */

        const checkResult = await this.checkMicroblock(cache, checker);

        // In case of microblock check success, we log the content of the microblock
        if (checkResult.checked) {
            const vb = checker.getVirtualBlockchain();
            const mb = checker.getMicroblock();
            this.logger.log(`Type: ${CHAIN.VB_NAME[vb.getType()]}`);

            //const vb: any = await importer.getVirtualBlockchain();
            for (const section of mb.getAllSections()) {
                const sectionLabel = SECTIONS.DEF[vb.getType()][section.type].label;
                const sectionLengthInBytes = section.data.length;
                const message = `${(sectionLabel + ' ').padEnd(36, '.')} ${sectionLengthInBytes} byte(s)`;
                this.logger.log(message);
            }
        }

        perfMeasure.end();

        return Promise.resolve({
            code: checkResult ? 0 : 1,
            log: '',
            data: new Uint8Array(request.tx),
            gas_wanted: 0,
            gas_used: 0,
            info: checkResult.checked === true ? '' : checkResult.error,
            events: [],
            codespace: 'app',
        });
    }

    /**
     Executed by the proposer
     */
    async PrepareProposal(request: PrepareProposalRequest) {
        const blockHeight = +request.height;
        const blockTimestamp = +(request.time?.seconds ?? 0);

        this.logger.log(
            `EVENT: prepareProposal (${request.txs.length} txs, height=${blockHeight}, ts=${blockTimestamp})`,
        );

        const proposedTxs = [];
        const cache = this.getCacheInstance(request.txs);

        for (const tx of request.txs) {
            //const importer = cache.blockchain.getMicroblockImporter(Utils.bufferToUint8Array(tx));
            /*
            const importer = new MicroblockImporter({
                data: Utils.bufferToUint8Array(tx),
                provider: cache.provider
            })
             */
            const checker = new MicroblockChecker(cache.provider, Utils.bufferToUint8Array(tx));
            const checkResult = await this.checkMicroblock(cache, checker, blockTimestamp, false);

            if (checkResult.checked) {
                proposedTxs.push(tx);
            }
        }

        this.logger.log(
            `included ${proposedTxs.length} transaction(s) out of ${request.txs.length}`,
        );

        return PrepareProposalResponse.create({
            txs: proposedTxs,
        });
    }

    /**
     Executed by all validators
     answer:
     PROPOSAL_UNKNOWN = 0; // Unknown status. Returning this from the application is always an error.
     PROPOSAL_ACCEPT  = 1; // Status that signals that the application finds the proposal valid.
     PROPOSAL_REJECT  = 2; // Status that signals that the application finds the proposal invalid.
     */
    async ProcessProposal(request: ProcessProposalRequest) {
        const perfMeasure = this.perf.start('ProcessProposal');

        const blockHeight = +request.height;
        const blockTimestamp = +(request.time?.seconds ?? 0);

        this.logger.log(
            `EVENT: processProposal (${request.txs.length} txs, height=${blockHeight}, ts=${blockTimestamp})`,
        );

        const cache = this.getCacheInstance(request.txs);
        const processBlockResult = await this.processBlock(
            cache,
            blockHeight,
            blockTimestamp,
            request.txs,
        );

        this.logger.log(
            `processProposal / total block fees: ${processBlockResult.totalFees / ECO.TOKEN} ${ECO.TOKEN_NAME}`,
        );

        perfMeasure.end();

        return ProcessProposalResponse.create({
            status: ProcessProposalStatus.PROCESS_PROPOSAL_STATUS_ACCEPT,
        });
    }

    ExtendVote(request: ExtendVoteRequest) {
        return ExtendVoteResponse.create({});
    }

    VerifyVoteExtension(request: VerifyVoteExtensionRequest) {
        return Promise.resolve(VerifyVoteExtensionResponse.create({}));
    }

    async FinalizeBlock(request: FinalizeBlockRequest) {
        const perfMeasure = this.perf.start('FinalizeBlock');

        const blockHeight = +request.height;
        const blockTimestamp = +(request.time?.seconds ?? 0);
        const numberOfTransactionsInBlock = request.txs.length;

        this.logger.log(
            `EVENT: finalizeBlock (${numberOfTransactionsInBlock} txs, height=${blockHeight}, ts=${blockTimestamp})`,
        );

        // raise a warning if finalizedBlock() is called before commit()
        if (this.finalizedBlockContext !== null) {
            this.logger.warn(`finalizeBlock() called before the previous commit()`);
        }
        this.finalizedBlockContext = this.getCacheInstance(request.txs);

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

        perfMeasure.end();

        return FinalizeBlockResponse.create({
            tx_results: processBlockResult.txResults,
            app_hash: processBlockResult.appHash,
            events: [],
            validator_updates: this.finalizedBlockContext.validatorSetUpdate,
            consensus_param_updates: undefined,
        });
    }

    async payValidators(cache: Context, votes: any, blockHeight: number, blockTimestamp: number) {
        this.logger.log(`payValidators`);

        /**
         get the pending fees from the fees account
         */
        const feesAccountIdentifier = Economics.getSpecialAccountTypeIdentifier(
            ECO.ACCOUNT_BLOCK_FEES,
        );
        const feesAccountInfo: AccountInformation =
            await cache.accountManager.loadAccountInformation(feesAccountIdentifier);
        const pendingFees = feesAccountInfo.state.balance;

        if (!pendingFees) {
            return;
        }

        /**
         get the validator accounts from decided_last_commit.votes sent by Comet
         */
        const validatorAccounts = [];

        for (const vote of votes) {
            if (vote.block_id_flag == 'BLOCK_ID_FLAG_COMMIT') {
                const address = Utils.bufferToUint8Array(vote.validator.address);
                const validatorNodeHash = await cache.db.getRaw(
                    NODE_SCHEMAS.DB_VALIDATOR_NODE_BY_ADDRESS,
                    address,
                );

                if (!validatorNodeHash) {
                    this.logger.error(`unknown validator address ${Utils.binaryToHexa(address)}`);
                } else if (Utils.binaryIsEqual(validatorNodeHash, Utils.getNullHash())) {
                    this.logger.warn(
                        `validator address ${Utils.binaryToHexa(address)} is not yet linked to a validator node VB`,
                    );
                } else {
                    const validatorNode = await cache.provider.loadValidatorNodeVirtualBlockchain(
                        new Hash(validatorNodeHash),
                    );
                    const validatorPublicKey: PublicSignatureKey =
                        await validatorNode.getOrganizationPublicKey();
                    const hash: CryptographicHash =
                        CryptoSchemeFactory.createDefaultCryptographicHash();
                    const account = await cache.accountManager.loadAccountByPublicKeyHash(
                        hash.hash(validatorPublicKey.getPublicKeyAsBytes()),
                    );
                    validatorAccounts.push(account);
                }
            }
        }

        // ensure that we have enough validators
        const nValidators = validatorAccounts.length;
        if (nValidators === 0) {
            this.logger.warn('empty list of validator accounts: fees payment is delayed');
            return;
        }

        /**
         split the fees among the validators
         */
        const feesRest = pendingFees % nValidators;
        const feesQuotient = (pendingFees - feesRest) / nValidators;

        for (const n in validatorAccounts) {
            const paidFees =
                (+n + blockHeight) % nValidators < feesRest ? feesQuotient + 1 : feesQuotient;

            await cache.accountManager.tokenTransfer(
                {
                    type: ECO.BK_PAID_BLOCK_FEES,
                    payerAccount: feesAccountIdentifier,
                    payeeAccount: validatorAccounts[n],
                    amount: paidFees,
                },
                {
                    height: blockHeight - 1,
                },
                blockTimestamp,
            );
        }
    }

    async processBlock(
        cache: Context,
        blockHeight: number,
        timestamp: number,
        txs: Uint8Array[],
        executedDuringGenesis = false,
    ) {
        this.logger.log(`processBlock (height=${blockHeight})`);

        const txResults = [];
        const newObjectCounts = Array(CHAIN.N_VIRTUAL_BLOCKCHAINS).fill(0);
        const microblocks = [];
        let totalFees = 0;
        let blockSize = 0;
        let blockSectionCount = 0;

        for (let txId = 0; txId < txs.length; txId++) {
            const perfMeasure = this.perf.start('processBlock tx');

            const tx = txs[txId];
            //const importer = cache.blockchain.getMicroblockImporter(Utils.bufferToUint8Array(tx));
            /*
            const importer = new MicroblockImporter({
                data: Utils.bufferToUint8Array(tx),
                provider: cache.provider
            })*/
            const checker = new MicroblockChecker(
                cache.provider,
                Utils.bufferToUint8Array(tx),
            );

            const checkResult = await this.checkMicroblock(
                cache,
                checker,
                timestamp,
                executedDuringGenesis,
            );

            perfMeasure.event('checkMicroblock');

            if (!checkResult.checked) {
                continue;
            }

            const vb: VirtualBlockchain = checker.getVirtualBlockchain();
            const mb = checker.getMicroblock();

            if (vb.getHeight() == 1) {
                newObjectCounts[vb.getType()]++;
            }

            blockSize += tx.length;

            //          this.logger.log(`gas = ${vb.currentMicroblock.header.gas}, gas price = ${vb.currentMicroblock.header.gasPrice / ECO.TOKEN} ${ECO.TOKEN_NAME}`);

            /*
            const fees = Math.floor(
                (vb.currentMicroblock.header.gas * vb.currentMicroblock.header.gasPrice) /
                    ECO.GAS_UNIT,
            );*/
            const fees = mb.computeFees();
            const feesPayerAccount = mb.getFeesPayerAccount();
            this.logger.log(`[Transaction ${txId}]`, mb.getHash().encode());
            this.logger.debug('Fees payer account in process block:', feesPayerAccount);
            perfMeasure.event('getFeesPayerAccount');
            totalFees += fees;

            this.logger.log(
                `Confirmed microblock ${mb.getHash().encode()}`,
            );
            //          this.logger.log(
            //              `fees = ${fees / ECO.TOKEN} ${ECO.TOKEN_NAME}, paid by ${cache.accountManager.getShortAccountString(feesPayerAccount)}`,
            //          );

            await checker.finalize();

            perfMeasure.event('store');

            const sectionCount: number = mb.getNumberOfSections();
            microblocks.push({
                hash: mb.getHash().toBytes(), //vb.currentMicroblock.hash,
                vbIdentifier: vb.getIdentifier().toBytes(),
                vbType: vb.getType(),
                height: vb.getHeight(),
                size: tx.length,
                sectionCount,
            });

            blockSectionCount += sectionCount;

            await cache.storage.writeMicroblock(vb.getExpirationDay(), txId);

            perfMeasure.event('write');

            const stateData = await cache.provider.getVirtualBlockchainStateInternal(
                vb.getIdentifier().toBytes() //importer.vb.identifier,
            );
            // @ts-expect-error stateData has an invalid type
            const stateHash = NodeCrypto.Hashes.sha256AsBinary(stateData);

            await cache.vbRadix.set(vb.getId(), stateHash);

            const isFeesPayerAccountDefined = feesPayerAccount !== null;
            if (isFeesPayerAccountDefined) {
                const chainReference = mb.getHash().toBytes() //vb.currentMicroblock.hash as Uint8Array;
                await this.sendFeesFromFeesPayerAccountToFeesAccount(
                    cache,
                    feesPayerAccount,
                    fees,
                    chainReference,
                    timestamp,
                );
            }

            perfMeasure.event('fees');

            txResults.push(
                ExecTxResult.create({
                    code: 0,
                    data: new Uint8Array(),
                    log: '',
                    info: '',
                    gas_wanted: 0,
                    gas_used: 0,
                    events: [],
                    codespace: 'app',
                }),
            );

            perfMeasure.end();
        }

        /*
        const chainInfoObject = (await cache.db.getObject(
            NODE_SCHEMAS.DB_CHAIN_INFORMATION,
            NODE_SCHEMAS.DB_CHAIN_INFORMATION_KEY,
        )) || {
            microblockCount: 0,
            objectCounts: Array(CHAIN.N_VIRTUAL_BLOCKCHAINS).fill(0),
        };
        */


        const chainInfoObject = await cache.db.getChainInformationObject();
        chainInfoObject.height = blockHeight;
        chainInfoObject.lastBlockTimestamp = timestamp;
        chainInfoObject.microblockCount += txs.length;
        chainInfoObject.objectCounts = chainInfoObject.objectCounts.map(
            (count, ndx) => count + newObjectCounts[ndx],
        );
        await cache.db.putObject(
            NODE_SCHEMAS.DB_CHAIN_INFORMATION,
            NODE_SCHEMAS.DB_CHAIN_INFORMATION_KEY,
            chainInfoObject,
        );

        const { tokenRadixHash, vbRadixHash, radixHash, storageHash, appHash } =
            await this.computeApplicationHash(cache.tokenRadix, cache.vbRadix, cache.storage);

        return {
            txResults,
            totalFees,
            appHash,
            blockSize,
            microblocks,
        };
    }

    private async sendFeesFromFeesPayerAccountToFeesAccount(
        cache: Context,
        feesPayerAccount: Uint8Array,
        fees: number,
        chainReference: Uint8Array,
        sentAt: number,
    ) {
        const feesPayeeAccount = Economics.getSpecialAccountTypeIdentifier(ECO.ACCOUNT_BLOCK_FEES);
        this.logger.verbose(`Send fees from ${feesPayerAccount} to ${feesPayeeAccount}`);
        await cache.accountManager.tokenTransfer(
            {
                type: ECO.BK_PAID_TX_FEES,
                payerAccount: feesPayerAccount,
                payeeAccount: feesPayeeAccount,
                amount: fees,
            },
            {
                mbHash: chainReference,
            },
            sentAt,
        );
    }

    async computeApplicationHash(tokenRadix: RadixTree, vbRadix: RadixTree, storage: CachedStorage) {
        const perfMeasure = this.perf.start('computeApplicationHash');

        const tokenRadixHash = await tokenRadix.getRootHash();
        const vbRadixHash = await vbRadix.getRootHash();
        const radixHash = NodeCrypto.Hashes.sha256AsBinary(
            Utils.binaryFrom(vbRadixHash, tokenRadixHash),
        );
        const challengeGenerator = new ChallengeManager(storage, storage.getCachedLevelDb());
        const storageHash = await challengeGenerator.processChallenge(radixHash);
        const appHash = NodeCrypto.Hashes.sha256AsBinary(Utils.binaryFrom(radixHash, storageHash));

        this.logger.debug(`VB radix hash ...... : ${Utils.binaryToHexa(vbRadixHash)}`);
        this.logger.debug(`Token radix hash ... : ${Utils.binaryToHexa(tokenRadixHash)}`);
        this.logger.debug(`Radix hash ......... : ${Utils.binaryToHexa(radixHash)}`);
        this.logger.debug(`Storage hash ....... : ${Utils.binaryToHexa(storageHash)}`);
        this.logger.debug(`Application hash ... : ${Utils.binaryToHexa(appHash)}`);

        perfMeasure.end();

        return { tokenRadixHash, vbRadixHash, appHash, storageHash, radixHash };
    }

    async Commit(request: CommitRequest) {
        this.logger.log(`EVENT: commit`);

        if (this.finalizedBlockContext === null) {
            this.logger.warn(`nothing to commit`);
            return;
        }

        await this.finalizedBlockContext.db.commit();
        await this.finalizedBlockContext.storage.flush();
        this.logger.log(`Commit done`);

        this.finalizedBlockContext = null;

        // Create snapshots under conditions that we are not already importing snapshots and it is
        // the right period to generate snapshots.
        let retainedHeight = 0;
        const isNotImportingSnapshot = this.importedSnapshot === null;
        const snapshotBlockPeriod = this.nodeConfig.getSnapshotBlockPeriod();
        const chainInfoObject = await this.db.getChainInformationObject();
        const isTimeToGenerateSnapshot = chainInfoObject.height % snapshotBlockPeriod == 0;
        if (isNotImportingSnapshot && isTimeToGenerateSnapshot) {
            this.logger.log(`Creating snapshot at height ${chainInfoObject.height}`);
            const maxSnapshots = this.nodeConfig.getMaxSnapshots();
            await this.snapshot.clear(maxSnapshots - 1);
            await this.snapshot.create();
            this.logger.log(`Done creating snapshot`);

            // We preserve a certain amount of blocks that are not put in a snapshot.
            const blockHistoryBeforeSnapshot = this.nodeConfig.getBlockHistoryBeforeSnapshot();
            if (blockHistoryBeforeSnapshot) {
                retainedHeight = Math.max(0, chainInfoObject.height - blockHistoryBeforeSnapshot);
            }
        }

        // TODO: This test takes some time, so I comment it
        // !! BEGIN TEST
        /*
        this.logger.log(`Listing snapshots`);
        const list = await this.snapshot.getList();
        const lastSnapshot = list[list.length - 1];
        for(let n = 0; n < lastSnapshot.chunks; n++) {
            this.logger.log(`Loading snapshot chunk ${n + 1} out of ${lastSnapshot.chunks}`);
            const buffer = await this.snapshot.getChunk(this.storage, lastSnapshot.height, n);
            await this.snapshot.loadReceivedChunk(this.storage, n, buffer, n == lastSnapshot.chunks - 1);
        }
         */
        // !! END TEST

        return CommitResponse.create({
            retain_height: retainedHeight,
        });
    }

    async ListSnapshots(request: ListSnapshotsRequest) {
        this.logger.log(`EVENT: listSnapshots`);

        const list = await this.snapshot.getList();

        this.logger.log(`snapshot.getList()`, list.length);
        list.forEach((object) =>
            console.log({
                height: object.height,
                format: object.format,
                chunks: object.chunks,
                hash: Utils.binaryFromHexa(object.hash),
            }),
        );

        return ListSnapshotsResponse.create({
            snapshots: list.map((object) => {
                // FIXME: use serialized version of object.metadata?
                const metadata = new Uint8Array();

                return {
                    height: object.height,
                    format: object.format,
                    chunks: object.chunks,
                    hash: Utils.binaryFromHexa(object.hash),
                    metadata,
                };
            }),
        });
    }

    async LoadSnapshotChunk(request: LoadSnapshotChunkRequest) {
        this.logger.log(`EVENT: loadSnapshotChunk height=${request.height}`);

        const chunk = await this.snapshot.getChunk(this.storage, request.height, request.chunk);

        return LoadSnapshotChunkResponse.create({
            chunk,
        });
    }

    async OfferSnapshot(request: OfferSnapshotRequest) {
        this.logger.log(`EVENT: offerSnapshot`);

        this.importedSnapshot = request.snapshot;

        return OfferSnapshotResponse.create({
            result: OfferSnapshotResult.OFFER_SNAPSHOT_RESULT_ACCEPT,
        });
    }

    async ApplySnapshotChunk(request: ApplySnapshotChunkRequest) {
        this.logger.log(`EVENT: applySnapshotChunk index=${request.index}`);

        const isLast = request.index == this.importedSnapshot.chunks - 1;
        await this.snapshot.loadReceivedChunk(this.storage, request.index, request.chunk, isLast);
        const result = ApplySnapshotChunkResult.APPLY_SNAPSHOT_CHUNK_RESULT_ACCEPT;

        return ApplySnapshotChunkResponse.create({
            result,
            refetch_chunks: [],
            reject_senders: [],
        });
    }

    /**
     Checks a microblock and invokes the section callbacks of the node.
     */
    private async checkMicroblock(
        context: Context,
        checker: MicroblockChecker,
        timestamp: number = Utils.getTimestampInSeconds(),
        executedDuringGenesis = false,
    ): Promise<MicroblockCheckResult> {
        const microblockCheckTimer = this.perf.start('checking microblock');
        try {
            await checker.reconstructMicroblockAndVirtualBlockchainOrFail();
            checker.checkGasOrFail();
            if (!executedDuringGenesis) {
                checker.checkTimestampOrFail();
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            this.logger.error(`Microblock rejected: ${errorMessage}`);
            this.logger.debug(`Error details:`, error);
            return {
                checked: false,
                error: errorMessage
            };
        } finally {
            microblockCheckTimer.end();
        }


        //const sectionProcessingTimer = this.perf.start('processing sections');
        const vb = checker.getVirtualBlockchain();
        const mb = checker.getMicroblock();
        /*
        const context: Context = {
            cache,
            object: {},
            vb,
            mb,
            section: 1,
            timestamp,
        };

         */

        try {
            const stateUpdater = GlobalStateUpdater.createUpdater();
            await stateUpdater.updateGlobalState(context, vb, mb);
            //await this.invokeSectionPostUpdateCallback(vb.getType(), section.type, context);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            this.logger.error(`Microblock rejected: ${errorMessage}`, error);
            this.logger.debug(`Error details:`, error);
            return {
                checked: false,
                error: errorMessage
            };
        }
        /*
        for (const section of mb.getAllSections()) {

            try {
                await this.invokeSectionPostUpdateCallback(vb.getType(), section.type, context);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Unknown error";
                this.logger.error(`Microblock rejected: ${errorMessage}`, error);
                this.logger.debug(`Error details:`, error);
                return {
                    checked: false,
                    error: errorMessage
                };
            }
        }



        sectionProcessingTimer.end();

         */

        const indexTableId = this.getIndexTableId(vb.getType());

        if (indexTableId != -1) {
            await context.db.putObject(indexTableId, vb.getId(), {});
        }

        this.logger.log(`Microblock ${mb.getHash().encode()} accepted`);
        return { checked: true };

        /*
        if (executedDuringGenesis) {
            this.logger.log(
                'Micro-block verification performed during genesis, skipping timestamp verification',
            );
            //await checker.checkHeader();
            //await checker.instantiateVirtualBlockchain();
            //await checker.importMicroblock();
            await checker.checkGas();
        } else {
            //          this.logger.log(`Checking microblock ${Utils.binaryToHexa(importer.hash)}`);


            const status =
                (await checker.checkHeader()) ||
                (await checker.checkTimestamp(timestamp)) ||
                (await checker.instantiateVirtualBlockchain()) ||
                (await checker.importMicroblock()) ||
                (await checker.checkGas());



            const checkFailed = status !== 0;

            if (checkFailed) {

            }


        }

         */


    }

    private async setBlockInformation(
        cache: Context,
        height: number,
        hash: Uint8Array,
        timestamp: number,
        proposerAddress: Uint8Array,
        size: number,
        microblockCount: number,
    ) {
        await cache.db.putObject(NODE_SCHEMAS.DB_BLOCK_INFORMATION, this.heightToTableKey(height), {
            hash,
            timestamp,
            proposerAddress,
            size,
            microblockCount,
        });
    }

    private async setBlockContent(cache: Context, height: number, microblocks: any[]) {
        await cache.db.putObject(NODE_SCHEMAS.DB_BLOCK_CONTENT, this.heightToTableKey(height), {
            microblocks,
        });
    }

    private heightToTableKey(height: number) {
        return LevelDb.convertHeightToTableKey(height);
    }

    private getIndexTableId(type) {
        return LevelDb.getTableIdFromVirtualBlockchainType(type);
    }

    private getCacheInstance(txs: Uint8Array[]): Context {
        const db = new CachedLevelDb(this.db);
        const storage = new Storage(db, this.storagePath);
        const cachedStorage = new CachedStorage(storage, db, txs);
        const cachedInternalProvider = new NodeProvider(db, storage);
        const cachedProvider = new Provider(cachedInternalProvider, new NullNetworkProvider());
        const vbRadix = new RadixTree(db, NODE_SCHEMAS.DB_VB_RADIX);
        const tokenRadix = new RadixTree(db, NODE_SCHEMAS.DB_TOKEN_RADIX);
        const accountManager = new AccountManager(db, tokenRadix, this.logger);
        const validatorSetUpdate: any[] = [];

        return {
            provider: cachedProvider,
            db,
            storage: cachedStorage,
            accountManager,
            vbRadix,
            tokenRadix,
            validatorSetUpdate,
        };
    }

    private async clearDatabase() {
        this.logger.log(`Clearing database`);
        await this.db.clear();
    }

    private async clearStorage() {
        this.logger.log(`Clearing storage`);
        await this.storage.clear();
    }

    private async clearSnapshots() {
        this.logger.log(`Clearing snapshots`);
        await this.snapshot.clear(0);
    }

    Echo(request: EchoRequest): Promise<EchoResponse> {
        return Promise.resolve({
            message: `Echo: ${request.message}`,
        });
    }

    Flush(request: FlushRequest): Promise<FlushResponse> {
        return Promise.resolve(undefined);
    }
}
