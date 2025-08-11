import path from 'node:path';
import { NODE_SCHEMAS } from './constants/constants';
import { NodeProvider } from './nodeProvider';
import { Storage } from './storage';
import { Snapshot } from './snapshot';
import { AccountManager } from './accountManager';
import { LevelDb } from './levelDb';
import { RadixTree } from './radixTree';
import { CachedLevelDb } from './cachedLevelDb';

const PROPOSAL_UNKNOWN = 0;
const PROPOSAL_ACCEPT = 1;
const PROPOSAL_REJECT = 2;

import {
    InitChainRequest,
    InitChainResponse,
    CheckTxRequest,
    CheckTxResponse,
    CommitResponse,
    ExecTxResult,
    PrepareProposalRequest,
    PrepareProposalResponse,
    ProcessProposalRequest,
    ProcessProposalResponse,
    ExtendVoteRequest,
    ExtendVoteResponse,
    VerifyVoteExtensionRequest,
    VerifyVoteExtensionResponse,
    FinalizeBlockRequest,
    FinalizeBlockResponse,
} from '../proto-ts/cometbft/abci/v1/types';

import {
    CHAIN,
    ECO,
    SCHEMAS,
    SECTIONS,
    Crypto,
    Hash,
    Utils,
    Base64,
    Blockchain,
    MicroblockImporter,
    Economics,
    NullNetworkProvider,
    Provider,
    MessageSerializer,
    MessageUnserializer,
    CryptoSchemeFactory,
    CryptographicHash,
    PublicSignatureKey,
    CMTSToken,
} from '@cmts-dev/carmentis-sdk/server';

interface Cache {
    db: CachedLevelDb;
    storage: Storage,
    blockchain: Blockchain;
    accountManager: AccountManager;
    vbRadix: RadixTree;
    tokenRadix: RadixTree;
    validatorSetUpdate: any[];
}

type SectionCallback = (arg: any) => Promise<void>;
type QueryCallback = (arg: any) => Promise<Uint8Array>;

export class NodeCore {
    logger: any;
    dbPath: string;
    storagePath: string;
    snapshotPath: string;
    accountManager: AccountManager;
    blockchain: Blockchain;
    db: LevelDb;
    storage: Storage;
    messageSerializer: MessageSerializer;
    messageUnserializer: MessageUnserializer;
    vbRadix: RadixTree;
    tokenRadix: RadixTree;
    sectionCallbacks: Map<number, SectionCallback>;
    queryCallbacks: Map<number, QueryCallback>;
    finalizedBlockCache: Cache | null;

    constructor(logger: any, options: any) {
        this.logger = logger;
        this.dbPath = path.join(options.abciStoragePath, "db");
        this.storagePath = path.join(options.abciStoragePath, "microblocks");
        this.snapshotPath = path.join(options.abciStoragePath, "snapshots");

        this.db = new LevelDb(this.dbPath, NODE_SCHEMAS.DB);
        this.db.initialize();

        this.storage = new Storage(this.db, this.storagePath, []);

        const internalProvider = new NodeProvider(this.db, this.storage);
        const provider = new Provider(internalProvider, new NullNetworkProvider());
        this.blockchain = new Blockchain(provider);

        this.messageUnserializer = new MessageUnserializer(SCHEMAS.NODE_MESSAGES);
        this.messageSerializer = new MessageSerializer(SCHEMAS.NODE_MESSAGES);
        this.sectionCallbacks = new Map();
        this.queryCallbacks = new Map();

        this.vbRadix = new RadixTree(this.db, NODE_SCHEMAS.DB_VB_RADIX);
        this.tokenRadix = new RadixTree(this.db, NODE_SCHEMAS.DB_TOKEN_RADIX);

        this.accountManager = new AccountManager(this.db, this.tokenRadix);

        this.finalizedBlockCache = null;

        this.registerSectionPostUpdateCallbacks(CHAIN.VB_ACCOUNT, [
            [SECTIONS.ACCOUNT_TOKEN_ISSUANCE, this.accountTokenIssuanceCallback],
            [SECTIONS.ACCOUNT_CREATION, this.accountCreationCallback],
            [SECTIONS.ACCOUNT_TRANSFER, this.accountTokenTransferCallback],
        ]);

        this.registerSectionPostUpdateCallbacks(CHAIN.VB_VALIDATOR_NODE, [
            [SECTIONS.VN_DESCRIPTION, this.validatorNodeDescriptionCallback],
            [SECTIONS.VN_NETWORK_INTEGRATION, this.validatorNodeNetworkIntegrationCallback],
        ]);

        this.registerQueryCallback(SCHEMAS.MSG_GET_CHAIN_INFORMATION, this.getChainInformation);
        this.registerQueryCallback(SCHEMAS.MSG_GET_BLOCK_INFORMATION, this.getBlockInformation);
        this.registerQueryCallback(SCHEMAS.MSG_GET_BLOCK_CONTENT, this.getBlockContent);
        this.registerQueryCallback(SCHEMAS.MSG_GET_VIRTUAL_BLOCKCHAIN_STATE, this.getVirtualBlockchainState);
        this.registerQueryCallback(SCHEMAS.MSG_GET_VIRTUAL_BLOCKCHAIN_UPDATE, this.getVirtualBlockchainUpdate);
        this.registerQueryCallback(SCHEMAS.MSG_GET_MICROBLOCK_INFORMATION, this.getMicroblockInformation);
        this.registerQueryCallback(SCHEMAS.MSG_AWAIT_MICROBLOCK_ANCHORING, this.awaitMicroblockAnchoring,);
        this.registerQueryCallback(SCHEMAS.MSG_GET_MICROBLOCK_BODYS, this.getMicroblockBodys);
        this.registerQueryCallback(SCHEMAS.MSG_GET_ACCOUNT_STATE, this.getAccountState);
        this.registerQueryCallback(SCHEMAS.MSG_GET_ACCOUNT_HISTORY, this.getAccountHistory);
        this.registerQueryCallback(SCHEMAS.MSG_GET_ACCOUNT_BY_PUBLIC_KEY_HASH, this.getAccountByPublicKeyHash);
        this.registerQueryCallback(SCHEMAS.MSG_GET_VALIDATOR_NODE_BY_ADDRESS, this.getValidatorNodeByAddress);
        this.registerQueryCallback(SCHEMAS.MSG_GET_OBJECT_LIST, this.getObjectList);
    }

