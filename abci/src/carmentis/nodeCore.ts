import path from 'node:path';
import { NODE_SCHEMAS } from './constants/constants';
import { NodeProvider } from './nodeProvider';
import { Storage } from './storage';
import { SnapshotsManager } from './snapshotsManager';
import { AccountManager } from './accountManager';
import { LevelDb } from './levelDb';
import { RadixTree } from './radixTree';
import { CachedLevelDb } from './cachedLevelDb';
import {
    ApplySnapshotChunkRequest,
    ApplySnapshotChunkResponse,
    ApplySnapshotChunkResult,
    CheckTxRequest,
    CommitRequest,
    CommitResponse,
    ExecTxResult,
    ExtendVoteRequest,
    FinalizeBlockRequest,
    FinalizeBlockResponse,
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
    ProcessProposalRequest,
    ProcessProposalStatus,
    Snapshot,
    VerifyVoteExtensionRequest,
    Snapshot as SnapshotProto,
} from '../proto-ts/cometbft/abci/v1/types';

import {
    Base64,
    Blockchain,
    CHAIN,
    CMTSToken,
    Crypto,
    CryptographicHash,
    CryptoSchemeFactory,
    ECO,
    Economics, EncoderFactory,
    Hash,
    KeyedProvider,
    MessageSerializer,
    MessageUnserializer,
    Microblock,
    MicroblockImporter,
    NullNetworkProvider, PrivateSignatureKey,
    Provider,
    PublicSignatureKey,
    SCHEMAS, Secp256k1PrivateSignatureKey,
    SECTIONS, StringSignatureEncoder,
    Utils, VirtualBlockchain,
    VirtualBlockchainType,
} from '@cmts-dev/carmentis-sdk/server';
import { Logger } from '@nestjs/common';
import { QueryCallback } from './types/QueryCallback';
import { SectionCallback } from './types/SectionCallback';
import { ABCIQueryHandler } from './ABCIQueryHandler';
import { CometBFTPublicKeyConverter } from './CometBFTPublicKeyConverter';
import { KeyManagementService } from '../key-management.service';
import { InitialBlockchainStateBuilder } from './InitialBlockchainStateBuilder';
import { AccountInformation } from './types/AccountInformation';

const APP_VERSION = 1;

const nodeConfig = {
    snapshotBlockPeriod: 1,
    blockHistoryBeforeSnapshot: 0,
    maxSnapshots: 3,
};

interface Cache {
    db: CachedLevelDb;
    storage: Storage;
    blockchain: Blockchain;
    accountManager: AccountManager;
    vbRadix: RadixTree;
    tokenRadix: RadixTree;
    validatorSetUpdate: any[];
}

const SNAPSHOT_PERIOD = 1;

export class NodeCore {
    logger: Logger;
    accountManager: AccountManager;
    blockchain: Blockchain;
    db: LevelDb;
    storage: Storage;
    snapshot: SnapshotsManager;
    sectionCallbacks: Map<number, SectionCallback>;
    finalizedBlockCache: Cache | null;
    importedSnapshot: SnapshotProto | null;

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

    // The KMS is used to handle private keys.
    private kms: KeyManagementService;

    constructor(logger: Logger, abciStoragePath: string, kms: KeyManagementService) {
        this.logger = logger;
        this.kms = kms;

        // define the paths where are stored the database, the storage and the snapshots.
        this.dbPath = path.join(abciStoragePath, 'db');
        this.storagePath = path.join(abciStoragePath, 'microblocks');
        this.snapshotPath = path.join(abciStoragePath, 'snapshots');

        // Create and initialize the database.
        this.db = new LevelDb(this.dbPath, NODE_SCHEMAS.DB);
        this.db.initialize();

        // Create and initialize file storage management and snapshot management.
        this.storage = new Storage(this.db, this.storagePath, []);
        this.snapshot = new SnapshotsManager(this.db, this.snapshotPath, this.logger);

        // Create unauthenticated blockchain client
        const internalProvider = new NodeProvider(this.db, this.storage);
        const provider = new Provider(internalProvider, new NullNetworkProvider());
        this.blockchain = new Blockchain(provider);
        this.accountManager = new AccountManager(this.db, this.tokenRadix);

        // Set up the ABCI query handler
        this.abciQueryHandler = new ABCIQueryHandler(this.blockchain, this.db, this.accountManager);

        // instantiate radix trees
        this.vbRadix = new RadixTree(this.db, NODE_SCHEMAS.DB_VB_RADIX);
        this.tokenRadix = new RadixTree(this.db, NODE_SCHEMAS.DB_TOKEN_RADIX);

        this.finalizedBlockCache = null;

        // we do not import snapshot by default
        this.importedSnapshot = null;

        // we register the callbacks for the sections
        this.sectionCallbacks = new Map();
        this.registerSectionCallbacks();
    }

