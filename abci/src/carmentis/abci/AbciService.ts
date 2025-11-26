import {
    ApplySnapshotChunkRequest,
    ApplySnapshotChunkResponse,
    ApplySnapshotChunkResult,
    CheckTxRequest,
    CheckTxResponse,
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
import { Storage } from './storage/Storage';
import { Performance } from './Performance';

import {
    CHAIN,
    EncoderFactory,
    GenesisSnapshotDTO,
    MessageSerializer,
    MessageUnserializer,
    Microblock,
    MicroblockConsistencyChecker,
    NetworkProvider,
    PrivateSignatureKey,
    SCHEMAS,
    SECTIONS,
    Utils,
} from '@cmts-dev/carmentis-sdk/server';
import { LevelDb } from './database/LevelDb';
import { SnapshotsManager } from './SnapshotsManager';
import { SectionCallback } from './types/SectionCallback';
import { ABCIQueryHandler } from './ABCIQueryHandler';
import { NODE_SCHEMAS } from './constants/constants';
import { CometBFTPublicKeyConverter } from './CometBFTPublicKeyConverter';
import { InitialBlockchainStateBuilder } from './InitialBlockchainStateBuilder';
import { AbciHandlerInterface } from './AbciHandlerInterface';
import { NodeConfigService } from '../config/services/NodeConfigService';
import { Context } from './types/Context';
import { MicroblockCheckResult } from './types/MicroblockCheckResult';
import { GlobalState } from './state/GlobalState';
import { GlobalStateUpdaterFactory } from './state/GlobalStateUpdaterFactory';
import { GenesisRunoff } from './GenesisRunoff';

const APP_VERSION = 1;

const KEY_TYPE_MAPPING = {
    'tendermint/PubKeyEd25519': 'ed25519',
};

@Injectable()
export class AbciService implements OnModuleInit, AbciHandlerInterface {
    private logger = new Logger(AbciService.name);
    private perf: Performance;

    // The ABCI query handler is used to handle queries sent to the application via the abci_query method.
    private abciQueryHandler: ABCIQueryHandler;

    private isCatchingUp: boolean;
    private readonly storage: Storage;
    private readonly db: LevelDb;

    private state: GlobalState;
    private snapshot: SnapshotsManager;
    private importedSnapshot: SnapshotProto;
    private genesisRunoffs: GenesisRunoff;

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
        this.genesisRunoffs = GenesisRunoff.loadFromFilePathOrCreate(
            this.nodeConfig.getGenesisRunoffFilePath(),
        );
        this.logger.log(`ABCI storage at ${abciStoragePath}`);
        this.perf = new Performance(this.logger, true);
        this.db = new LevelDb(dbStoragePath);
        this.storage = new Storage(this.db, microblocksStoragePath);
        this.isCatchingUp = false;

        // creates the snapshot system
        const snapshotPath = snapshotStoragePath;
        this.snapshot = new SnapshotsManager(this.db, snapshotPath, this.logger);
        this.state = new GlobalState(this.db, this.storage);

        this.abciQueryHandler = new ABCIQueryHandler(
            this.state,
            this.db,
            this.genesisSnapshotStorage,
        );
    }

    async onModuleInit() {
        await this.db.initialize();
    }

    /**
     * Handle queries sent to the CometBFT's abci_query method.
     *
     * @param serializedQuery
     */
    async Query(request: QueryRequest): Promise<QueryResponse> {
        const response = await this.forwardAbciQueryToHandler(new Uint8Array(request.data));
        return {
            code: 2,
            log: '',
            info: '',
            index: 0,
            key: new Uint8Array(),
            value: response,
            proof_ops: undefined,
            height: 0,
            codespace: 'Carmentis',
        };
    }

    private async forwardAbciQueryToHandler(serializedQuery: Uint8Array) {
        const messageSerializer = new MessageSerializer(SCHEMAS.NODE_MESSAGES);
        const messageUnserializer = new MessageUnserializer(SCHEMAS.NODE_MESSAGES);
        // We deserialize the query to identity the request type and content.
        const { type, object } = messageUnserializer.unserialize(serializedQuery);
        this.logger.log(`Received query ${SCHEMAS.NODE_MESSAGES[type].label} (${type})`);
        try {
            return await this.abciQueryHandler.handleQuery(type, object);
        } catch (error) {
            this.logger.error(error);
            const errorMsg = error instanceof Error ? error.toString() : 'error';
            return messageSerializer.serialize(SCHEMAS.MSG_ERROR, {
                error: errorMsg,
            });
        }
    }

    async Info(request: InfoRequest) {
        this.logger.log(`info`);
        this.isCatchingUp = false;
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
            const { appHash } = await this.state.getApplicationHash();

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
        const { appHash } = await this.state.getApplicationHash();
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
        // initialize the database
        await this.db.initializeTable();

        await this.storeInitialValidatorSet(request);
        this.logger.log(`Creating initial state for initial height ${request.initial_height}`);
        const appHash = await this.publishInitialBlockchainState(issuerPrivateKey, request);

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
            this.state,
            request,
            issuerPrivateKey,
        );

        await this.state.createGenesisState(issuerPrivateKey.getPublicKey());
        await this.state.commit();

        const {appHash} = await this.state.getApplicationHash();
        return appHash;
    }

    private async publishGenesisTransactions(
        transactions: Uint8Array[],
        publishedBlockHeight: number,
    ) {
        // Since we are publishing transactions at the genesis, publication timestamp is at the lowest possible value.
        // The proposer address is undefined since we do not have published this node.
        const blockTimestamp = Utils.getTimestampInSeconds();
        const proposerAddress = new Uint8Array(32);
        const globalStateUpdater = GlobalStateUpdaterFactory.createGlobalStateUpdater();
        for (const tx of transactions) {
            try {
                const serializedMicroblock = tx;
                const parsedMicroblock = Microblock.loadFromSerializedMicroblock(serializedMicroblock);

                // we create working state to check the transaction
                const workingState = this.state;
                const checkResult = await this.checkMicroblockLocalStateConsistency(
                    workingState,
                    parsedMicroblock,
                );
                if (checkResult.checked) {
                    const vb = checkResult.vb;
                    // we now check the consistency of the working state with the global state
                    const updatedVirtualBlockchain = checkResult.vb;
                    await globalStateUpdater.updateGlobalState(
                        workingState,
                        updatedVirtualBlockchain,
                        parsedMicroblock,
                        { blockHeight: publishedBlockHeight, blockTimestamp, transaction: tx },
                    );
                }

            } catch (e) {

            }
        }

        const {appHash} =  await this.state.getApplicationHash();
        return appHash;
    }
    /**
     Incoming transaction
     */
    async CheckTx(request: CheckTxRequest): Promise<CheckTxResponse> {
        const perfMeasure = this.perf.start('CheckTx');
        this.logger.log(`EVENT: checkTx (${request.tx.length} bytes)`);

        // we first attempt to parse the microblock
        try {
            const serializedMicroblock = request.tx;
            const parsedMicroblock = Microblock.loadFromSerializedMicroblock(serializedMicroblock);

            // we create working state to check the transaction
            const workingState = new GlobalState(this.db, this.storage);
            const checkResult = await this.checkMicroblockLocalStateConsistency(
                workingState,
                parsedMicroblock,
            );
            if (checkResult.checked) {
                const vb = checkResult.vb;
                this.logger.log(`Type: ${CHAIN.VB_NAME[vb.getType()]}`);
                for (const section of parsedMicroblock.getAllSections()) {
                    const sectionLabel = SECTIONS.DEF[vb.getType()][section.type].label;
                    const sectionLengthInBytes = section.data.length;
                    const message = `${(sectionLabel + ' ').padEnd(36, '.')} ${sectionLengthInBytes} byte(s)`;
                    this.logger.log(message);
                }
            }

            // TODO: should we update the global state here to take in account modifications of the block here?

            return Promise.resolve({
                code: 1,
                log: '',
                data: new Uint8Array(request.tx),
                gas_wanted: 0,
                gas_used: 0,
                info: checkResult.checked === true ? '' : checkResult.error,
                events: [],
                codespace: 'app',
            });
        } catch (e) {
            return Promise.resolve({
                code: 0,
                log: '',
                data: new Uint8Array(request.tx),
                gas_wanted: 0,
                gas_used: 0,
                info: e instanceof Error ? e.message : typeof e === 'string' ? e : 'CheckTx error',
                events: [],
                codespace: 'app',
            });
        } finally {
            perfMeasure.end();
        }
    }

    /**
     * Prepares a proposal by validating transactions against specific criteria
     * and returns a prepared proposal response containing only valid transactions.
     *
     * @param {PrepareProposalRequest} request - The proposal request containing
     * transaction data, block height, and timestamp.
     * @param {Array<string>} request.txs - An array of transactions to be validated.
     * @param {number} request.height - The height of the current block.
     * @param {Object} [request.time] - The block timestamp object.
     * @param {number} [request.time.seconds] - The seconds part of the block timestamp.
     *
     * @return {Promise<PrepareProposalResponse>} A promise resolving to the proposal response
     * object containing the filtered list of valid transactions.
     */
    async PrepareProposal(request: PrepareProposalRequest) {
        // TODO check these two variables
        const blockHeight = +request.height;
        const blockTimestamp = +(request.time?.seconds ?? 0); // TODO(explain): why zero, it might break the consensus

        this.logger.log(
            `EVENT: prepareProposal (${request.txs.length} txs, height=${blockHeight}, ts=${blockTimestamp})`,
        );

        const proposedTxs = [];
        const workingState = new GlobalState(this.db, this.storage);
        //const cache = this.getCacheInstance(request.txs);
        const globalStateUpdater = GlobalStateUpdaterFactory.createGlobalStateUpdater();
        for (const tx of request.txs) {
            try {
                // we attempt to parse the received microblock and check its consistency
                // with the local state of the virtual blockchain where it is attached
                const parsedMicroblock = Microblock.loadFromSerializedMicroblock(tx);
                const localStateConsistentWithMicroblock =
                    await this.checkMicroblockLocalStateConsistency(workingState, parsedMicroblock);

                if (localStateConsistentWithMicroblock.checked) {
                    // we now check the consistency of the working state with the global state
                    const updatedVirtualBlockchain = localStateConsistentWithMicroblock.vb;
                    await globalStateUpdater.updateGlobalState(
                        workingState,
                        updatedVirtualBlockchain,
                        parsedMicroblock,
                        { blockHeight, blockTimestamp, transaction: tx },
                    );
                    proposedTxs.push(tx);
                } else {
                    // TODO: reject case
                }
            } catch (e) {
                // TODO: reject case
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
     * Executed by all validators answer:
     *      PROPOSAL_UNKNOWN = 0; // Unknown status. Returning this from the application is always an error.
     *      PROPOSAL_ACCEPT  = 1; // Status that signals that the application finds the proposal valid.
     *      PROPOSAL_REJECT  = 2; // Status that signals that the application finds the proposal invalid.
     *
     * @param request
     * @constructor
     */
    async ProcessProposal(request: ProcessProposalRequest) {
        const perfMeasure = this.perf.start('ProcessProposal');
        const blockHeight = +request.height;
        const blockTimestamp = +(request.time?.seconds ?? 0);
        this.logger.log(
            `EVENT: processProposal (${request.txs.length} txs, height=${blockHeight}, ts=${blockTimestamp})`,
        );

        const workingState = new GlobalState(this.db, this.storage);
        for (const tx of request.txs) {
            try {
                // we attempt to parse the received microblock and check its consistency with
                // with the local state of the virtual blockchain where it is attached
                const parsedMicroblock = Microblock.loadFromSerializedMicroblock(tx);
                const localStateConsistentWithMicroblock =
                    await this.checkMicroblockLocalStateConsistency(workingState, parsedMicroblock);

                // we now check the consistency of the working state with the global state
                if (localStateConsistentWithMicroblock.checked) {
                    const updatedVirtualBlockchain = localStateConsistentWithMicroblock.vb;
                    const globalStateUpdater = GlobalStateUpdaterFactory.createGlobalStateUpdater();
                    await globalStateUpdater.updateGlobalState(
                        workingState,
                        updatedVirtualBlockchain,
                        parsedMicroblock,
                        { blockHeight, blockTimestamp, transaction: tx },
                    );
                } else {
                    // TODO: reject case
                }
            } catch (e) {
                // TODO: reject case
            }
        }

        /*
        this.logger.log(
            `processProposal / total block fees: ${processBlockResult.totalFees / ECO.TOKEN} ${ECO.TOKEN_NAME}`,
        );

         */

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

        const workingState = this.state;
        const txResults = [];
        const globalStateUpdater = GlobalStateUpdaterFactory.createGlobalStateUpdater();
        for (const tx of request.txs) {
            try {
                // we attempt to parse the received microblock and check its consistency with
                // with the local state of the virtual blockchain where it is attached
                const parsedMicroblock = Microblock.loadFromSerializedMicroblock(tx);
                const localStateConsistentWithMicroblock =
                    await this.checkMicroblockLocalStateConsistency(workingState, parsedMicroblock);

                if (localStateConsistentWithMicroblock.checked) {
                    // we now check the consistency of the working state with the global state
                    const updatedVirtualBlockchain = localStateConsistentWithMicroblock.vb;
                    await globalStateUpdater.updateGlobalState(
                        workingState,
                        updatedVirtualBlockchain,
                        parsedMicroblock,
                        { blockHeight, blockTimestamp, transaction: tx },
                    );

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
                } else {
                    // TODO: SHOULD NOT HAPPEN HERE
                }
            } catch (e) {
                // TODO: SHOULD NOT HAPPEN HERE
            }
        }
        await globalStateUpdater.finalizeBlockApproval(workingState, request);
        const { appHash, vbRadixHash, tokenRadixHash, radixHash, storageHash } =
            await workingState.getApplicationHash();

        this.logger.debug(`VB radix hash ...... : ${Utils.binaryToHexa(vbRadixHash)}`);
        this.logger.debug(`Token radix hash ... : ${Utils.binaryToHexa(tokenRadixHash)}`);
        this.logger.debug(`Radix hash ......... : ${Utils.binaryToHexa(radixHash)}`);
        this.logger.debug(`Storage hash ....... : ${Utils.binaryToHexa(storageHash)}`);
        this.logger.debug(`Application hash ... : ${Utils.binaryToHexa(appHash)}`);


        perfMeasure.end();

        return FinalizeBlockResponse.create({
            tx_results: txResults,
            app_hash: appHash,
            events: [],
            validator_updates: globalStateUpdater.getValidatorSetUpdates(),
            consensus_param_updates: undefined,
        });

    }

    async Commit(request: CommitRequest) {
        this.logger.log(`EVENT: commit`);
        if (!this.state.hasSomethingToCommit()) {
            this.logger.warn(`nothing to commit`);
            return;
        }

        await this.state.commit();
        this.logger.log(`Commit done`);

        // Create snapshots under conditions that we are not already importing snapshots and it is
        // the right period to generate snapshots.
        let retainedHeight = 0;
        const isNotImportingSnapshot = !this.isCatchingUp;
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

    /**
     Checks a microblock and invokes the section callbacks of the node.
     */
    private async checkMicroblockLocalStateConsistency(
        workingState: GlobalState,
        checkedMicroblock: Microblock,
        executedDuringGenesis = false,
    ): Promise<MicroblockCheckResult> {
        const microblockCheckTimer = this.perf.start('checking microblock');
        try {
            const checker = new MicroblockConsistencyChecker(workingState, checkedMicroblock);
            checker.checkTimestampOrFail();
            checker.checkGasOrFail();
            await checker.checkVirtualBlockchainConsistencyOrFail();
            const vb = checker.getVirtualBlockchain();
            return { checked: true, vb: vb };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Microblock rejected: ${errorMessage}`);
            this.logger.debug(`Error details:`, error);
            return {
                checked: false,
                error: errorMessage,
            };
        } finally {
            microblockCheckTimer.end();
        }
    }
}
