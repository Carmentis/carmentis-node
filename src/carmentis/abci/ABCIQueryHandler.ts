import {
    AbciRequest,
    AbciRequestType,
    AbciResponse,
    AbciResponseType,
    AccountByPublicKeyHashAbciResponse,
    AccountHistoryAbciResponse,
    AccountStateAbciResponse,
    AccountUpdatesAbciResponse,
    AccountUpdate,
    AwaitMicroblockAnchoringAbciRequest,
    BlockchainUtils,
    BlockContentAbciResponse,
    BlockInformationAbciResponse,
    BlockModifiedAccountsAbciResponse,
    ChainInformationAbciResponse,
    GenesisSnapshotAbciResponse,
    GetAccountByPublicKeyHashAbciRequest,
    GetAccountHistoryAbciRequest,
    GetAccountStateAbciRequest,
    GetBlockContentAbciRequest,
    GetBlockInformationAbciRequest,
    GetBlockModifiedAccountsAbciRequest,
    GetAccountUpdatesAbciRequest,
    GetChainInformationAbciRequest,
    GetGenesisSnapshotAbciRequest,
    GetMicroblockBodysAbciRequest,
    GetMicroblockInformationAbciRequest,
    GetMicroblockInformationByHeightAbciRequest,
    GetSerializedMicroblockByHeightAbciRequest,
    GetRawBlockContentAbciRequest,
    GetValidatorNodeByAddressAbciRequest,
    GetVirtualBlockchainStateAbciRequest,
    GetVirtualBlockchainUpdateAbciRequest,
    Hash,
    MicroblockAnchoringAbciResponse,
    MicroblockBodysAbciResponse,
    MicroblockInformationAbciResponse,
    SerializedMicroblockByHeightAbciResponse,
    RawBlockContentAbciResponse,
    Utils,
    ValidatorNodeByAddressAbciResponse,
    VirtualBlockchainStateAbciResponse,
    VirtualBlockchainUpdateAbciResponse,
    GetMicroblockProofAbciRequest,
    MicroblockProofAbciResponse,
    GetAccountProofAbciRequest,
    AccountProofAbciResponse,
} from '@cmts-dev/carmentis-sdk-core';
import { LevelDb } from './database/LevelDb';
import { AccountManager } from './accounts/AccountManager';
import { GenesisSnapshotStorageService } from './GenesisSnapshotStorageService';
import { GlobalState } from './state/GlobalState';
import { Logger, getLogger } from '@logtape/logtape';
import { PersistentMerkleTree } from './persistentMerkleTree/PersistentMerkleTree';
import { NodeCrypto } from "./crypto/NodeCrypto";
import { StateProof } from './stateProof/StateProof';

const MAX_RAW_BLOCK_PART_SIZE = 2 * 1024 * 1024;

export class ABCIQueryHandler {

    private static readonly MAX_HISTORY_RECORDS_LIMIT = 100;
    private static readonly MAX_MICROBLOCK_BODIES_LIMIT = 100;

    private logger: Logger;

    private readonly accountManager: AccountManager;

    constructor(
        private readonly provider: GlobalState,
        private readonly db: LevelDb,
        private readonly genesisSnapshotHandler: GenesisSnapshotStorageService,
    ) {
        this.logger = getLogger(['node', 'abci', 'query']);
        this.accountManager = provider.getAccountManager();
    }