    registerSectionPreUpdateCallbacks(objectType: number, callbackList: Array<[number, SectionCallback]>) {
        this.registerSectionCallbacks(objectType, callbackList, 0);
    }

    registerSectionPostUpdateCallbacks(objectType: number, callbackList: Array<[number, SectionCallback]>) {
        this.registerSectionCallbacks(objectType, callbackList, 1);
    }

    registerSectionCallbacks(objectType: number, callbackList: Array<[number, SectionCallback]>, isPostUpdate: number) {
        for (const [sectionType, callback] of callbackList) {
            const key = (sectionType << 5) | (objectType << 1) | isPostUpdate;
            this.sectionCallbacks.set(key, callback.bind(this));
        }
    }

    registerQueryCallback(messageId: any, callback: QueryCallback) {
        this.queryCallbacks.set(messageId, callback.bind(this));
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
                throw `internal error: undefined section callback`;
            }
            await sectionCallback(context);
        }
    }

    async initChain(request: InitChainRequest) {
        this.logger.log(`initChain`);

        this.logger.log(`Clearing database`);
        await this.db.clear();

        this.logger.log(`Clearing storage`);
        await this.storage.clear();

        for (const validator of request.validators) {
            const address = this.cometPublicKeyToAddress(
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

        return {
            consensus_params: undefined,
            /*
      consensusParams: {
        feature: {
          voteExtensionsEnableHeight: 2,
          pbtsEnableHeight: undefined
        },
        block: {
          maxBytes: 2202009,
          maxGas: -1,
        },
        evidence: {
          maxAgeDuration: {
            seconds: 172800,
            nanos: 0
          },
          maxBytes: 2202009,
          maxAgeNumBlocks: 100000
        },
        validator: {
          pubKeyTypes: ['ed25519']
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
          messageDelay: {
            seconds: 172800,
            nanos: 0
          }
        }
      },
*/
            validators: [],
            app_hash: new Uint8Array(32),
        };
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

        if (success) {
            this.logger.log(`Type: ${CHAIN.VB_NAME[importer.vb.type]}`);
            this.logger.log(`Total size: ${request.tx.length} bytes`);

            const vb: any = await importer.getVirtualBlockchain();

            for (const section of vb.currentMicroblock.sections) {
                this.logger.log(
                    `${(SECTIONS.DEF[importer.vb.type][section.type].label + ' ').padEnd(36, '.')} ${section.data.length} byte(s)`,
                );
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

        return PROPOSAL_ACCEPT;
    }

    async extendVote(request: ExtendVoteRequest) {}

    async verifyVoteExtension(request: VerifyVoteExtensionRequest) {}

    async finalizeBlock(request: FinalizeBlockRequest) {
        const numberOfTransactionsInBlock = request.txs.length;
        this.logger.log(`finalizeBlock: ${numberOfTransactionsInBlock} txs`);

        if (this.finalizedBlockCache !== null) {
            this.logger.warn(`finalizeBlock() called before the previous commit()`);
        }

        this.finalizedBlockCache = this.getCacheInstance(request.txs);

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
            validator_updates: [],
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
        const feesAccountInfo = await cache.accountManager.loadInformation(feesAccountIdentifier);
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

        const nValidators = validatorAccounts.length;

        if (!nValidators) {
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

            if (feesPayerAccount !== null) {
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
                        mbHash: vb.currentMicroblock.hash,
                    },
                    timestamp,
                    this.logger,
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

        const tokenRadixHash = await cache.tokenRadix.getRootHash();
        const vbRadixHash = await cache.vbRadix.getRootHash();
        const appHash = Crypto.Hashes.sha256AsBinary(Utils.binaryFrom(vbRadixHash, tokenRadixHash));

        this.logger.debug(`VB radix hash ...... : ${Utils.binaryToHexa(vbRadixHash)}`);
        this.logger.debug(`Token radix hash ... : ${Utils.binaryToHexa(tokenRadixHash)}`);
        this.logger.debug(`Application hash ... : ${Utils.binaryToHexa(appHash)}`);

        return {
            txResults,
            totalFees,
            appHash,
            blockSize,
            microblocks
        };
    }

    async commit() {
        if (this.finalizedBlockCache === null) {
            throw `nothing to commit`;
        }

        await this.finalizedBlockCache.db.commit();
        await this.finalizedBlockCache.storage.commit();

        this.finalizedBlockCache = null;

        this.logger.log(`Commit done`);

/*
        this.logger.log(`Creating snapshot`);
        const snapshot = new Snapshot(this.db, this.snapshotPath);
        await snapshot.create();
        this.logger.log(`Done creating snapshot`);
        this.logger.log(`Listing snapshots`);
        console.log(await snapshot.getList());
*/

        return CommitResponse.create({
            retain_height: 0,
        });
    }

    /**
        Checks a microblock and invokes the section callbacks of the node.
    */
    async checkMicroblock(cache: Cache, importer: MicroblockImporter, timestamp?: number) {
        this.logger.log(`Checking microblock ${Utils.binaryToHexa(importer.hash)}`);

        timestamp = timestamp || Utils.getTimestampInSeconds();

        const status =
            (await importer.checkHeader()) ||
            (await importer.checkTimestamp(timestamp)) ||
            (await importer.instantiateVirtualBlockchain()) ||
            (await importer.importMicroblock()) ||
            (await importer.checkGas());

        if (status) {
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

    async setBlockInformation(cache: Cache, height: number, hash: Uint8Array, timestamp: number, proposerAddress: Uint8Array, size: number, microblockCount: number) {
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

    async setBlockContent(cache: Cache, blockHeight: number, microblocks: any[]) {
    }

    heightToTableKey(height: number) {
        return new Uint8Array(Utils.intToByteArray(height, 6));
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
        const cometAddress = this.cometPublicKeyToAddress(cometPublicKeyBytes);

        const description = await context.object.getDescription();
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
    }

    /**
        Custom Carmentis query via abci_query
    */
    async query(data: any): Promise<Uint8Array> {
        const { type, object } = this.messageUnserializer.unserialize(data);

        this.logger.log(`Received query ${SCHEMAS.NODE_MESSAGES[type].label} (${type})`);

        const queryCallback = this.queryCallbacks.get(type);

        if (!queryCallback) {
            throw new Error(`unsupported query type`);
        }

        try {
            const response = await queryCallback(object);
            return response;
        } catch (error) {
            let errorMsg = 'error';

            this.logger.error(error);

            if (error instanceof Error) {
                errorMsg = error.toString();
            }

            return this.messageSerializer.serialize(SCHEMAS.MSG_ERROR, {
                error: errorMsg,
            });
        }
    }

    async getChainInformation(object: any) {
        this.logger.verbose(`getChainInformation`);
        return await this.db.getRaw(NODE_SCHEMAS.DB_CHAIN_INFORMATION, NODE_SCHEMAS.DB_CHAIN_INFORMATION_KEY);
    }

    async getBlockInformation(object: any) {
        this.logger.verbose(`getBlockInformation`);
        return await this.db.getRaw(NODE_SCHEMAS.DB_BLOCK_INFORMATION, this.heightToTableKey(object.height));
    }

    async getBlockContent(object: any) {
        this.logger.verbose(`getBlockContent`);
        return await this.db.getRaw(NODE_SCHEMAS.DB_BLOCK_CONTENT, this.heightToTableKey(object.height));
    }

    async getVirtualBlockchainState(object: any) {
        const stateData = await this.blockchain.provider.getVirtualBlockchainStateInternal(
            object.virtualBlockchainId,
        );

        if (!stateData) {
            return this.messageSerializer.serialize(SCHEMAS.MSG_ERROR, {
                error: `unknown virtual blockchain`,
            });
        }

        return this.messageSerializer.serialize(SCHEMAS.MSG_VIRTUAL_BLOCKCHAIN_STATE, {
            stateData,
        });
    }

    async getVirtualBlockchainUpdate(object: any) {
        let stateData = await this.blockchain.provider.getVirtualBlockchainStateInternal(
            object.virtualBlockchainId,
        );
        const exists = !!stateData;
        const headers = exists
            ? await this.blockchain.provider.getVirtualBlockchainHeaders(
                  object.virtualBlockchainId,
                  object.knownHeight,
              )
            : [];
        const changed = headers.length > 0;

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        stateData = stateData || new Uint8Array();

        return this.messageSerializer.serialize(SCHEMAS.MSG_VIRTUAL_BLOCKCHAIN_UPDATE, {
            exists,
            changed,
            stateData,
            headers,
        });
    }

    async getMicroblockInformation(object: any) {
        const microblockInfo = await this.blockchain.provider.getMicroblockInformation(object.hash);

        return this.messageSerializer.serialize(SCHEMAS.MSG_MICROBLOCK_INFORMATION, microblockInfo);
    }

    async awaitMicroblockAnchoring(object: any): Promise<Uint8Array> {
        let remaingingAttempts = 120;

        return new Promise((resolve, reject) => {
            const test = async () => {
                const microblockInfo = await this.blockchain.provider.getMicroblockInformation(
                    object.hash,
                );

                if (microblockInfo) {
                    resolve(
                        this.messageSerializer.serialize(
                            SCHEMAS.MSG_MICROBLOCK_ANCHORING,
                            microblockInfo,
                        ),
                    );
                } else {
                    if (--remaingingAttempts > 0) {
                        setTimeout(test, 500);
                    } else {
                        reject();
                    }
                }
            };
            test();
        });
    }

    async getAccountState(object: any) {
        const info = await this.accountManager.loadInformation(object.accountHash);

        return this.messageSerializer.serialize(SCHEMAS.MSG_ACCOUNT_STATE, info.state);
    }

    async getAccountHistory(object: any) {
        const history = await this.accountManager.loadHistory(
            object.accountHash,
            object.lastHistoryHash,
            object.maxRecords,
        );

        return this.messageSerializer.serialize(SCHEMAS.MSG_ACCOUNT_HISTORY, history);
    }

    async getAccountByPublicKeyHash(object: any) {
        const accountHash = await this.accountManager.loadAccountByPublicKeyHash(
            object.publicKeyHash,
        );

        return this.messageSerializer.serialize(SCHEMAS.MSG_ACCOUNT_BY_PUBLIC_KEY_HASH, {
            accountHash
        });
    }

    async getValidatorNodeByAddress(object: any) {
        const dataObject = await this.db.getObject(
            NODE_SCHEMAS.DB_VALIDATOR_NODE_BY_ADDRESS,
            object.address
        );


        // @ts-expect-error The validator hash should be verified
        const validatorNodeHash = dataObject.validatorNodeHash;
        return this.messageSerializer.serialize(SCHEMAS.MSG_VALIDATOR_NODE_BY_ADDRESS, {
            validatorNodeHash
        });
    }

    async getObjectList(object: any) {
        const indexTableId = this.getIndexTableId(object.type);

        if (indexTableId == -1) {
            throw `invalid object type ${object.type}`;
        }

        const list = await this.db.getKeys(indexTableId);

        return this.messageSerializer.serialize(SCHEMAS.MSG_OBJECT_LIST, { list });
    }

    getIndexTableId(type) {
        switch (type) {
            case CHAIN.VB_ACCOUNT: { return NODE_SCHEMAS.DB_ACCOUNTS; }
            case CHAIN.VB_VALIDATOR_NODE: { return NODE_SCHEMAS.DB_VALIDATOR_NODES; }
            case CHAIN.VB_ORGANIZATION: { return NODE_SCHEMAS.DB_ORGANIZATIONS; }
            case CHAIN.VB_APPLICATION: { return NODE_SCHEMAS.DB_APPLICATIONS; }
            default: { return -1; }
        }
    }

    async getMicroblockBodys(object: any) {
        const list = await this.blockchain.provider.getMicroblockBodys(object.hashes);

        return this.messageSerializer.serialize(SCHEMAS.MSG_MICROBLOCK_BODYS, {
            list,
        });
    }

    getCacheInstance(txs: Uint8Array[]): Cache {
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

    cometPublicKeyToAddress(publicKey: Uint8Array) {
        return Crypto.Hashes.sha256AsBinary(publicKey).slice(0, 20);
    }
}
