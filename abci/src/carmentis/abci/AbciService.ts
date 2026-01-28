import {
    RequestApplySnapshotChunk,
    ResponseApplySnapshotChunk,
    RequestCheckTx,
    ResponseCheckTx,
    CheckTxType,
    RequestCommit,
    ResponseCommit,
    RequestEcho,
    ResponseEcho,
    ExecTxResult,
    RequestExtendVote,
    ResponseExtendVote,
    RequestFinalizeBlock,
    ResponseFinalizeBlock,
    RequestFlush,
    ResponseFlush,
    RequestInfo,
    ResponseInfo,
    RequestInitChain,
    ResponseInitChain,
    RequestListSnapshots,
    ResponseListSnapshots,
    RequestLoadSnapshotChunk,
    ResponseLoadSnapshotChunk,
    Misbehavior,
    RequestOfferSnapshot,
    ResponseOfferSnapshot,
    RequestPrepareProposal,
    ResponsePrepareProposal,
    RequestProcessProposal,
    ResponseProcessProposal,
    RequestQuery,
    ResponseQuery,
    Snapshot,
    RequestVerifyVoteExtension,
    ResponseVerifyVoteExtension,
    ResponseProcessProposal_ProposalStatus,
    ResponseApplySnapshotChunk_Result,
    ResponseOfferSnapshot_Result,
    ValidatorUpdate,
} from '../../proto/tendermint/abci/types';

import { Injectable, OnModuleInit } from '@nestjs/common';
import { KeyManagementService } from './services/KeyManagementService';
import { CometBFTNodeConfigService } from './CometBFTNodeConfigService';
import { GenesisSnapshotStorageService } from './GenesisSnapshotStorageService';
import { GenesisInitialTransactionsBuilder } from './GenesisInitialTransactionsBuilder';
import { Storage } from './storage/Storage';
import { Performance } from './Performance';

import {
    AbciQueryEncoder,
    AbciResponse,
    AbciResponseType,
    BlockchainUtils,
    CHAIN,
    ECO,
    EncoderFactory,
    GenesisSnapshotAbciResponse,
    Microblock,
    MicroblockConsistencyChecker,
    NetworkProvider,
    PrivateSignatureKey,
    SectionLabel,
    SectionType,
    Utils
} from '@cmts-dev/carmentis-sdk/server';
import { LevelDb } from './database/LevelDb';
import { SnapshotsManager } from './SnapshotsManager';
import { ABCIQueryHandler } from './ABCIQueryHandler';
import { CometBFTPublicKeyConverter } from './CometBFTPublicKeyConverter';
import { AbciHandlerInterface } from './AbciHandlerInterface';
import { NodeConfigService } from '../config/services/NodeConfigService';
import { MicroblockCheckResult } from './types/MicroblockCheckResult';
import { GlobalState } from './state/GlobalState';
import { GlobalStateUpdaterFactory } from './state/GlobalStateUpdaterFactory';
import { GenesisRunoff } from './GenesisRunoff';
import { getLogger } from '@logtape/logtape';
import { GlobalStateUpdateCometParameters } from './types/GlobalStateUpdateCometParameters';
import { CheckTxResponseCode } from './CheckTxResponseCode';
import { ConsensusParams } from '../../proto/tendermint/types/params';
import { CometBFTUtils } from './CometBFTUtils';
import { EarlyMicroblockRejectionService } from './services/EarlyMicroblockRejectionService';

const APP_VERSION = 1;

const KEY_TYPE_MAPPING = {
    'tendermint/PubKeyEd25519': 'ed25519',
};

@Injectable()
export class AbciService implements OnModuleInit, AbciHandlerInterface {
    private initialized: boolean;
    private logger = getLogger(['node', AbciService.name]);
    private perf: Performance;

    // The ABCI query handler is used to handle queries sent to the application via the abci_query method.
    private abciQueryHandler?: ABCIQueryHandler;

    private isCatchingUp: boolean;
    private storage?: Storage;
    private db?: LevelDb;

    private state?: GlobalState;
    private snapshot?: SnapshotsManager;
    private importedSnapshot?: Snapshot;
    private genesisRunoffs: GenesisRunoff;

    constructor(
        private readonly nodeConfig: NodeConfigService,
        private readonly cometConfig: CometBFTNodeConfigService,
        private readonly kms: KeyManagementService,
        private genesisSnapshotStorage: GenesisSnapshotStorageService,
        private earlyMicroblockRejectionService: EarlyMicroblockRejectionService,
    ) {
        this.initialized = false;
        this.isCatchingUp = false;
        this.perf = new Performance(this.logger, true);
        this.genesisRunoffs = GenesisRunoff.noRunoff();
    }