    private registerSectionCallbacks() {
        this.registerSectionPostUpdateCallbacks(CHAIN.VB_ACCOUNT, [
            [SECTIONS.ACCOUNT_TOKEN_ISSUANCE, this.accountTokenIssuanceCallback],
            [SECTIONS.ACCOUNT_CREATION, this.accountCreationCallback],
            [SECTIONS.ACCOUNT_TRANSFER, this.accountTokenTransferCallback],
        ]);

        this.registerSectionPostUpdateCallbacks(CHAIN.VB_VALIDATOR_NODE, [
            [SECTIONS.VN_DESCRIPTION, this.validatorNodeDescriptionCallback],
            [SECTIONS.VN_NETWORK_INTEGRATION, this.validatorNodeNetworkIntegrationCallback],
        ]);
    }

    /**
     Account callbacks
     */
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
            this.logger,
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
            this.logger,
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
            this.logger,
        );
    }

    /**
     Validator node callbacks
     */
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

        context.cache.validatorSetUpdate.push({
            power: networkIntegration.votingPower,
            pub_key_type: context.section.object.cometPublicKeyType,
            pub_key_bytes: cometPublicKeyBytes,
        });
    }

    async validatorNodeNetworkIntegrationCallback(context: any) {
        const description = await context.object.getDescription();
        const cometPublicKeyBytes = Base64.decodeBinary(description.cometPublicKey);

        context.cache.validatorSetUpdate.push({
            power: context.section.object.votingPower,
            pub_key_type: description.cometPublicKeyType,
            pub_key_bytes: cometPublicKeyBytes,
        });
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

    async invokeSectionPreUpdateCallback(objectType: number, sectionType: number, context: any) {
        await this.invokeSectionCallback(objectType, sectionType, context, 0);
    }

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

    /**
     * Handle queries sent to the CometBFT's abci_query method.
     *
     * @param serializedQuery
     */
    async query(serializedQuery: Uint8Array): Promise<Uint8Array> {
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

    async info(request: InfoRequest) {
        this.logger.log(`info`);
        this.importedSnapshot = null;

        const chainInfoObject = <any>(
            await this.db.getObject(
                NODE_SCHEMAS.DB_CHAIN_INFORMATION,
                NODE_SCHEMAS.DB_CHAIN_INFORMATION_KEY,
            )
        ) || {
            height: 0,
        };

        const { appHash } = await this.computeApplicationHash(
            this.tokenRadix,
            this.vbRadix,
            this.storage,
        );

        return InfoResponse.create({
            version: '1',
            data: 'Carmentis ABCI application',
            app_version: APP_VERSION,
            last_block_height: chainInfoObject.height,
            last_block_app_hash: appHash,
        });
    }

    async initChain(request: InitChainRequest) {
        // we start by cleaning database, snapshots and storage
        await this.clearDatabase();
        await this.clearStorage();
        await this.clearSnapshots();


        // depending on if the current node is a genesis node or not
        const isGenesisNode = await this.isGenesisNode();
        if (isGenesisNode) {
            const appHash = await this.initChainAsGenesis(request);
            return this.createInitChainResponse(appHash);
        } else {
            const appHash = await this.initChainAsNode(request);
            return this.createInitChainResponse(appHash)
        }
    }


    private async isGenesisNode() {
        // TODO: to be implemented
        return false;
    }

    private async initChainAsNode(request: InitChainRequest) {
        //
        const genesisSnapshot = await this.searchGenesisSnapshotFromNetwork();
        await this.saveReceivedGenesisSnapshot(genesisSnapshot);
        const {appHash} = await this.computeApplicationHash(this.tokenRadix, this.vbRadix, this.storage);
        return appHash;
    }

    private async saveReceivedGenesisSnapshot(genesisSnapshot: Uint8Array[]) {
        await this.snapshot.loadReceivedChunk(this.storage, 0, genesisSnapshot[0]);
        await this.snapshot.loadReceivedChunk(this.storage, 1, genesisSnapshot[1]);
    }

    private async initChainAsGenesis(request: InitChainRequest) {
        //
        await this.storeInitialValidatorSet(request);

        // we construct a keyed blockchain client equipped with a dummy, static private key
        const issuerPrivateKey = this.kms.getIssuerPrivateKey();
        const staticEncodedPrivateKey = "SIG:SECP256K1:SK{dec3278ad230e1912b988b818ecfb7371443d4fc288436925a074ecac3fa7ca3}";
        const encoder = StringSignatureEncoder.defaultStringSignatureEncoder();
        const dummyPrivateSignatureKey = encoder.decodePrivateKey(staticEncodedPrivateKey);
        const internalProvider = new NodeProvider(this.db, this.storage);
        const provider = new KeyedProvider(issuerPrivateKey, internalProvider, new NullNetworkProvider());
        const blockchain = new Blockchain(provider);


        this.logger.log(`Creating initial state for initial height ${request.initial_height}`);
        const appHash = await this.publishInitialBlockchainState(
            blockchain,
            issuerPrivateKey,
            request
        );


        // we create the genesis state snapshot and export it.
        await this.storeGenesisStateSnapshot();
        await this.exportGenesisStateAsSnapshot();

        return appHash;

    }

    private async storeGenesisStateSnapshot() {
        this.logger.log(`Creating genesis snapshot`);
        await this.snapshot.create();
    }


    private async searchGenesisSnapshotFromNetwork() {
        // TODO: we currently return it
        const encoder = EncoderFactory.bytesToBase64Encoder();
        const snapshot = {
            "firstChunk": "AAAAAAACAAAAAwAAABYAABPQAAAXwv8AABEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD5/wAAOwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAO3/AACDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAzP8AAPMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAClAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADKkAAAAAAAAAAAypAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAHKkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYf",
            "secondChunk": "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"
        }
        return [encoder.decode(snapshot.firstChunk), encoder.decode(snapshot.secondChunk)];
    }

    private async exportGenesisStateAsSnapshot() {
        // we assume that after the genesis state, the chain contains three blocks (starting at zero).
        const chainHeightAfterGenesis = 2;

        // the genesis state's chunks are encoded in base64
        const base64Encoder = EncoderFactory.bytesToBase64Encoder();

        // we generate and export the genesis state as a snapshot
        const firstChunk = await this.snapshot.getChunk(this.storage, chainHeightAfterGenesis, 0);
        const secondChunk = await this.snapshot.getChunk(this.storage, chainHeightAfterGenesis, 1);
        const genesisState = {
            firstChunk: base64Encoder.encode(firstChunk),
            secondChunk: base64Encoder.encode(secondChunk),
        };

        // we now display the genesis state
        console.log(JSON.stringify(genesisState, null, 2));
    }

    private createInitChainResponse(appHash: Uint8Array) {
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
        const consensusParams = {};
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

    private async publishInitialBlockchainState(blockchain: Blockchain, dummyPrivateSignatureKey: PrivateSignatureKey, request: InitChainRequest) {
        // we first create a blockchain client equipped with the key of the
        const issuerPrivateKey = this.kms.getIssuerPrivateKey();
        const stateBuilder = new InitialBlockchainStateBuilder(
            request,
            dummyPrivateSignatureKey,
            issuerPrivateKey,
            blockchain,
        );

        // we first publish the issuer account creation transaction and carmentis organisation creation transaction
        const issuerAccountCreationTransaction = await stateBuilder.createIssuerAccountCreationTransaction();
        const { organizationId, organisationCreationTransaction } = await stateBuilder.createCarmentisOrganisationCreationTransaction();
        const transactionsPublishedInFirstBlock = [ issuerAccountCreationTransaction, organisationCreationTransaction ];
        await this.publishGenesisTransactions(transactionsPublishedInFirstBlock, 0);

        // in the second block, we publish the genesis node declaration transaction
        const { genesisNodePublicKey, genesisNodePublicKeyType } = stateBuilder.getValidatorPublicKeyFromRequest();
        const { genesisNodeId, genesisNodeDeclarationTransaction } = await stateBuilder.createGenesisNodeDeclarationTransaction(
                organizationId,
                genesisNodePublicKey,
                genesisNodePublicKeyType,
            );
        await this.publishGenesisTransactions([genesisNodeDeclarationTransaction], 1);

        // finally, in the third block, we publish the grant to be a validator for the genesis node
        const genesisNodeValidatorGrantTransaction = await stateBuilder.createGenesisNodeValidatorGrantTransaction(genesisNodeId);
        return await this.publishGenesisTransactions([genesisNodeValidatorGrantTransaction], 2);
    }

    private async publishGenesisTransactions(
        transactions: Uint8Array[],
        publishedBlockHeight: number,
    ) {
        // Since we are publishing transactions at the genesis, publication timestamp is at the lowest possible value.
        // The proposer address is undefined since we do not have published this node.
        const blockTimestamp =  Math.floor(Date.now() / 1000);
        const proposerAddress = new Uint8Array(32);


        const cache = this.getCacheInstance(transactions);
        const processBlockResult = await this.processBlock(
            cache,
            publishedBlockHeight,
            blockTimestamp,
            transactions,
        );
        const appHash = processBlockResult.appHash;
        await this.setBlockInformation(
            cache,
            publishedBlockHeight,
            appHash,
            blockTimestamp,
            proposerAddress,
            processBlockResult.blockSize,
            transactions.length
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
    async checkTx(request: CheckTxRequest) {
        this.logger.log(`checkTx`);

        const cache = this.getCacheInstance([]);
        const importer = cache.blockchain.getMicroblockImporter(
            Utils.bufferToUint8Array(request.tx),
        );
        const success = await this.checkMicroblock(cache, importer);

        // In case of microblock check success, we log the content of the microblock
        if (success) {
            this.logger.log(`Type: ${CHAIN.VB_NAME[importer.vb.type]}`);
            this.logger.log(`Total size: ${request.tx.length} bytes`);

            const vb: any = await importer.getVirtualBlockchain();
            for (const section of vb.currentMicroblock.sections) {
                const sectionLabel = SECTIONS.DEF[importer.vb.type][section.type].label;
                const sectionLengthInBytes = section.data.length;
                const message = `${(sectionLabel + ' ').padEnd(36, '.')} ${sectionLengthInBytes} byte(s)`;
                this.logger.log(message);
            }
        }

        return {
            success,
            error: importer.error,
        };
    }

    /**
      Executed by the proposer
    */
    async prepareProposal(request: PrepareProposalRequest) {
        this.logger.log(`prepareProposal: ${request.txs.length} txs`);

        const proposedTxs = [];
        for (const tx of request.txs) {
            proposedTxs.push(tx);
        }

        return proposedTxs;
    }

    /**
      Executed by all validators
      answer:
        PROPOSAL_UNKNOWN = 0; // Unknown status. Returning this from the application is always an error.
        PROPOSAL_ACCEPT  = 1; // Status that signals that the application finds the proposal valid.
        PROPOSAL_REJECT  = 2; // Status that signals that the application finds the proposal invalid.
    */
    async processProposal(request: ProcessProposalRequest) {
        this.logger.log(`processProposal: ${request.txs.length} txs`);

        const cache = this.getCacheInstance(request.txs);
        const blockHeight = +request.height;
        const blockTimestamp = +(request.time?.seconds ?? 0);
        const processBlockResult = await this.processBlock(
            cache,
            blockHeight,
            blockTimestamp,
            request.txs,
        );

        this.logger.log(
            `processProposal / total block fees: ${processBlockResult.totalFees / ECO.TOKEN} ${ECO.TOKEN_NAME}`,
        );

        return ProcessProposalStatus.PROCESS_PROPOSAL_STATUS_ACCEPT;
    }

    async extendVote(request: ExtendVoteRequest) {
        // not implemented
    }

    async verifyVoteExtension(request: VerifyVoteExtensionRequest) {
        // not implemented
    }

    async finalizeBlock(request: FinalizeBlockRequest) {
        // raise a warning if finalizedBlock() called before commit()
        if (this.finalizedBlockCache !== null) {
            this.logger.warn(`finalizeBlock() called before the previous commit()`);
        }
        this.finalizedBlockCache = this.getCacheInstance(request.txs);

        const numberOfTransactionsInBlock = request.txs.length;
        this.logger.log(`finalizeBlock: ${numberOfTransactionsInBlock} txs`);

        // Extract height and timestamp of the block being published, as well as the votes
        // of validator involved in the publishing of this block. We proceed to the payment of the
        // validators.
        const blockHeight = +request.height;
        const blockTimestamp = +(request.time?.seconds ?? 0);
        const votes = request.decided_last_commit?.votes || [];
        await this.payValidators(this.finalizedBlockCache, votes, blockHeight, blockTimestamp);

        const processBlockResult = await this.processBlock(
            this.finalizedBlockCache,
            blockHeight,
            blockTimestamp,
            request.txs,
        );
        const fees = CMTSToken.createAtomic(processBlockResult.totalFees);
        this.logger.log(`Total block fees: ${fees.toString()}`);

        await this.setBlockInformation(
            this.finalizedBlockCache,
            blockHeight,
            request.hash,
            blockTimestamp,
            request.proposer_address,
            processBlockResult.blockSize,
            request.txs.length,
        );

        await this.setBlockContent(
            this.finalizedBlockCache,
            blockHeight,
            processBlockResult.microblocks,
        );

        return FinalizeBlockResponse.create({
            tx_results: processBlockResult.txResults,
            app_hash: processBlockResult.appHash,
            events: [],
            validator_updates: [], //this.finalizedBlockCache.validatorSetUpdate,
            consensus_param_updates: undefined,
        });
    }

    async payValidators(cache: any, votes: any, blockHeight: number, blockTimestamp: number) {
        this.logger.log(`payValidators`);

        /**
          get the pending fees from the fees account
        */
        const feesAccountIdentifier = Economics.getSpecialAccountTypeIdentifier(
            ECO.ACCOUNT_BLOCK_FEES,
        );
        const feesAccountInfo: AccountInformation =
            await cache.accountManager.loadInformation(feesAccountIdentifier);
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
                    const validatorNode = await cache.blockchain.loadValidatorNode(
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
        const feesQuotient = Math.floor(pendingFees / nValidators);
        const feesRest = pendingFees % nValidators;

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
                this.logger,
            );
        }
    }

    async processGenesisBlock(
        cache: any,
        blockHeight: number,
        timestamp: number,
        txs: { microBlockType: VirtualBlockchainType; tx: Uint8Array }[],
    ) {
        this.logger.log(`processGenesisBlock`);

        const txResults = [];
        const microblocks = [];
        let blockSize = 0;

        for (const txId in txs) {
            const { microBlockType, tx } = txs[txId];
            const importer: MicroblockImporter = cache.blockchain.getMicroblockImporter(Utils.bufferToUint8Array(tx));
            console.log("Checking microblock")
            const success = await this.checkMicroblock(
                cache,
                importer,
                timestamp,
                false,
            );

            console.log("get vb")
            const vb: VirtualBlockchain<any> = await importer.getVirtualBlockchain();


            blockSize += tx.length;

            this.logger.log(`Storing microblock ${Utils.binaryToHexa(vb.currentMicroblock.hash)}`);
            await importer.store();

            const mb = vb.currentMicroblock;
            const type = vb.type;
            const sectionCount = mb.sections.length;
            microblocks.push({
                hash: mb.hash,
                vbIdentifier: mb.hash,
                vbType: type,
                height: 1, // every block we are creating are genesis microblocks
                size: tx.length,
                sectionCount,
            });

            await cache.storage.writeMicroblock(0, txId);

            const stateData =
                await cache.blockchain.provider.getVirtualBlockchainStateInternal(vb.identifier);
            const stateHash = Crypto.Hashes.sha256AsBinary(stateData);
            await cache.vbRadix.set(vb.identifier, stateHash);

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
        }

        const chainInfoObject = (await cache.db.getObject(
            NODE_SCHEMAS.DB_CHAIN_INFORMATION,
            NODE_SCHEMAS.DB_CHAIN_INFORMATION_KEY,
        )) || {
            microblockCount: 0,
            objectCounts: Array(CHAIN.N_VIRTUAL_BLOCKCHAINS).fill(0),
        };

        chainInfoObject.height = blockHeight;
        chainInfoObject.lastBlockTimestamp = timestamp;
        chainInfoObject.microblockCount += txs.length;
        chainInfoObject.objectCounts = chainInfoObject.objectCounts.map((count, ndx) => count);
        await cache.db.putObject(
            NODE_SCHEMAS.DB_CHAIN_INFORMATION,
            NODE_SCHEMAS.DB_CHAIN_INFORMATION_KEY,
            chainInfoObject,
        );

        const { tokenRadixHash, vbRadixHash, radixHash, storageHash, appHash } =
            await this.computeApplicationHash(cache.tokenRadix, cache.vbRadix, cache.storage);

        this.logger.debug(`VB radix hash ...... : ${Utils.binaryToHexa(vbRadixHash)}`);
        this.logger.debug(`Token radix hash ... : ${Utils.binaryToHexa(tokenRadixHash)}`);
        this.logger.debug(`Radix hash ......... : ${Utils.binaryToHexa(radixHash)}`);
        this.logger.debug(`Storage hash ....... : ${Utils.binaryToHexa(storageHash)}`);
        this.logger.debug(`Application hash ... : ${Utils.binaryToHexa(appHash)}`);

        return {
            txResults,
            appHash,
            blockSize,
            microblocks,
        };
    }

    async processBlock(
        cache: any,
        blockHeight: number,
        timestamp: number,
        txs: any,
        executedDuringGenesis = false,
    ) {
        this.logger.log(`processBlock`);

        const txResults = [];
        const newObjects = Array(CHAIN.N_VIRTUAL_BLOCKCHAINS).fill(0);
        const microblocks = [];
        let totalFees = 0;
        let blockSize = 0;
        let blockSectionCount = 0;

        for (const txId in txs) {
            const tx = txs[txId];
            const importer = cache.blockchain.getMicroblockImporter(Utils.bufferToUint8Array(tx));
            const success = await this.checkMicroblock(
                cache,
                importer,
                timestamp,
                executedDuringGenesis,
            );

            const vb: any = await importer.getVirtualBlockchain();

            if (vb.height == 1) {
                newObjects[vb.type]++;
            }

            blockSize += tx.length;

            const fees = Math.floor(
                (vb.currentMicroblock.header.gas * vb.currentMicroblock.header.gasPrice) /
                    ECO.GAS_UNIT,
            );
            const feesPayerAccount = vb.currentMicroblock.getFeesPayerAccount();

            totalFees += fees;

            this.logger.log(`Storing microblock ${Utils.binaryToHexa(vb.currentMicroblock.hash)}`);
            this.logger.log(
                `Fees: ${fees / ECO.TOKEN} ${ECO.TOKEN_NAME}, paid by ${cache.accountManager.getShortAccountString(feesPayerAccount)}`,
            );

            await importer.store();

            const sectionCount = vb.currentMicroblock.sections.length;

            microblocks.push({
                hash: vb.currentMicroblock.hash,
                vbIdentifier: vb.identifier,
                vbType: vb.type,
                height: vb.height,
                size: tx.length,
                sectionCount,
            });

            blockSectionCount += sectionCount;

            await cache.storage.writeMicroblock(importer.vb.expirationDay, txId);

            const stateData = await cache.blockchain.provider.getVirtualBlockchainStateInternal(
                importer.vb.identifier,
            );
            const stateHash = Crypto.Hashes.sha256AsBinary(stateData);
            await cache.vbRadix.set(importer.vb.identifier, stateHash);

            const isFeesPayerAccountDefined = feesPayerAccount !== null;
            if (isFeesPayerAccountDefined) {
                const chainReference = vb.currentMicroblock.hash as Uint8Array;
                await this.sendFeesFromFeesPayerAccountToFeesAccount(
                    cache,
                    feesPayerAccount,
                    fees,
                    chainReference,
                    timestamp,
                );
            }

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
        }

        const chainInfoObject = (await cache.db.getObject(
            NODE_SCHEMAS.DB_CHAIN_INFORMATION,
            NODE_SCHEMAS.DB_CHAIN_INFORMATION_KEY,
        )) || {
            microblockCount: 0,
            objectCounts: Array(CHAIN.N_VIRTUAL_BLOCKCHAINS).fill(0),
        };

        chainInfoObject.height = blockHeight;
        chainInfoObject.lastBlockTimestamp = timestamp;
        chainInfoObject.microblockCount += txs.length;
        chainInfoObject.objectCounts = chainInfoObject.objectCounts.map(
            (count, ndx) => count + newObjects[ndx],
        );
        await cache.db.putObject(
            NODE_SCHEMAS.DB_CHAIN_INFORMATION,
            NODE_SCHEMAS.DB_CHAIN_INFORMATION_KEY,
            chainInfoObject,
        );

        const { tokenRadixHash, vbRadixHash, radixHash, storageHash, appHash } =
            await this.computeApplicationHash(cache.tokenRadix, cache.vbRadix, cache.storage);

        this.logger.debug(`VB radix hash ...... : ${Utils.binaryToHexa(vbRadixHash)}`);
        this.logger.debug(`Token radix hash ... : ${Utils.binaryToHexa(tokenRadixHash)}`);
        this.logger.debug(`Radix hash ......... : ${Utils.binaryToHexa(radixHash)}`);
        this.logger.debug(`Storage hash ....... : ${Utils.binaryToHexa(storageHash)}`);
        this.logger.debug(`Application hash ... : ${Utils.binaryToHexa(appHash)}`);

        return {
            txResults,
            totalFees,
            appHash,
            blockSize,
            microblocks,
        };
    }

    private async sendFeesFromFeesPayerAccountToFeesAccount(
        cache: Cache,
        feesPayerAccount: Uint8Array,
        fees: number,
        chainReference: Uint8Array,
        sentAt: number,
    ) {
        await cache.accountManager.tokenTransfer(
            {
                type: ECO.BK_PAID_TX_FEES,
                payerAccount: feesPayerAccount,
                payeeAccount: Economics.getSpecialAccountTypeIdentifier(ECO.ACCOUNT_BLOCK_FEES),
                amount: fees,
            },
            {
                mbHash: chainReference,
            },
            sentAt,
            this.logger,
        );
    }

    async computeApplicationHash(tokenRadix: RadixTree, vbRadix: RadixTree, storage: Storage) {
        const tokenRadixHash = await tokenRadix.getRootHash();
        const vbRadixHash = await vbRadix.getRootHash();
        const radixHash = Crypto.Hashes.sha256AsBinary(
            Utils.binaryFrom(vbRadixHash, tokenRadixHash),
        );
        const storageHash = await storage.processChallenge(radixHash);
        const appHash = Crypto.Hashes.sha256AsBinary(Utils.binaryFrom(radixHash, storageHash));

        return { tokenRadixHash, vbRadixHash, radixHash, storageHash, appHash };
    }

    async commit(request: CommitRequest) {
        if (this.finalizedBlockCache === null) {
            throw new Error(`nothing to commit`);
        }

        await this.finalizedBlockCache.db.commit();
        await this.finalizedBlockCache.storage.flush();

        this.finalizedBlockCache = null;

        this.logger.log(`Commit done`);

        const chainInfoObject = <any>(
            await this.db.getObject(
                NODE_SCHEMAS.DB_CHAIN_INFORMATION,
                NODE_SCHEMAS.DB_CHAIN_INFORMATION_KEY,
            )
        );

        // Create snapshots under conditions that we are not already importing snapshots and it is
        // the right period to generate snapshots.
        let retainedHeight = 0;
        const isNotImportingSnapshot = this.importedSnapshot === null;
        const isTimeToGenerateSnapshot =
            chainInfoObject.height % nodeConfig.snapshotBlockPeriod == 0;
        if (isNotImportingSnapshot && isTimeToGenerateSnapshot) {
            this.logger.log(`Creating snapshot at height ${chainInfoObject.height}`);
            await this.snapshot.clear(nodeConfig.maxSnapshots - 1);
            await this.snapshot.create();
            this.logger.log(`Done creating snapshot`);

            // We preserve a certain amount of blocks that are not put in a snapshot.
            if (nodeConfig.blockHistoryBeforeSnapshot) {
                retainedHeight = Math.max(
                    0,
                    chainInfoObject.height - nodeConfig.blockHistoryBeforeSnapshot,
                );
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

    async listSnapshots(request: ListSnapshotsRequest) {
        this.logger.log(`listSnapshots`);

        const list = await this.snapshot.getList();

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

    async loadSnapshotChunk(request: LoadSnapshotChunkRequest) {
        this.logger.log(`loadSnapshotChunk height=${request.height}`);

        const chunk = await this.snapshot.getChunk(this.storage, request.height, request.chunk);

        return LoadSnapshotChunkResponse.create({
            chunk,
        });
    }

    async offerSnapshot(request: OfferSnapshotRequest) {
        this.logger.log(`offerSnapshot`);

        this.importedSnapshot = request.snapshot;

        return OfferSnapshotResponse.create({
            result: OfferSnapshotResult.OFFER_SNAPSHOT_RESULT_ACCEPT,
        });
    }

    async applySnapshotChunk(request: ApplySnapshotChunkRequest) {
        this.logger.log(`applySnapshotChunk index=${request.index}`);

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
        cache: Cache,
        importer: MicroblockImporter,
        timestamp: number = Utils.getTimestampInSeconds(),
        executedDuringGenesis = false,
    ) {
        if (executedDuringGenesis) {
            this.logger.log(
                'Micro-block verification performed during genesis, skipping verification',
            );
            await importer.checkHeader();
            await importer.instantiateVirtualBlockchain();
            await importer.importMicroblock();
            await importer.checkGas();
        } else {
            this.logger.log(`Checking microblock ${Utils.binaryToHexa(importer.hash)}`);
            const status =
                (await importer.checkHeader()) ||
                (await importer.checkTimestamp(timestamp)) ||
                (await importer.instantiateVirtualBlockchain()) ||
                (await importer.importMicroblock()) ||
                (await importer.checkGas());

            const checkFailed = status !== 0;
            if (checkFailed) {
                this.logger.error(`Rejected with status ${status}: ${importer.error}`);
                return false;
            }
        }

        for (const section of importer.vb.currentMicroblock.sections) {
            const context = {
                cache,
                object: importer.object,
                vb: importer.vb,
                mb: importer.vb.currentMicroblock,
                section,
                timestamp,
            };
            await this.invokeSectionPostUpdateCallback(importer.vb.type, section.type, context);
        }

        const indexTableId = this.getIndexTableId(importer.vb.type);

        if (indexTableId != -1) {
            await cache.db.putObject(indexTableId, importer.vb.identifier, {});
        }

        this.logger.log(`Accepted`);
        return true;
    }

    private async setBlockInformation(
        cache: Cache,
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

    private async setBlockContent(cache: Cache, height: number, microblocks: any[]) {
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

    private getCacheInstance(txs: Uint8Array[]): Cache {
        const db = new CachedLevelDb(this.db);
        const storage = new Storage(db, this.storagePath, txs);
        const cachedInternalProvider = new NodeProvider(db, storage);
        const cachedProvider = new Provider(cachedInternalProvider, new NullNetworkProvider());
        const blockchain = new Blockchain(cachedProvider);
        const vbRadix = new RadixTree(db, NODE_SCHEMAS.DB_VB_RADIX);
        const tokenRadix = new RadixTree(db, NODE_SCHEMAS.DB_TOKEN_RADIX);
        const accountManager = new AccountManager(db, tokenRadix);
        const validatorSetUpdate: any[] = [];

        return { db, storage, blockchain, accountManager, vbRadix, tokenRadix, validatorSetUpdate };
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
}