    handleAbciRequest(request: AbciRequest): Promise<AbciResponse> {
        switch (request.requestType) {
            case AbciRequestType.AWAIT_MICROBLOCK_ANCHORING:
                return this.awaitMicroblockAnchoring(request);
            case AbciRequestType.GET_ACCOUNT_BY_PUBLIC_KEY_HASH:
                return this.getAccountByPublicKeyHash(request);
            case AbciRequestType.GET_VALIDATOR_NODE_BY_ADDRESS:
                return this.getValidatorNodeByAddress(request);
            case AbciRequestType.GET_GENESIS_SNAPSHOT:
                return this.getGenesisSnapshot(request);
            case AbciRequestType.GET_ACCOUNT_HISTORY:
                return this.getAccountHistory(request);
            case AbciRequestType.GET_ACCOUNT_STATE:
                return this.getAccountState(request);
            case AbciRequestType.GET_MICROBLOCK_BODYS:
                return this.getMicroblockBodys(request);
            case AbciRequestType.GET_VIRTUAL_BLOCKCHAIN_STATE:
                return this.getVirtualBlockchainState(request);
            case AbciRequestType.GET_VIRTUAL_BLOCKCHAIN_UPDATE:
                return this.getVirtualBlockchainUpdate(request);
            case AbciRequestType.GET_MICROBLOCK_INFORMATION:
                return this.getMicroblockInformation(request);
            case AbciRequestType.GET_MICROBLOCK_INFORMATION_BY_HEIGHT:
                return this.getMicroblockInformationByHeight(request);
            case AbciRequestType.GET_BLOCK_INFORMATION:
                return this.getBlockInformation(request);
            case AbciRequestType.GET_BLOCK_CONTENT:
                return this.getBlockContent(request);
            case AbciRequestType.GET_BLOCK_MODIFIED_ACCOUNTS:
                return this.getBlockModifiedAccounts(request);
            case AbciRequestType.GET_ACCOUNT_UPDATES:
                return this.getAccountUpdates(request);
            case AbciRequestType.GET_RAW_BLOCK_CONTENT:
                return this.getRawBlockContent(request);
            case AbciRequestType.GET_CHAIN_INFORMATION:
                return this.getChainInformation(request);
            case AbciRequestType.GET_SERIALIZED_MICROBLOCK_BY_HEIGHT:
                return this.getSerializedMicroblockByHeight(request);
            case AbciRequestType.GET_MICROBLOCK_PROOF:
                return this.getMicroblockProof(request);
            case AbciRequestType.GET_ACCOUNT_PROOF:
                return this.getAccountProof(request);
            default:
                throw new Error(`Unsupported request`);
        }
    }

    async getGenesisSnapshot(request: GetGenesisSnapshotAbciRequest): Promise<GenesisSnapshotAbciResponse> {
        const snapshot = await this.genesisSnapshotHandler.readGenesisSnapshotFromDisk();
        return {
            responseType: AbciResponseType.GENESIS_SNAPSHOT,
            base64EncodedChunks: snapshot.base64EncodedChunks,
        }
    }

    async getChainInformation(request: GetChainInformationAbciRequest): Promise<ChainInformationAbciResponse> {
        this.logger.debug(`Request for chain information`);
        const chainInfo = await this.db.getChainInformation();
        return {
            responseType: AbciResponseType.CHAIN_INFORMATION,
            ...chainInfo
        }
    }

    async getBlockInformation(request: GetBlockInformationAbciRequest): Promise<BlockInformationAbciResponse> {
        const requestedBlockHeight = request.height;
        this.logger.debug(`Request to get information for block ${requestedBlockHeight} `);
        const blockInformation = await this.db.getBlockInformation(requestedBlockHeight);
        if (blockInformation === undefined) throw new Error(`No information found for block ${requestedBlockHeight}`);
        return {
            responseType: AbciResponseType.BLOCK_INFORMATION,
            ...blockInformation
        }
    }

    async getBlockContent(request: GetBlockContentAbciRequest): Promise<BlockContentAbciResponse> {
        const requestedBlockHeight = request.height;
        this.logger.debug(`Request to get content for block ${requestedBlockHeight}`);
        const blockContent = await this.db.getBlockContent(requestedBlockHeight);
        if (blockContent === undefined) throw new Error(`No block found at height ${requestedBlockHeight}`);
        return {
            responseType: AbciResponseType.BLOCK_CONTENT,
            ...blockContent
        }
    }

    async getBlockModifiedAccounts(request: GetBlockModifiedAccountsAbciRequest): Promise<BlockModifiedAccountsAbciResponse> {
        const requestedBlockHeight = request.height;
        this.logger.debug(`Request to get modified accounts for block ${requestedBlockHeight}`);
        const blockModifiedAccounts = await this.db.getBlockModifiedAccounts(requestedBlockHeight);
        if (blockModifiedAccounts === undefined) throw new Error(`No data found at height ${requestedBlockHeight}`);
        return {
            responseType: AbciResponseType.BLOCK_MODIFIED_ACCOUNTS,
            ...blockModifiedAccounts
        }
    }