    private getStorage(): Storage {
        if (!this.storage) {
            throw new Error('Storage is not initialized');
        }
        return this.storage;
    }

    private getLevelDb(): LevelDb {
        if (!this.db) {
            throw new Error('LevelDb is not initialized');
        }
        return this.db;
    }

    private getSnapshot(): SnapshotsManager {
        if (!this.snapshot) {
            throw new Error('SnapshotsManager is not initialized');
        }
        return this.snapshot;
    }

    private getGlobalState(): GlobalState {
        if (!this.state) {
            throw new Error('GlobalState is not initialized');
        }
        return this.state;
    }

    async onModuleInit() {
        // this may be called twice by Nest, so we use this safeguard to prevent a double initialization
        if (this.initialized) {
            return;
        }
        this.initialized = true;

        // define the paths where are stored the database, the storage and the snapshots.
        const {
            rootStoragePath: abciStoragePath,
            dbStoragePath,
            microblocksStoragePath,
            snapshotStoragePath,
        } = this.nodeConfig.getStoragePaths();

        // instantiate the genesis runoff path if specified
        if (this.nodeConfig.isGenesisRunoffFilePathSpecified()) {
            const runoffPath = this.nodeConfig.getGenesisRunoffFilePath();
            this.logger.info(`Loading genesis runoff from file ${runoffPath}`);
            this.genesisRunoffs = GenesisRunoff.loadFromFilePathOrCreateNoRunoff(runoffPath);
        } else {
            this.logger.info('No genesis runoff file specified, using no runoff');
        }

        this.logger.info(`ABCI storage at ${abciStoragePath}`);

        this.db = new LevelDb(dbStoragePath);
        this.db.initialize();
        this.storage = new Storage(this.db, microblocksStoragePath);

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

    /**
     * Handle queries sent to the CometBFT's abci_query method.
     *
     * @param serializedQuery
     */
    async Query(request: RequestQuery): Promise<ResponseQuery> {
        const response = await this.forwardAbciQueryToHandler(new Uint8Array(request.data));
        return ResponseQuery.fromPartial({
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
        // we reject the query if the handler is not initialized yet.
        if (this.abciQueryHandler === undefined) {
            this.logger.error(`ABCI query handler is not initialized yet.`);
            return AbciQueryEncoder.encodeAbciResponse({
                responseType: AbciResponseType.ERROR,
                error: 'ABCI query handler is not initialized yet.',
            });
        }

        try {
            // decoding the request
            const abciRequest = AbciQueryEncoder.decodeAbciRequest(serializedQuery);
            this.logger.info(`Receiving request of type ${abciRequest.requestType}`);

            // handle the request, encode and sends back the response
            const response = await this.abciQueryHandler.handleAbciRequest(abciRequest);
            return AbciQueryEncoder.encodeAbciResponse(response);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(
                `ABCI query execution failed due to the following error: ${errorMsg}`,
            );
            if (error instanceof Error) {
                this.logger.debug(error.stack ?? 'No stack provided');
            }
            const errorResponse: AbciResponse = {
                responseType: AbciResponseType.ERROR,
                error: errorMsg,
            };
            return AbciQueryEncoder.encodeAbciResponse(errorResponse);
        }
    }

    async Info(request: RequestInfo) {
        this.logger.info(`info`);
        this.isCatchingUp = false;
        const chainInformation = await this.getLevelDb().getChainInformation();
        const last_block_height = chainInformation?.height || 0;
        if (last_block_height === 0) {
            this.logger.info(`(Info) Aborting info request because the chain is empty.`);
            return ResponseInfo.create({
                version: '1',
                data: 'Carmentis ABCI application',
                //app_version: APP_VERSION,
                //last_block_height,
                last_block_height: last_block_height,
            });
        } else {
            const { appHash } = await this.getGlobalState().getApplicationHash();

            const hex = EncoderFactory.bytesToHexEncoder();
            this.logger.info(`(Info) last_block_height: ${last_block_height}`);
            this.logger.info(`(Info) last_block_app_hash: ${hex.encode(appHash)}`);

            return ResponseInfo.create({
                version: '1',
                data: 'Carmentis ABCI application',
                //app_version: APP_VERSION,
                last_block_height: last_block_height,
                last_block_app_hash: appHash,
            });
        }
    }

    async InitChain(request: RequestInitChain) {
        this.logger.info(`[ InitChain ] --------------------------------------------------------`);

        // we start by cleaning database, snapshots and storage
        await this.clearDatabase();
        await this.clearStorage();
        await this.clearSnapshots();

        // depending on if the current node is a genesis node or not
        const isGenesisNode = this.isGenesisNode(request);
        if (isGenesisNode) {
            this.logger.info(`This node is the genesis node.`);
            const issuerPrivateKey = this.kms.getIssuerPrivateKey();
            const appHash = await this.initChainAsGenesis(request, issuerPrivateKey);
            return this.createInitChainResponse(appHash);
        } else {
            this.logger.info(`This node is not the genesis node.`);
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
    private isGenesisNode(request: RequestInitChain) {
        // NOTE: I have identified a difference between the public key type provided by the InitChainRequest and the one
        // inside the cometbft config. For this reason, I ignore the public key type for the moment.
        // Hence, I assume that the types of both keys are identical.
        const currentNodePublicKey = this.cometConfig.getPublicKey();
        const initialValidatorSet = request.validators;
        this.logger.debug(`Current node public key: ${currentNodePublicKey.value}`);
        for (const validator of initialValidatorSet) {
            const base64 = EncoderFactory.bytesToBase64Encoder();
            const { pub_keyType: validatorPublicKeyType, pub_key: validatorPublicKeyValue } =
                CometBFTUtils.extractNodePublicKeyKeyFromValidatorUpdate(validator);
            const b64EncodedNodePublicKey = base64.encode(validatorPublicKeyValue);
            this.logger.debug(`Validator node public key: ${b64EncodedNodePublicKey}`);
            const isPublicKeyValueMatching = b64EncodedNodePublicKey === currentNodePublicKey.value;
            const isPublicKeyTypeMatching = validatorPublicKeyType === currentNodePublicKey.type;

            const isGenesisNode = isPublicKeyValueMatching;
            if (isGenesisNode) {
                return true;
            }
        }
        return false;
    }

    private async initChainAsNode(request: RequestInitChain) {
        const genesisSnapshot = await this.searchGenesisSnapshotChunksFromGenesisNode();
        await this.loadReceivedGenesisSnapshotChunks(genesisSnapshot);
        await this.genesisSnapshotStorage.writeGenesisSnapshotChunksToDiskFromEncodedChunks(
            genesisSnapshot,
        );
        const { appHash } = await this.getGlobalState().getApplicationHash();
        return appHash;
    }

    private async loadReceivedGenesisSnapshotChunks(genesisSnapshotChunks: Uint8Array[]) {
        // we load the chunks using the SnapshotManager
        for (let chunkIndex = 0; chunkIndex < genesisSnapshotChunks.length; chunkIndex++) {
            const chunk = genesisSnapshotChunks[chunkIndex];
            const isLastChunk = chunkIndex === genesisSnapshotChunks.length - 1;
            this.logger.info(
                `processing genesis snapshot chunk ${chunkIndex + 1} of ${genesisSnapshotChunks.length} (last: ${isLastChunk ? 'yes' : 'no'})`,
            );
            await this.getSnapshot().loadReceivedChunk(
                this.getStorage(),
                chunkIndex,
                chunk,
                isLastChunk,
            );
        }
    }

    private async initChainAsGenesis(
        request: RequestInitChain,
        issuerPrivateKey: PrivateSignatureKey,
    ) {
        // initialize the database
        await this.getLevelDb().initializeTable();

        await this.storeInitialValidatorSet(request);
        this.logger.info(`Creating initial state`);

        const builder = new GenesisInitialTransactionsBuilder(
            this.nodeConfig,
            this.getGlobalState(),
            this.genesisRunoffs,
        );
        const appHash = await builder.publishInitialBlockchainState(issuerPrivateKey, request);

        // we create the genesis state snapshot and export it.
        await this.storeGenesisStateSnapshotInSnapshotsFolder();
        await this.saveGenesisSnapshotToDisk();

        return appHash;
    }

    private async storeGenesisStateSnapshotInSnapshotsFolder() {
        this.logger.info(`Creating genesis snapshot`);
        await this.getSnapshot().create();
    }

    private async searchGenesisSnapshotChunksFromGenesisNode() {
        // we raise an exception if the url is not provided
        const genesisNodeUrl = this.nodeConfig.getGenesisSnapshotRpcEndpoint();
        if (genesisNodeUrl === undefined) {
            throw new Error(
                `The genesis snapshot RPC endpoint is not defined. Please provide it in the configuration file.`,
            );
        }
        this.logger.debug(`Looking for genesis snapshot on the genesis node: ${genesisNodeUrl}`);
        const provider = new NetworkProvider(genesisNodeUrl);
        const snapshot = await provider.getGenesisSnapshot();
        const encoder = EncoderFactory.bytesToBase64Encoder();
        const genesisSnapshotChunks = snapshot.base64EncodedChunks.map((chunk) =>
            encoder.decode(chunk),
        );
        return genesisSnapshotChunks;
    }

    private async saveGenesisSnapshotToDisk() {
        // we assume that after the genesis state, the chain contains one block (starting at one)
        const chainHeightAfterGenesis = 1;

        // the genesis state's chunks are encoded in base64
        const base64Encoder = EncoderFactory.bytesToBase64Encoder();

        // we generate and export the genesis state as a snapshot
        const snapshotList = await this.getSnapshot().getList();
        const snapshotDescription = snapshotList.find(
            (desc) => desc.height == chainHeightAfterGenesis,
        );

        if (snapshotDescription == undefined) {
            throw new Error(
                `Unable to find the genesis snapshot (height = ${chainHeightAfterGenesis})`,
            );
        }

        const numberOfChunksToExport = snapshotDescription.chunks;
        const genesisChunks: Uint8Array[] = [];
        this.logger.info(`exporting ${numberOfChunksToExport} chunks from the genesis snapshot`);
        for (
            let chunkIndexToExport = 0;
            chunkIndexToExport < numberOfChunksToExport;
            chunkIndexToExport++
        ) {
            const chunk = await this.getSnapshot().getChunk(
                this.getStorage(),
                chainHeightAfterGenesis,
                chunkIndexToExport,
            );
            genesisChunks.push(chunk);
        }

        const genesisState: GenesisSnapshotAbciResponse = {
            responseType: AbciResponseType.GENESIS_SNAPSHOT,
            base64EncodedChunks: genesisChunks.map((chunk) => base64Encoder.encode(chunk)),
        };

        await this.genesisSnapshotStorage.writeGenesisSnapshotToDisk(genesisState);
    }

    private createInitChainResponse(appHash: Uint8Array) {
        const consensusParams: ConsensusParams = ConsensusParams.fromPartial({
            validator: {
                pub_key_types: ['ed25519'], // ['tendermint/PubKeyEd25519']
            },
        });
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
        return ResponseInitChain.create({
            consensus_params: consensusParams,
            validators: [],
            app_hash: appHash,
        });
    }

    private async storeInitialValidatorSet(request: RequestInitChain) {
        const db = this.getLevelDb();
        for (const validator of request.validators) {
            const address = CometBFTUtils.extractNodeAddressFromValidatorUpdate(validator);
            /*
            const address = CometBFTPublicKeyConverter.convertRawPublicKeyIntoAddress(
                Utils.bufferToUint8Array(validator.pub_key_bytes),
            );

             */
            const record = await db.getValidatorNodeByAddress(address);

            if (!record) {
                this.logger.info(
                    `Adding unknown validator address: ${Utils.binaryToHexa(address)}`,
                );
                await db.putValidatorNodeByAddress(address, Utils.getNullHash(), 0);
            }
        }
    }

    /**
     * Incoming transaction
     */
    async CheckTx(
        request: RequestCheckTx,
        referenceTimestamp = Utils.getTimestampInSeconds(),
    ): Promise<ResponseCheckTx> {
        const perfMeasure = this.perf.start('CheckTx');
        this.logger.info(`[ CheckTx ]  --------------------------------------------------------`);
        this.logger.info(
            `Size of transaction: ${request.tx.length} bytes / request type: ${request.type} (${typeof request.type})`,
        );

        // we first attempt to parse the microblock
        try {
            const serializedMicroblock = request.tx;
            const parsedMicroblock = Microblock.loadFromSerializedMicroblock(serializedMicroblock);

            // perform early rejection of the microblock
            const shouldBeEarlyRejected = this.earlyMicroblockRejectionService.shouldBeRejected(parsedMicroblock);
            if (shouldBeEarlyRejected) {
                this.logger.info(`Microblock ${parsedMicroblock.getHash().encode()} rejected early`);
                return {
                    code: CheckTxResponseCode.KO,
                    log: '',
                    data: new Uint8Array(),
                    gas_wanted: 0,
                    gas_used: 0,
                    info: 'Microblock rejected early',
                    events: [],
                    codespace: 'app',
                }
            }

            // We reject the microblock if it declares a gas below the minimum gas accepted by the node.
            // The minimum accepted gas can be different for every node.
            const declaredGas = parsedMicroblock.getGas().getAmountAsAtomic();
            const minAcceptedGas = this.nodeConfig.getMinMicroblockGasInAtomicAccepted();
            if (declaredGas < minAcceptedGas) {
                this.logger.info(`Microblock ${parsedMicroblock.getHash().encode()} rejected due to insufficient gas`);
                return {
                    code: CheckTxResponseCode.KO,
                    log: '',
                    data: new Uint8Array(),
                    gas_wanted: 0,
                    gas_used: 0,
                    info: `Microblock rejected due to insufficient gas. Minimum accepted gas: ${minAcceptedGas}`,
                    events: [],
                    codespace: 'app',
                }
            }



            this.logger.info(`Checking microblock ${parsedMicroblock.getHash().encode()}`);

            // we create working state to check the transaction
            const workingState = new GlobalState(this.getLevelDb(), this.getStorage());
            const checkResult = await this.checkMicroblockLocalStateConsistency(
                workingState,
                parsedMicroblock,
                referenceTimestamp,
            );
            if (checkResult.checked) {
                const vb = checkResult.vb;
                this.logger.info(`Type: ${CHAIN.VB_NAME[vb.getType()]}`);
                for (const section of parsedMicroblock.getAllSections()) {
                    const serializedSection = BlockchainUtils.encodeSection(section);
                    const sectionLabel = SectionLabel.getSectionLabelFromSection(section);
                    //const sectionLabel = SECTIONS.DEF[vb.getType()][section.type].label;
                    const sectionLengthInBytes = serializedSection.length;
                    const message = `${(sectionLabel + ' ').padEnd(36, '.')} ${sectionLengthInBytes} byte(s)`;
                    this.logger.info(message);
                }

                this.logger.info(`Microblock ${parsedMicroblock.getHash().encode()} accepted`);
                return {
                    code: CheckTxResponseCode.OK,
                    log: '',
                    data: new Uint8Array(),
                    gas_wanted: 0,
                    gas_used: 0,
                    info: '',
                    events: [],
                    codespace: 'app',
                };
            } else {
                this.logger.info(
                    `Microblock ${parsedMicroblock.getHash().encode()} rejected: not checked: ${checkResult.error}`,
                );
                return {
                    code: CheckTxResponseCode.KO,
                    log: '',
                    data: new Uint8Array(),
                    gas_wanted: 0,
                    gas_used: 0,
                    info: checkResult.error,
                    events: [],
                    codespace: 'app',
                };
            }
        } catch (e) {
            if (e instanceof Error) {
                this.logger.info(
                    `Microblock rejected due to an unexpected error: ${e.message} at ${e.stack}`,
                );
            } else {
                this.logger.warn('Microblock rejected due to an error');
            }

            return {
                code: CheckTxResponseCode.KO,
                log: '',
                data: new Uint8Array(),
                gas_wanted: 0,
                gas_used: 0,
                info: e instanceof Error ? e.message : typeof e === 'string' ? e : 'CheckTx error',
                events: [],
                codespace: 'app',
            };
        } finally {
            perfMeasure.end();
        }
    }

    /**
     * Extract the relevant Comet parameters from a Comet request: block height, block timestamp and misbehaviors
     * This supports PrepareProposalRequest, ProcessProposalRequest and FinalizeBlockRequest
     */
    extractCometParameters(
        request: RequestPrepareProposal | RequestProcessProposal | RequestFinalizeBlock,
    ): GlobalStateUpdateCometParameters {
        const defaultTimestamp = 0;
        const timeInRequest = CometBFTUtils.convertDateInTimestamp(request.time); //request.time?.seconds;
        if (timeInRequest === undefined) {
            this.logger.warn(
                `No block timestamp provided in request: using timestamp ${defaultTimestamp}`,
            );
        }
        const blockHeight = Number(request.height);
        const blockTimestamp = CometBFTUtils.convertDateInTimestamp(request.time); //Number(request.time?.seconds ?? defaultTimestamp);
        const blockMisbehaviors: Misbehavior[] = request.misbehavior;

        return { blockHeight, blockTimestamp, blockMisbehaviors };
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
    async PrepareProposal(request: RequestPrepareProposal) {
        const cometParameters = this.extractCometParameters(request);

        this.logger.info(
            `[ PrepareProposal - Height: ${cometParameters.blockHeight} ]  --------------------------------------------------------`,
        );
        this.logger.info(
            `Handling ${request.txs.length} transactions at ts ${cometParameters.blockTimestamp}`,
        );

        // Step 1: transaction decoding (and early rejection)
        const txs = request.txs;
        const microblocks: { mb: Microblock, tx: Uint8Array, gasInAtomics: number }[] = [];
        for (const tx of txs) {
            try {
                // decoding
                const parsedMicroblock = Microblock.loadFromSerializedMicroblock(tx);

                // early rejection
                const shouldBeEarlyRejected = this.earlyMicroblockRejectionService.shouldBeRejected(parsedMicroblock);
                if (shouldBeEarlyRejected) {
                    this.logger.info(`Microblock ${parsedMicroblock.getHash().encode()} rejected early`);
                    continue;
                }

                // this microblock can proceed to the next steps
                microblocks.push({ mb: parsedMicroblock, tx, gasInAtomics: parsedMicroblock.getGas().getAmountAsAtomic() });
            } catch (e) {
                if (e instanceof Error) {
                    this.logger.error(
                        `Microblock rejected due to the following error: ${e.message}`,
                    );
                } else {
                    this.logger.error(
                        `Microblock rejected due to the following error: ${e}`,
                    );
                }
            }
        }

        // Step 2: microblock ordering based on gas
        const sortedMicroblocks = microblocks.sort((a, b) => {
            return b.gasInAtomics - a.gasInAtomics
        });


        // Step 3: check and verify microblocks until max size is reached
        const proposedTxs: Uint8Array[] = [];
        const workingState = new GlobalState(this.getLevelDb(), this.getStorage());
        const protocolVariables = await workingState.getProtocolState();
        const maxBlockSize = protocolVariables.getMaximumBlockSizeInBytes();
        const globalStateUpdater = GlobalStateUpdaterFactory.createGlobalStateUpdater();
        let currentBlockSize = 0;

        await globalStateUpdater.updateGlobalStateOnBlock(workingState, cometParameters);
        for (const entry of sortedMicroblocks) {
            // recover the parsed microblock
            const parsedMicroblock = entry.mb;
            const tx = entry.tx;

            // we break the proposal creation early if this transaction would make the block exceeding
            // the max block size.
            if ( currentBlockSize + tx.length > maxBlockSize ) {
                this.logger.info(`Block size limit reached. Stopping proposal creation with ${proposedTxs.length} transactions.`);
                break;
            }

            try {
                // check its consistency
                // with the local state of the virtual blockchain where it is attached
                const localStateConsistentWithMicroblock =
                    await this.checkMicroblockLocalStateConsistency(
                        workingState,
                        parsedMicroblock,
                        cometParameters.blockTimestamp,
                    );

                if (localStateConsistentWithMicroblock.checked) {
                    // we now check the consistency of the working state with the global state
                    const updatedVirtualBlockchain = localStateConsistentWithMicroblock.vb;
                    await globalStateUpdater.updateGlobalStateOnMicroblock(
                        workingState,
                        updatedVirtualBlockchain,
                        parsedMicroblock,
                        cometParameters,
                        tx,
                    );

                    // the transaction is valid and respects the block, accept it in the block
                    proposedTxs.push(tx);
                    currentBlockSize += tx.length;
                } else {
                    // we rejected, the microblock goes back to the mempool
                    this.logger.info(
                        `Microblock ${parsedMicroblock.getHash().encode()} rejected: ${localStateConsistentWithMicroblock.error}`,
                    );
                    this.earlyMicroblockRejectionService.markMicroblockAsRejected(parsedMicroblock);
                }
            } catch (e) {
                // TODO: reject case
                if (e instanceof Error) {
                    this.logger.error(
                        `Microblock rejected due to the following error: ${e.message}`,
                    );
                    this.logger.debug(`Details of the error: ${e.stack}`);
                }
                this.earlyMicroblockRejectionService.markMicroblockAsRejected(parsedMicroblock);
            }
        }

        this.logger.info(
            `Included ${proposedTxs.length} transaction(s) out of ${txs.length}`,
        );

        return ResponsePrepareProposal.create({
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
    async ProcessProposal(request: RequestProcessProposal) {
        const perfMeasure = this.perf.start('ProcessProposal');
        const cometParameters = this.extractCometParameters(request);

        this.logger.info(
            `[ ProcessProposal - Height: ${cometParameters.blockHeight} ]  --------------------------------------------------------`,
        );
        this.logger.info(
            `Handling ${request.txs.length} transactions at ts ${cometParameters.blockTimestamp}`,
        );

        const workingState = new GlobalState(this.getLevelDb(), this.getStorage());
        const globalStateUpdater = GlobalStateUpdaterFactory.createGlobalStateUpdater();

        await globalStateUpdater.updateGlobalStateOnBlock(workingState, cometParameters);

        for (const tx of request.txs) {
            try {
                // we attempt to parse the received microblock and check its consistency with
                // with the local state of the virtual blockchain where it is attached
                const parsedMicroblock = Microblock.loadFromSerializedMicroblock(tx);
                const localStateConsistentWithMicroblock =
                    await this.checkMicroblockLocalStateConsistency(
                        workingState,
                        parsedMicroblock,
                        cometParameters.blockTimestamp,
                    );

                // we now check the consistency of the working state with the global state
                if (localStateConsistentWithMicroblock.checked) {
                    const updatedVirtualBlockchain = localStateConsistentWithMicroblock.vb;
                    await globalStateUpdater.updateGlobalStateOnMicroblock(
                        workingState,
                        updatedVirtualBlockchain,
                        parsedMicroblock,
                        cometParameters,
                        tx,
                    );
                } else {
                    // TODO: reject case
                    this.logger.error(
                        `Microblock  ${parsedMicroblock.getHash().encode()} rejected: ${localStateConsistentWithMicroblock.error}`,
                    );
                }
            } catch (e) {
                // TODO: reject case
                this.logger.error(`Microblock rejected due to the following raised error: ${e}`);
            }
        }

        perfMeasure.end();

        return ResponseProcessProposal.create({
            status: ResponseProcessProposal_ProposalStatus.ACCEPT,
        });
    }

    ExtendVote(request: RequestExtendVote) {
        return ResponseExtendVote.create({});
    }

    VerifyVoteExtension(request: RequestVerifyVoteExtension) {
        return Promise.resolve(ResponseVerifyVoteExtension.create({}));
    }

    async FinalizeBlock(request: RequestFinalizeBlock) {
        const perfMeasure = this.perf.start('FinalizeBlock');
        const cometParameters = this.extractCometParameters(request);

        this.logger.info(
            `[ FinalizeBlock - Height: ${cometParameters.blockHeight} ]  --------------------------------------------------------`,
        );
        this.logger.info(
            `Handling ${request.txs.length} transactions at ts ${cometParameters.blockTimestamp}`,
        );

        const workingState = this.getGlobalState();
        const txResults: ExecTxResult[] = [];
        const globalStateUpdater = GlobalStateUpdaterFactory.createGlobalStateUpdater();

        await globalStateUpdater.updateGlobalStateOnBlock(workingState, cometParameters);

        for (const tx of request.txs) {
            try {
                // we attempt to parse the received microblock and check its consistency with
                // with the local state of the virtual blockchain where it is attached
                const parsedMicroblock = Microblock.loadFromSerializedMicroblock(tx);
                const localStateConsistentWithMicroblock =
                    await this.checkMicroblockLocalStateConsistency(
                        workingState,
                        parsedMicroblock,
                        cometParameters.blockTimestamp,
                    );

                if (localStateConsistentWithMicroblock.checked) {
                    // we now check the consistency of the working state with the global state
                    const updatedVirtualBlockchain = localStateConsistentWithMicroblock.vb;
                    await globalStateUpdater.updateGlobalStateOnMicroblock(
                        workingState,
                        updatedVirtualBlockchain,
                        parsedMicroblock,
                        cometParameters,
                        tx,
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
                    this.logger.fatal(
                        `Microblock ${parsedMicroblock.getHash().encode()} has been rejected during FinalizeBlock`,
                    );
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.fatal(
                    `A transaction has been rejected during FinalizeBlock: ${errorMessage}`,
                );
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

        // obtain the validator set update and map it to the CometBFT' internal type
        const validatorSetUpdates = globalStateUpdater.getCometValidatorSetUpdates();
        const validatorUpdate: ValidatorUpdate[] = validatorSetUpdates.map((update) => ({
            power: update.power,
            pub_key: {
                ed25519: update.pub_key_bytes,
            },
        }));

        return ResponseFinalizeBlock.create({
            tx_results: txResults,
            app_hash: appHash,
            events: [],
            validator_updates: validatorUpdate,
            consensus_param_updates: undefined,
        });
    }

    async Commit(request: RequestCommit) {
        this.logger.info(`[ Commit ] --------------------------------------------------------`);
        const state = this.getGlobalState();
        const db = this.getLevelDb();
        const snapshot = this.getSnapshot();
        if (!state.hasSomethingToCommit()) {
            this.logger.warn(`nothing to commit`);
            return ResponseCommit.create({});
        }

        await state.commit();
        this.logger.info(`Commit done`);

        // Create snapshots under conditions that we are not already importing snapshots and it is
        // the right period to generate snapshots.
        let retainedHeight = 0;
        const isNotImportingSnapshot = !this.isCatchingUp;
        const snapshotBlockPeriod = this.nodeConfig.getSnapshotBlockPeriod();
        const chainInfoObject = await db.getChainInformation();
        const isTimeToGenerateSnapshot = chainInfoObject.height % snapshotBlockPeriod == 0;
        if (isNotImportingSnapshot && isTimeToGenerateSnapshot) {
            this.logger.info(`Creating snapshot at height ${chainInfoObject.height}`);
            const maxSnapshots = this.nodeConfig.getMaxSnapshots();
            await snapshot.clear(maxSnapshots - 1);
            await snapshot.create();
            this.logger.info(`Done creating snapshot`);

            // We preserve a certain amount of blocks that are not put in a snapshot.
            const blockHistoryBeforeSnapshot = this.nodeConfig.getBlockHistoryBeforeSnapshot();
            if (blockHistoryBeforeSnapshot) {
                retainedHeight = Math.max(0, chainInfoObject.height - blockHistoryBeforeSnapshot);
            }
        }

        return ResponseCommit.create({
            retain_height: retainedHeight,
        });
    }

    async ListSnapshots(request: RequestListSnapshots) {
        this.logger.info(`EVENT: listSnapshots`);

        const list = await this.getSnapshot().getList();

        this.logger.info(`snapshot.getList(): ${list.length}`);
        list.forEach((object) =>
            console.log({
                height: object.height,
                format: object.format,
                chunks: object.chunks,
                hash: Utils.binaryFromHexa(object.hash),
            }),
        );

        const snapshots: Snapshot[] = list.map((object) => {
            // FIXME: use serialized version of object.metadata?
            const metadata = new Uint8Array();

            return {
                height: object.height,
                format: object.format,
                chunks: object.chunks,
                hash: Utils.binaryFromHexa(object.hash),
                metadata,
            };
        });

        return ResponseListSnapshots.create({
            snapshots,
        });
    }

    async LoadSnapshotChunk(request: RequestLoadSnapshotChunk) {
        this.logger.info(
            `EVENT: loadSnapshotChunk height=${request.height} (typeof height: ${typeof request.height})`,
        );

        const height: number = Number(request.height); // TODO: ensure conversion
        const chunk = await this.getSnapshot().getChunk(this.getStorage(), height, request.chunk);

        return ResponseLoadSnapshotChunk.create({
            chunk,
        });
    }

    async OfferSnapshot(request: RequestOfferSnapshot) {
        this.logger.info(`EVENT: offerSnapshot`);

        this.importedSnapshot = request.snapshot;

        return ResponseOfferSnapshot.create({
            result: ResponseOfferSnapshot_Result.ACCEPT,
            //result: ResponseOfferSnapshotResult.OFFER_SNAPSHOT_RESULT_ACCEPT,
        });
    }

    async ApplySnapshotChunk(request: RequestApplySnapshotChunk) {
        this.logger.info(`EVENT: applySnapshotChunk index=${request.index}`);

        // reject if the provided snapshot is not defined
        if (this.importedSnapshot === undefined) {
            this.logger.error(`Cannot apply snapshot chunk: imported snapshot undefined`);
            return ResponseApplySnapshotChunk.create({
                result: ResponseApplySnapshotChunk_Result.ABORT,
                //result: ResponseApplySnapshotChunkResult.APPLY_SNAPSHOT_CHUNK_RESULT_ABORT,
            });
        }

        const isLast = request.index == this.importedSnapshot.chunks - 1;
        await this.getSnapshot().loadReceivedChunk(
            this.getStorage(),
            request.index,
            request.chunk,
            isLast,
        );
        const result = ResponseApplySnapshotChunk_Result.ACCEPT;
        //const result = ResponseApplySnapshotChunkResult.APPLY_SNAPSHOT_CHUNK_RESULT_ACCEPT;

        return ResponseApplySnapshotChunk.create({
            result,
            refetch_chunks: [],
            reject_senders: [],
        });
    }

    private async clearDatabase() {
        this.logger.info(`Clearing database`);
        await this.getLevelDb().clear();
    }

    private async clearStorage() {
        this.logger.info(`Clearing storage`);
        await this.getStorage().clear();
    }

    private async clearSnapshots() {
        this.logger.info(`Clearing snapshots`);
        await this.getSnapshot().clear(0);
    }

    Echo(request: RequestEcho): Promise<ResponseEcho> {
        return Promise.resolve({
            message: `Echo: ${request.message}`,
        });
    }

    Flush(request: RequestFlush): Promise<ResponseFlush> {
        return Promise.resolve({});
    }

    /**
     * Checks a microblock and invokes the section callbacks of the node.
     */
    private async checkMicroblockLocalStateConsistency(
        workingState: GlobalState,
        checkedMicroblock: Microblock,
        referenceTimestamp = Utils.getTimestampInSeconds(),
    ): Promise<MicroblockCheckResult> {
        this.logger.debug(`Checking microblock local state consistency`);
        const microblockCheckTimer = this.perf.start('checking microblock');
        try {
            const checker = new MicroblockConsistencyChecker(workingState, checkedMicroblock);

            // loading and checking virtual blockchain consistency when adding the microblock
            this.logger.debug(`Checking virtual blockchain consistency...`);
            await checker.checkVirtualBlockchainConsistencyOrFail();

            // check the consistency of the timestamp defined in the microblock
            this.logger.debug('Checking timestamp consistency...');
            checker.checkTimestampOrFail(referenceTimestamp);

            // checking gas consistency
            this.logger.debug('Checking gas consistency...');
            await checker.checkGasOrFail();

            this.logger.debug('Checks are done');
            const vb = checker.getVirtualBlockchain();
            return { checked: true, vb: vb };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Microblock rejected: ${errorMessage}`);
            if (error instanceof Error) {
                this.logger.debug(`Error details: ${error}`);
                this.logger.debug(error.stack || 'No stack trace available');
            }
            return {
                checked: false,
                error: errorMessage,
            };
        } finally {
            microblockCheckTimer.end();
        }
    }
}