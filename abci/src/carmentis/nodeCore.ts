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
    VerifyVoteExtensionRequest
} from '../proto-ts/cometbft/abci/v1/types';

import {
    Blockchain,
    CHAIN,
    CMTSToken,
    Crypto,
    CryptographicHash,
    CryptoSchemeFactory,
    ECO,
    Economics,
    EncoderFactory,
    Hash,
    IllegalParameterError,
    KeyedProvider,
    MessageSerializer,
    MessageUnserializer,
    MicroblockImporter,
    NullNetworkProvider,
    PrivateSignatureKey,
    Provider,
    PublicSignatureKey,
    SCHEMAS,
    Secp256k1PrivateSignatureKey,
    SECTIONS,
    Utils
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
    maxSnapshots: 3
};

interface Cache {
    db: CachedLevelDb;
    storage: Storage,
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
    private sk: PrivateSignatureKey;
    isImportingSnapshot: boolean;


    // storage paths
    private dbPath: string;
    private storagePath: string;
    private snapshotPath: string;

    // Serializers are used to serialize/deserialize the messages sent to the application.
    private messageSerializer =  new MessageSerializer(SCHEMAS.NODE_MESSAGES);
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
        this.dbPath = path.join(abciStoragePath, "db");
        this.storagePath = path.join(abciStoragePath, "microblocks");
        this.snapshotPath = path.join(abciStoragePath, "snapshots");

        // Create and initialize the database.
        this.db = new LevelDb(this.dbPath, NODE_SCHEMAS.DB);
        this.db.initialize();

        // Create and initialize file storage management and snapshot management.
        this.storage = new Storage(this.db, this.storagePath, []);
        this.snapshot = new SnapshotsManager(this.db, this.snapshotPath, this.logger);


        const sk = kms.getIssuerPrivateKey();
        const pk = sk.getPublicKey();
        const internalProvider = new NodeProvider(this.db, this.storage);
        const provider = new KeyedProvider(sk, internalProvider, new NullNetworkProvider());
        this.blockchain = new Blockchain(provider);
        this.sk = sk;
        this.accountManager = new AccountManager(this.db, this.tokenRadix);

        this.abciQueryHandler = new ABCIQueryHandler(this.blockchain, this.db, this.accountManager);

        // instantiate radix trees
        this.vbRadix = new RadixTree(this.db, NODE_SCHEMAS.DB_VB_RADIX);
        this.tokenRadix = new RadixTree(this.db, NODE_SCHEMAS.DB_TOKEN_RADIX);

        this.finalizedBlockCache = null;