    async getAccountUpdates(request: GetAccountUpdatesAbciRequest): Promise<AccountUpdatesAbciResponse> {
        const requestedAccounts = request.list;
        this.logger.debug(`Request to get account updates for ${requestedAccounts.length} account(s)`);
        const list: AccountUpdate[] = [];
        for (const requestedAccount of requestedAccounts) {
            const accountHash = requestedAccount.accountHash;
            const currentState = await this.db.getAccountStateByAccountId(accountHash);
            if (currentState === undefined) {
                this.logger.warn(`account ${Utils.binaryToHexa(accountHash)} is undefined`);
            } else {
                const historyUpdate =
                    await this.accountManager.getHistoryRange(
                        currentState.lastHistoryHash,
                        requestedAccount.lastKnownHistoryHash,
                    );
                list.push({
                    accountHash,
                    currentState,
                    historyUpdate,
                });
            }
        }
        return {
            responseType: AbciResponseType.ACCOUNT_UPDATES,
            list,
        }
    }

    async getRawBlockContent(request: GetRawBlockContentAbciRequest): Promise<RawBlockContentAbciResponse> {
        const requestedBlockHeight = request.height;
        const partIndex = request.partIndex;
        this.logger.debug(`Request to get raw content for block at height ${requestedBlockHeight} / partIndex = ${partIndex}`);
        const blockContent = await this.db.getBlockContent(requestedBlockHeight);
        if (blockContent === undefined) {
            throw new Error(`Unable to retrieve block content at height ${requestedBlockHeight}`);
        }
        const currentPart: Uint8Array[] = [];
        const parts = [];
        let currentPartSize = 0;

        for (const microblock of blockContent.microblocks) {
            const serializedMicroblock = await this.provider.getFullSerializedMicroblock(
                Hash.from(microblock.hash)
            );
            if (serializedMicroblock !== null) {
                if (currentPartSize + serializedMicroblock.length > MAX_RAW_BLOCK_PART_SIZE) {
                    parts.push(currentPart);
                    currentPart.length = 0;
                    currentPartSize = 0;
                }
                currentPartSize += serializedMicroblock.length;
                currentPart.push(serializedMicroblock);
            }
        }
        if (currentPart.length > 0) {
            parts.push(currentPart);
        }
        const numberOfParts = parts.length;
        const serializedMicroblocks = parts[partIndex] || [];
        const response = {
            partIndex,
            numberOfParts,
            serializedMicroblocks,
        };
        return {
            responseType: AbciResponseType.RAW_BLOCK_CONTENT,
            ...response
        };
    }

    async getVirtualBlockchainState(request: GetVirtualBlockchainStateAbciRequest): Promise<VirtualBlockchainStateAbciResponse> {
        const virtualBlockchainId: Uint8Array = request.virtualBlockchainId;
        this.logger.debug(`Request state for virtual blockchain ${Utils.binaryToHexa(virtualBlockchainId)}`)
        const cachedDb = this.provider.getDatabase();
        const stateData = await cachedDb.getSerializedVirtualBlockchainState(virtualBlockchainId);
        if (!stateData) {
            const errMsg = `Cannot load virtual blockchain state: Virtual blockchain with id ${Utils.binaryToHexa(virtualBlockchainId)} not found`;
            this.logger.warn(errMsg);
            throw new Error(errMsg);
        }
        this.logger.debug(
            `Virtual blockchain state request for id ${Utils.binaryToHexa(virtualBlockchainId)}: done`,
        );
        return {
            responseType: AbciResponseType.VIRTUAL_BLOCKCHAIN_STATE,
            serializedVirtualBlockchainState: stateData,
        }
    }

