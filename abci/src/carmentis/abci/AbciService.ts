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
    Misbehavior,
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

import { Injectable, OnModuleInit } from '@nestjs/common';
import { KeyManagementService } from './services/KeyManagementService';
import { CometBFTNodeConfigService } from './CometBFTNodeConfigService';
import { GenesisSnapshotStorageService } from './GenesisSnapshotStorageService';
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
    Utils,
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
import { GenesisRunoffTransactionsBuilder } from './GenesisRunoffTransactionsBuilder';

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
    private importedSnapshot?: SnapshotProto;
    private genesisRunoffs: GenesisRunoff;

    constructor(
        private readonly nodeConfig: NodeConfigService,
        private readonly cometConfig: CometBFTNodeConfigService,
        private readonly kms: KeyManagementService,
        private genesisSnapshotStorage: GenesisSnapshotStorageService,
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
        if(this.initialized) {
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
        this.genesisRunoffs = GenesisRunoff.loadFromFilePathOrCreateNoRunoff(
            this.nodeConfig.getGenesisRunoffFilePath(),
        );
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
        // we reject the query if the handler is not initialized yet.
        if (this.abciQueryHandler === undefined) {
            this.logger.error(`ABCI query handler is not initialized yet.`);
            return AbciQueryEncoder.encodeAbciResponse({
                responseType: AbciResponseType.ERROR,
                error: 'ABCI query handler is not initialized yet.',
            });
        }

        const abciRequest = AbciQueryEncoder.decodeAbciRequest(serializedQuery);
        this.logger.info(`Receiving request of type ${abciRequest.requestType}`);
        try {
            const response = await this.abciQueryHandler.handleAbciRequest(abciRequest);
            return AbciQueryEncoder.encodeAbciResponse(response);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.toString() : 'Unknown error';
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

    async Info(request: InfoRequest) {
        this.logger.info(`info`);
        this.isCatchingUp = false;
        const chainInformation = await this.getLevelDb().getChainInformation();
        const last_block_height = chainInformation?.height || 0;
        if (last_block_height === 0) {
            this.logger.info(`(Info) Aborting info request because the chain is empty.`);
            return InfoResponse.create({
                version: '1',
                data: 'Carmentis ABCI application',
                app_version: APP_VERSION,
                last_block_height,
            });
        } else {
            const { appHash } = await this.getGlobalState().getApplicationHash();

            const hex = EncoderFactory.bytesToHexEncoder();
            this.logger.info(`(Info) last_block_height: ${last_block_height}`);
            this.logger.info(`(Info) last_block_app_hash: ${hex.encode(appHash)}`);

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
        const { appHash } = await this.getGlobalState().getApplicationHash();
        return appHash;
    }

    private async loadReceivedGenesisSnapshotChunks(genesisSnapshotChunks: Uint8Array[]) {
        // we load the chunks using the SnapshotManager
        for (let chunkIndex = 0; chunkIndex < genesisSnapshotChunks.length; chunkIndex++) {
            const chunk = genesisSnapshotChunks[chunkIndex];
            const isLastChunk = chunkIndex === genesisSnapshotChunks.length - 1;
            await this.getSnapshot().loadReceivedChunk(
                this.getStorage(),
                chunkIndex,
                chunk,
                isLastChunk,
            );
        }
    }

    private async initChainAsGenesis(
        request: InitChainRequest,
        issuerPrivateKey: PrivateSignatureKey,
    ) {
        // initialize the database
        await this.getLevelDb().initializeTable();

        await this.storeInitialValidatorSet(request);
        this.logger.info(`Creating initial state for initial height ${request.initial_height}`);
        const appHash = await this.publishInitialBlockchainState(issuerPrivateKey, request);

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
        const numberOfChunksToExport = 4; // TODO(explain): why 4?
        const genesisChunks: Uint8Array[] = [];
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
        const db = this.getLevelDb();
        for (const validator of request.validators) {
            const address = CometBFTPublicKeyConverter.convertRawPublicKeyIntoAddress(
                Utils.bufferToUint8Array(validator.pub_key_bytes),
            );
            const record = await db.getValidatorNodeByAddress(address);
            //const record = await db.getRaw(NODE_SCHEMAS.DB_VALIDATOR_NODE_BY_ADDRESS, address);

            if (!record) {
                this.logger.info(
                    `Adding unknown validator address: ${Utils.binaryToHexa(address)}`,
                );
                await db.putValidatorNode(address);
                /*
                await db.putRaw(
                    NODE_SCHEMAS.DB_VALIDATOR_NODE_BY_ADDRESS,
                    address,
                    Utils.getNullHash(),
                );

                 */
            }
        }
    }

    private async publishInitialBlockchainState(
        issuerPrivateKey: PrivateSignatureKey,
        request: InitChainRequest,
    ) {
        // define variables used below
        const issuerPublicKey = await issuerPrivateKey.getPublicKey();

        // we first create the issuer account
        this.logger.info('Creating microblock for issuer account creation');
        const issuerAccountCreationMicroblock = Microblock.createGenesisAccountMicroblock();
        issuerAccountCreationMicroblock.addSections([
            {
                type: SectionType.ACCOUNT_PUBLIC_KEY,
                publicKey: await issuerPublicKey.getPublicKeyAsBytes(),
                schemeId: issuerPublicKey.getSignatureSchemeId(),
            },
            {
                type: SectionType.ACCOUNT_TOKEN_ISSUANCE,
                amount: ECO.INITIAL_OFFER,
            },
        ]);
        await issuerAccountCreationMicroblock.seal(issuerPrivateKey);
        const {
            microblockData: issuerAccountCreationSerializedMicroblock,
            microblockHash: issuerAccountHash,
        } = issuerAccountCreationMicroblock.serialize();

        // we now create the Carmentis Governance organization
        this.logger.info('Creating governance organization microblock');
        const governanceOrganizationMicroblock = Microblock.createGenesisOrganizationMicroblock();
        governanceOrganizationMicroblock.addSections([
            {
                type: SectionType.ORG_CREATION,
                accountId: issuerAccountHash,
            },
            {
                type: SectionType.ORG_DESCRIPTION,
                name: 'Carmentis Governance',
                website: '',
                countryCode: 'FR',
                city: '',
            },
        ]);
        await governanceOrganizationMicroblock.seal(issuerPrivateKey);
        const { microblockData: governanceOrganizationData, microblockHash: governanceOrgId } =
            governanceOrganizationMicroblock.serialize();

        // we create the (single) protocol virtual blockchain
        this.logger.info('Creating protocol microblock');
        const protocolMicroblock = Microblock.createGenesisProtocolMicroblock();
        protocolMicroblock.addSection({
            type: SectionType.PROTOCOL_CREATION,
            organizationId: governanceOrgId,
        });
        await protocolMicroblock.seal(issuerPrivateKey);
        const { microblockData: protocolInitialUpdate } = protocolMicroblock.serialize();

        // we now create the Carmentis SAS organization
        this.logger.info('Creating Carmentis SAS organization microblock');
        const carmentisOrganizationMicroblock = Microblock.createGenesisOrganizationMicroblock();
        carmentisOrganizationMicroblock.addSections([
            {
                type: SectionType.ORG_CREATION,
                accountId: issuerAccountHash,
            },
            {
                type: SectionType.ORG_DESCRIPTION,
                name: 'Carmentis SAS',
                website: '',
                countryCode: 'FR',
                city: '',
            },
        ]);
        await carmentisOrganizationMicroblock.seal(issuerPrivateKey);
        const { microblockData: carmentisOrganizationData, microblockHash: carmentisOrgId } =
            carmentisOrganizationMicroblock.serialize();

        // We now declare the running node as the genesis node.
        this.logger.info('Creating genesis validator node microblock');
        const mb = Microblock.createGenesisValidatorNodeMicroblock();
        const genesisValidator = request.validators[0];
        mb.addSections([
            {
                type: SectionType.VN_CREATION,
                organizationId: carmentisOrgId,
            },
            {
                type: SectionType.VN_COMETBFT_PUBLIC_KEY_DECLARATION,
                cometPublicKey: Utils.binaryToHexa(genesisValidator.pub_key_bytes),
                cometPublicKeyType: genesisValidator.pub_key_type,
            },
            {
                type: SectionType.VN_RPC_ENDPOINT,
                rpcEndpoint: this.nodeConfig.getCometbftExposedRpcEndpoint(),
            },
        ]);
        await mb.seal(issuerPrivateKey);

        const { microblockData: carmentisNodeMicroblock } = mb.serialize();

        // we now proceed to the runoff
        const transactions: Uint8Array[] = [
            issuerAccountCreationSerializedMicroblock,
            governanceOrganizationData,
            protocolInitialUpdate,
            carmentisOrganizationData,
            carmentisNodeMicroblock,
        ];
        const runoffTransactionsBuilder = new GenesisRunoffTransactionsBuilder(
            this.genesisRunoffs,
            issuerAccountHash,
            issuerPrivateKey,
            issuerPublicKey,
            issuerAccountCreationMicroblock,
        );
        const runoffsTransactions = await runoffTransactionsBuilder.createRunoffTransactions();
        transactions.push(...runoffsTransactions);

        await this.publishGenesisTransactions(transactions, 1);

        const { appHash } = await this.getGlobalState().getApplicationHash();
        return appHash;
    }

    private async publishGenesisTransactions(
        transactions: Uint8Array[],
        publishedBlockHeight: number,
    ) {
        // Since we are publishing transactions at the genesis, publication timestamp is at the lowest possible value.
        // The proposer address is undefined since we do not have published this node.
        const logger = getLogger(['node', 'genesis']);
        const blockTimestamp = Utils.getTimestampInSeconds();
        const globalStateUpdater = GlobalStateUpdaterFactory.createGlobalStateUpdater();
        let txIndex = 0;
        // we create working state to check the transaction
        const workingState = this.getGlobalState();
        for (const tx of transactions) {
            txIndex += 1;
            logger.debug(`Handling transaction ${txIndex} on ${transactions.length}`);
            try {
                const serializedMicroblock = tx;
                const parsedMicroblock =
                    Microblock.loadFromSerializedMicroblock(serializedMicroblock);
                logger.debug(
                    `Transaction parsed successfully: microblock ${parsedMicroblock.getHash().encode()} (type ${parsedMicroblock.getType()})`,
                );

                const checkResult = await this.checkMicroblockLocalStateConsistency(
                    workingState,
                    parsedMicroblock,
                    true,
                );
                if (checkResult.checked) {
                    const vb = checkResult.vb;
                    // we now check the consistency of the working state with the global state
                    const updatedVirtualBlockchain = checkResult.vb;
                    await globalStateUpdater.updateGlobalStateOnMicroblockDuringGenesis(
                        workingState,
                        updatedVirtualBlockchain,
                        parsedMicroblock,
                        {
                            blockHeight: publishedBlockHeight,
                            blockTimestamp,
                            blockMisbehaviors: [],
                        },
                        tx,
                    );
                } else {
                    logger.warn(`Microblock ${parsedMicroblock.getHash().encode()} rejected`);
                }
            } catch (e) {
                logger.error(`An error occurred during handling of genesis microblock: ${e}`);
                if (e instanceof Error) {
                    logger.debug(e.stack ?? 'No stack provided');
                }
            }
        }

        // finalize the working state
        this.logger.info(
            `Finalizing publication of ${transactions.length} transactions at height ${publishedBlockHeight}`,
        );
        await globalStateUpdater.finalizeBlockApproval(workingState, {
            hash: Utils.getNullHash(),
            height: publishedBlockHeight,
            misbehavior: [],
            next_validators_hash: Utils.getNullHash(),
            proposer_address: Utils.getNullHash(),
            syncing_to_height: publishedBlockHeight,
            txs: transactions,
        });

        // commit the state
        this.logger.info(`Committing state at height ${publishedBlockHeight}`);
        const state = this.getGlobalState();
        await state.commit();

        const { appHash } = await state.getApplicationHash();
        return appHash;
    }
    /**
     Incoming transaction
     */
    async CheckTx(request: CheckTxRequest): Promise<CheckTxResponse> {
        const perfMeasure = this.perf.start('CheckTx');
        this.logger.info(`[ CheckTx ]  --------------------------------------------------------`);
        this.logger.info(`Size of transaction: ${request.tx.length} bytes`);

        // we first attempt to parse the microblock
        try {
            const serializedMicroblock = request.tx;
            const parsedMicroblock = Microblock.loadFromSerializedMicroblock(serializedMicroblock);

            // we create working state to check the transaction
            const workingState = new GlobalState(this.getLevelDb(), this.getStorage());
            const checkResult = await this.checkMicroblockLocalStateConsistency(
                workingState,
                parsedMicroblock,
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
     * Extract the relevant Comet parameters from a Comet request
     * This supports PrepareProposalRequest, ProcessProposalRequest and FinalizeBlockRequest
     */
    extractCometParameters(
        request: PrepareProposalRequest | ProcessProposalRequest | FinalizeBlockRequest,
    ): GlobalStateUpdateCometParameters {
        const defaultTimestamp = 0;
        const timeInRequest = request.time?.seconds;
        if (timeInRequest === undefined) {
            this.logger.warn(`No block timestamp provided in request: using timestamp ${defaultTimestamp}`);
        }
        const blockHeight = Number(request.height);
        const blockTimestamp = Number(request.time?.seconds ?? defaultTimestamp);
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
    async PrepareProposal(request: PrepareProposalRequest) {
        const cometParameters = this.extractCometParameters(request);

        this.logger.info(
            `[ PrepareProposal - Height: ${cometParameters.blockHeight} ]  --------------------------------------------------------`,
        );
        this.logger.info(
            `Handling ${request.txs.length} transactions at ts=${cometParameters.blockTimestamp}`,
        );

        const proposedTxs: Uint8Array[] = [];
        const workingState = new GlobalState(this.getLevelDb(), this.getStorage());
        //const cache = this.getCacheInstance(request.txs);
        const globalStateUpdater = GlobalStateUpdaterFactory.createGlobalStateUpdater();

        await globalStateUpdater.updateGlobalStateOnBlock(workingState, cometParameters);

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
                    await globalStateUpdater.updateGlobalStateOnMicroblock(
                        workingState,
                        updatedVirtualBlockchain,
                        parsedMicroblock,
                        cometParameters,
                        tx,
                    );
                    proposedTxs.push(tx);
                } else {
                    // TODO: reject case
                }
            } catch (e) {
                // TODO: reject case
            }
        }

        this.logger.info(
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
        const cometParameters = this.extractCometParameters(request);

        this.logger.info(
            `[ ProcessProposal - Height: ${cometParameters.blockHeight} ]  --------------------------------------------------------`,
        );
        this.logger.info(
            `Handling ${request.txs.length} transactions at ts=${cometParameters.blockTimestamp}`,
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
                    await this.checkMicroblockLocalStateConsistency(workingState, parsedMicroblock);

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
                }
            } catch (e) {
                // TODO: reject case
            }
        }

        /*
        this.logger.info(
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
        const cometParameters = this.extractCometParameters(request);

        this.logger.info(
            `[ FinalizeBlock - Height: ${cometParameters.blockHeight} ]  --------------------------------------------------------`,
        );
        this.logger.info(
            `Handling ${request.txs.length} transactions at ts=$cometParameters.{blockTimestamp}`,
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
                    await this.checkMicroblockLocalStateConsistency(workingState, parsedMicroblock);

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
            } catch (e) {
                this.logger.fatal(`A transaction has been rejected during FinalizeBlock`);
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
        this.logger.info(`[ Commit ] --------------------------------------------------------`);
        const state = this.getGlobalState();
        const db = this.getLevelDb();
        const snapshot = this.getSnapshot();
        if (!state.hasSomethingToCommit()) {
            this.logger.warn(`nothing to commit`);
            return CommitResponse.create({});
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

        return CommitResponse.create({
            retain_height: retainedHeight,
        });
    }

    async ListSnapshots(request: ListSnapshotsRequest) {
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
        this.logger.info(`EVENT: loadSnapshotChunk height=${request.height}`);

        const chunk = await this.getSnapshot().getChunk(
            this.getStorage(),
            request.height,
            request.chunk,
        );

        return LoadSnapshotChunkResponse.create({
            chunk,
        });
    }

    async OfferSnapshot(request: OfferSnapshotRequest) {
        this.logger.info(`EVENT: offerSnapshot`);

        this.importedSnapshot = request.snapshot;

        return OfferSnapshotResponse.create({
            result: OfferSnapshotResult.OFFER_SNAPSHOT_RESULT_ACCEPT,
        });
    }

    async ApplySnapshotChunk(request: ApplySnapshotChunkRequest) {
        this.logger.info(`EVENT: applySnapshotChunk index=${request.index}`);

        // reject if the provided snapshot is not defined
        if (this.importedSnapshot === undefined) {
            this.logger.error(`Cannot apply snapshot chunk: imported snapshot undefined`);
            return ApplySnapshotChunkResponse.create({
                result: ApplySnapshotChunkResult.APPLY_SNAPSHOT_CHUNK_RESULT_ABORT,
            });
        }

        const isLast = request.index == this.importedSnapshot.chunks - 1;
        await this.getSnapshot().loadReceivedChunk(
            this.getStorage(),
            request.index,
            request.chunk,
            isLast,
        );
        const result = ApplySnapshotChunkResult.APPLY_SNAPSHOT_CHUNK_RESULT_ACCEPT;

        return ApplySnapshotChunkResponse.create({
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

    Echo(request: EchoRequest): Promise<EchoResponse> {
        return Promise.resolve({
            message: `Echo: ${request.message}`,
        });
    }

    Flush(request: FlushRequest): Promise<FlushResponse> {
        return Promise.resolve({});
    }

    /**
     Checks a microblock and invokes the section callbacks of the node.
     */
    private async checkMicroblockLocalStateConsistency(
        workingState: GlobalState,
        checkedMicroblock: Microblock,
        executedDuringGenesis = false,
    ): Promise<MicroblockCheckResult> {
        this.logger.debug(
            `Checking microblock local state consistency: genesis mode enabled? ${executedDuringGenesis}`,
        );
        const microblockCheckTimer = this.perf.start('checking microblock');
        try {
            const checker = new MicroblockConsistencyChecker(workingState, checkedMicroblock);

            // loading and checking virtual blockchain consistency when adding the microblock
            this.logger.debug(`Checking virtual blockchain consistency...`);
            await checker.checkVirtualBlockchainConsistencyOrFail();

            // check the consistency of the timestamp defined in the microbloc
            this.logger.debug('Checking timestamp consistency...');
            checker.checkTimestampOrFail();

            // checking gas consistency (skipped when running in genesis mode)
            if (executedDuringGenesis) {
                this.logger.debug('Running in genesis mode, skipping gas consistency check...');
            } else {
                this.logger.debug('Checking gas consistency...');
                await checker.checkGasOrFail();
            }

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