        // we do not import snapshot by default
        this.isImportingSnapshot = false;
    }


    async invokeSectionPreUpdateCallback(objectType: number, sectionType: number, context: any) {
        await this.invokeSectionCallback(objectType, sectionType, context, 0);
    }

    async invokeSectionPostUpdateCallback(objectType: number, sectionType: number, context: any) {
        await this.invokeSectionCallback(objectType, sectionType, context, 1);
    }

    async invokeSectionCallback(objectType: number, sectionType: number, context: any, isPostUpdate: number) {
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
        this.isImportingSnapshot = false;

        const chainInfoObject = <any>await this.db.getObject(NODE_SCHEMAS.DB_CHAIN_INFORMATION, NODE_SCHEMAS.DB_CHAIN_INFORMATION_KEY) || {
            height: 0
        };

        const { appHash } = await this.computeApplicationHash(this.tokenRadix, this.vbRadix, this.storage);

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

        this.logger.log(`Creating initial state for initial height ${request.initial_height}`);
        const appHash = await this.publishInitialBlockchainState(request);
        return {
            consensus_params: {},
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
            validators: [],
            app_hash: appHash,
        };
    }


    private async publishInitialBlockchainState(request: InitChainRequest) {
        const issuerPrivateKey = this.kms.getIssuerPrivateKey();
        const stateBuilder = new InitialBlockchainStateBuilder(
            request,
            issuerPrivateKey,
            this.blockchain
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
        const blockTimestamp = 0;
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
        const processBlockResult = await this.processBlock(cache, blockHeight, blockTimestamp, request.txs);

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

        const processBlockResult = await this.processBlock(this.finalizedBlockCache, blockHeight, blockTimestamp, request.txs);
        const fees = CMTSToken.createAtomic(processBlockResult.totalFees);
        this.logger.log(`Total block fees: ${fees.toString()}`);

        await this.setBlockInformation(
            this.finalizedBlockCache,
            blockHeight,
            request.hash,
            blockTimestamp,
            request.proposer_address,
            processBlockResult.blockSize,
            request.txs.length
        );

        await this.setBlockContent(this.finalizedBlockCache, blockHeight, processBlockResult.microblocks);

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
        const feesAccountInfo: AccountInformation = await cache.accountManager.loadInformation(feesAccountIdentifier);
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
                    const validatorPublicKey: PublicSignatureKey = await validatorNode.getOrganizationPublicKey();
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

    async processBlock(cache: any, blockHeight: number, timestamp: number, txs: any) {
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
            const success = await this.checkMicroblock(cache, importer, timestamp);

            const vb: any = await importer.getVirtualBlockchain();

            if(vb.height == 1) {
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
                sectionCount
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
                })
            );
        }

        const chainInfoObject = await cache.db.getObject(NODE_SCHEMAS.DB_CHAIN_INFORMATION, NODE_SCHEMAS.DB_CHAIN_INFORMATION_KEY) || {
            microblockCount: 0,
            objectCounts: Array(CHAIN.N_VIRTUAL_BLOCKCHAINS).fill(0)
        };

        chainInfoObject.height = blockHeight;
        chainInfoObject.lastBlockTimestamp = timestamp;
        chainInfoObject.microblockCount += txs.length;
        chainInfoObject.objectCounts = chainInfoObject.objectCounts.map((count, ndx) => count + newObjects[ndx]);
        await cache.db.putObject(NODE_SCHEMAS.DB_CHAIN_INFORMATION, NODE_SCHEMAS.DB_CHAIN_INFORMATION_KEY, chainInfoObject);

        const { tokenRadixHash, vbRadixHash, radixHash, storageHash, appHash } = await this.computeApplicationHash(cache.tokenRadix, cache.vbRadix, cache.storage);

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
            microblocks
        };
    }

    private async sendFeesFromFeesPayerAccountToFeesAccount(cache: Cache, feesPayerAccount: Uint8Array, fees: number, chainReference: Uint8Array, sentAt: number) {
        await cache.accountManager.tokenTransfer(
            {
                type: ECO.BK_PAID_TX_FEES,
                payerAccount: feesPayerAccount,
                payeeAccount: Economics.getSpecialAccountTypeIdentifier(
                    ECO.ACCOUNT_BLOCK_FEES,
                ),
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
        const radixHash = Crypto.Hashes.sha256AsBinary(Utils.binaryFrom(vbRadixHash, tokenRadixHash));
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

        const chainInfoObject = <any>await this.db.getObject(NODE_SCHEMAS.DB_CHAIN_INFORMATION, NODE_SCHEMAS.DB_CHAIN_INFORMATION_KEY);

        // Create snapshots under conditions that we are not already importing snapshots and it is
        // the right period to generate snapshots.
        let retainedHeight = 0;
        const isNotImportingSnapshot = !this.isImportingSnapshot;
        const isTimeToGenerateSnapshot = chainInfoObject.height % nodeConfig.snapshotBlockPeriod == 0;
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
            await this.snapshot.getChunk(this.storage, lastSnapshot.height, n);
        }
         */
        // !! END TEST

        return CommitResponse.create({
            retain_height: retainedHeight
        });
    }

    async listSnapshots(request: ListSnapshotsRequest) {
        this.logger.log(`listSnapshots`);

        const list = await this.snapshot.getList();

        return ListSnapshotsResponse.create({
            snapshots : list.map((object) => {
                // FIXME: use serialized version of object.metadata?
                const metadata = new Uint8Array();

                return {
                    height: object.height,
                    format: object.format,
                    chunks: object.chunks,
                    hash: Utils.binaryFromHexa(object.hash),
                    metadata
                };
            })
        });
    }

    async loadSnapshotChunk(request: LoadSnapshotChunkRequest) {
        this.logger.log(`loadSnapshotChunk height=${request.height}`);

        const chunk = await this.snapshot.getChunk(this.storage, request.height, request.chunk);

        return LoadSnapshotChunkResponse.create({
            chunk
        });
    }

    async offerSnapshot(request: OfferSnapshotRequest) {
        this.logger.log(`offerSnapshot`);

        this.isImportingSnapshot = true;

        return OfferSnapshotResponse.create({
            result: OfferSnapshotResult.OFFER_SNAPSHOT_RESULT_ACCEPT
        });
    }

    async applySnapshotChunk(request: ApplySnapshotChunkRequest) {
        this.logger.log(`applySnapshotChunk index=${request.index}`);

        await this.snapshot.loadReceivedChunk(this.storage, request.index, request.chunk);
        const result = ApplySnapshotChunkResult.APPLY_SNAPSHOT_CHUNK_RESULT_ACCEPT;

        return ApplySnapshotChunkResponse.create({
            result,
            refetch_chunks: [],
            reject_senders: []
        });
    }

    /**
      Checks a microblock and invokes the section callbacks of the node.
    */
    private async checkMicroblock(
        cache: Cache,
        importer: MicroblockImporter,
        timestamp: number = Utils.getTimestampInSeconds(),
    ) {
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

        if(indexTableId != -1) {
            await cache.db.putObject(indexTableId, importer.vb.identifier, {});
        }

        this.logger.log(`Accepted`);
        return true;
    }

    private async setBlockInformation(cache: Cache, height: number, hash: Uint8Array, timestamp: number, proposerAddress: Uint8Array, size: number, microblockCount: number) {
        await cache.db.putObject(
            NODE_SCHEMAS.DB_BLOCK_INFORMATION,
            this.heightToTableKey(height),
            {
                hash,
                timestamp,
                proposerAddress,
                size,
                microblockCount
            }
        );
    }

    private async setBlockContent(cache: Cache, height: number, microblocks: any[]) {
        await cache.db.putObject(
            NODE_SCHEMAS.DB_BLOCK_CONTENT,
            this.heightToTableKey(height),
            {
                microblocks
            }
        );
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