    async getVirtualBlockchainUpdate(request: GetVirtualBlockchainUpdateAbciRequest): Promise<VirtualBlockchainUpdateAbciResponse> {
        const virtualBlockchainId: Uint8Array = request.virtualBlockchainId;
        this.logger.debug(
            `Request update for virtual blockchain ${Utils.binaryToHexa(virtualBlockchainId)}`,
        );
        const vbState = await this.provider.getVirtualBlockchainStatus(
            virtualBlockchainId
        );

        // return empty response if virtual blockchain does not exist
        if (vbState === null) {
            this.logger.warn(`Cannot load virtual blockchain update: Virtual blockchain with id ${Utils.binaryToHexa(virtualBlockchainId)} not found`);
            return {
                responseType: AbciResponseType.VIRTUAL_BLOCKCHAIN_UPDATE,
                exists: false,
                changed: false,
                serializedVirtualBlockchainState: Utils.getNullHash(),
            }
        }

        const serializedVirtualBlockchainState = BlockchainUtils.encodeVirtualBlockchainState(vbState);
        const stateHash = NodeCrypto.Hashes.sha256AsBinary(serializedVirtualBlockchainState);
        const changed = !Utils.binaryIsEqual(request.knownStateHash, stateHash);

        this.logger.debug(
            `Virtual blockchain update request for id ${Utils.binaryToHexa(virtualBlockchainId)}: ${changed ? 'changed' : 'unchanged'}`,
        );
        return {
            responseType: AbciResponseType.VIRTUAL_BLOCKCHAIN_UPDATE,
            exists: true,
            changed,
            serializedVirtualBlockchainState: changed ? serializedVirtualBlockchainState : Utils.getNullHash(),
        };
    }

    async getMicroblockInformation(request: GetMicroblockInformationAbciRequest): Promise<MicroblockInformationAbciResponse> {
        const microblockHash: Uint8Array = request.hash;
        return this.getMicroblockInformationByHash(microblockHash);
    }

    async getMicroblockInformationByHeight(request: GetMicroblockInformationByHeightAbciRequest): Promise<MicroblockInformationAbciResponse> {
        const db = this.provider.getDatabase();
        const microblockHash = await PersistentMerkleTree.getTreeLeaf(
            db,
            request.virtualBlockchainId,
            request.height - 1,
        );
        return this.getMicroblockInformationByHash(microblockHash);
    }

    async getMicroblockInformationByHash(microblockHash: Uint8Array): Promise<MicroblockInformationAbciResponse> {
        const db = this.provider.getDatabase();
        const microblockInfo = await db.getMicroblockInformation(microblockHash);
        if (microblockInfo === undefined) throw new Error(`Microblock with hash ${Utils.binaryToHexa(microblockHash)} not found`);
        this.logger.debug(`Returned microblock info for microblock hash ${Utils.binaryToHexa(microblockHash)}: ${JSON.stringify(microblockInfo)}`);
        this.logger.debug(`Returned body hash: ${Utils.binaryToHexa(microblockInfo.header.bodyHash)}`)
        return {
            responseType: AbciResponseType.MICROBLOCK_INFORMATION,
            ...microblockInfo
        }
    }

    async getSerializedMicroblockByHeight(request: GetSerializedMicroblockByHeightAbciRequest): Promise<SerializedMicroblockByHeightAbciResponse> {
        const serializedContent = await this.provider.getSerializedMicroblockByHeight(
            request.virtualBlockchainId,
            request.height,
        );
        if (serializedContent === null) throw new Error(`microblock not found`);
        return {
            responseType: AbciResponseType.SERIALIAZED_MICROBLOCK_BY_HEIGHT,
            serializedContent,
        }
    }

    async getMicroblockProof(request: GetMicroblockProofAbciRequest): Promise<MicroblockProofAbciResponse> {
        const db = this.provider.getDatabase();
        const stateProof = new StateProof(db);
        const proof = await stateProof.createMicroblockProof(request.hash);
        return {
            responseType: AbciResponseType.MICROBLOCK_PROOF,
            proof,
        };
    }

    async getAccountProof(request: GetAccountProofAbciRequest): Promise<AccountProofAbciResponse> {
        const db = this.provider.getDatabase();
        const stateProof = new StateProof(db);
        const proof = await stateProof.createAccountProof(request.accountId);
        return {
            responseType: AbciResponseType.ACCOUNT_PROOF,
            proof,
        };
    }

    async awaitMicroblockAnchoring(request: AwaitMicroblockAnchoringAbciRequest): Promise<MicroblockAnchoringAbciResponse> {
        let remaingingAttempts = 120;
        const db = this.provider.getDatabase();

        return new Promise(async (resolve, reject) => {
            const test = async () => {
                const microblockInfo = await db.getMicroblockInformation(request.hash);

                if (microblockInfo) {
                    const response: MicroblockAnchoringAbciResponse = {
                        responseType: AbciResponseType.MICROBLOCK_ANCHORING,
                        ...microblockInfo
                    }
                    resolve(response);
                } else {
                    if (--remaingingAttempts > 0) {
                        setTimeout(test, 500);
                    } else {
                        reject();
                    }
                }
            };
            await test();
        });
    }

    async getAccountState(request: GetAccountStateAbciRequest): Promise<AccountStateAbciResponse> {
        const requestAccountHash = request.accountHash;
        const info = await this.accountManager.loadAccountInformation(requestAccountHash);
        if (info.exists) {
            const accountState = info.state;
            return {
                responseType: AbciResponseType.ACCOUNT_STATE,
                height: accountState.height,
                balance: accountState.balance,
                lastHistoryHash: accountState.lastHistoryHash,
                locks: accountState.locks
            }
        } else {
            throw new Error(`Account with id ${Utils.binaryToHexa(requestAccountHash)} does not exists`);
        }
    }

    async getAccountHistory(request: GetAccountHistoryAbciRequest): Promise<AccountHistoryAbciResponse> {
        // ensure that the desired number of records is not exceeding the limit
        const maxRecords = request.maxRecords;
        if (ABCIQueryHandler.MAX_HISTORY_RECORDS_LIMIT < maxRecords) {
            throw new Error(`The maximum number of records to return is ${ABCIQueryHandler.MAX_HISTORY_RECORDS_LIMIT}`);
        }

        const history = await this.accountManager.loadHistory(
            request.lastHistoryHash,
            maxRecords,
        );

        return {
            responseType: AbciResponseType.ACCOUNT_HISTORY,
            list: history
        }
    }

    async getAccountByPublicKeyHash(request: GetAccountByPublicKeyHashAbciRequest): Promise<AccountByPublicKeyHashAbciResponse> {
        return {
            responseType: AbciResponseType.ACCOUNT_BY_PUBLIC_KEY_HASH,
            accountHash: await this.accountManager.loadAccountIdByPublicKeyHash(
                request.publicKeyHash,
            ),
        };
    }

    async getValidatorNodeByAddress(request: GetValidatorNodeByAddressAbciRequest): Promise<ValidatorNodeByAddressAbciResponse> {
        const dataObject = await this.db.getValidatorNodeByAddress(request.address);
        if (dataObject === undefined) throw new Error(`Validator node with address ${Utils.binaryToHexa(request.address)} not found`);
        const validatorNodeHash = dataObject.validatorNodeHash;
        return {
            responseType: AbciResponseType.VALIDATOR_NODE_BY_ADDRESS,
            validatorNodeHash
        }
    }

    async getMicroblockBodys(request: GetMicroblockBodysAbciRequest): Promise<MicroblockBodysAbciResponse> {
        // limit the number of requested bodies per request
        if (request.hashes.length > ABCIQueryHandler.MAX_MICROBLOCK_BODIES_LIMIT) throw new Error(
            `The maximum number of microblock bodies to return is 100. Requested ${request.hashes.length}`
        )

        // TODO: check what happen if no body found
        const microblockHashes = request.hashes;
        const microblockBodies = await this.provider.getListOfMicroblockBody(microblockHashes);
        const response: MicroblockBodysAbciResponse['list'] = [];
        for (let index = 0; index < microblockBodies.length; index++) {
            response.push({
                microblockHash: microblockHashes[index],
                microblockBody: microblockBodies[index]
            });
        }
        return {
            responseType: AbciResponseType.MICROBLOCK_BODYS,
            list: response
        }
    }

    private heightToTableKey(height: number) {
        return LevelDb.convertHeightToTableKey(height);
    }
}
