import { NODE_SCHEMAS } from './constants/constants';
import {
    AbciRequest,
    AbciRequestType,
    AbciResponse,
    AbciResponseType,
    AccountByPublicKeyHashAbciResponse,
    AccountHistoryAbciResponse,
    AccountStateAbciResponse,
    AwaitMicroblockAnchoringAbciRequest,
    BlockchainUtils,
    BlockContentAbciResponse,
    BlockInformationAbciResponse,
    ChainInformationAbciResponse,
    GenesisSnapshotAbciResponse,
    GetAccountByPublicKeyHashAbciRequest,
    GetAccountHistoryAbciRequest,
    GetAccountStateAbciRequest,
    GetBlockContentAbciRequest,
    GetBlockInformationAbciRequest,
    GetChainInformationAbciRequest,
    GetGenesisSnapshotAbciRequest,
    GetMicroblockBodysAbciRequest,
    GetMicroblockInformationAbciRequest,
    GetObjectListAbciRequest,
    GetValidatorNodeByAddressAbciRequest,
    GetVirtualBlockchainStateAbciRequest,
    GetVirtualBlockchainUpdateAbciRequest,
    Hash,
    MessageSerializer,
    MessageUnserializer,
    MicroblockAnchoringAbciResponse,
    MicroblockBodysAbciResponse,
    MicroblockInformationAbciResponse,
    ObjectListAbciResponse,
    Provider,
    SCHEMAS,
    Utils,
    ValidatorNodeByAddressAbciResponse,
    VirtualBlockchainStateAbciResponse,
    VirtualBlockchainUpdateAbciResponse,
} from '@cmts-dev/carmentis-sdk/server';
import { Logger } from '@nestjs/common';
import { QueryCallback } from './types/QueryCallback';
import { LevelDb } from './database/LevelDb';
import { AccountManager } from './accounts/AccountManager';
import { GenesisSnapshotStorageService } from './GenesisSnapshotStorageService';
import { GlobalState } from './state/GlobalState';

export class ABCIQueryHandler {
    private logger: Logger;

    private readonly accountManager: AccountManager;

    constructor(
        private readonly provider: GlobalState,
        private readonly db: LevelDb,
        private readonly genesisSnapshotHandler: GenesisSnapshotStorageService,
    ) {
        this.logger = new Logger(ABCIQueryHandler.name);
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
            case AbciRequestType.GET_OBJECT_LIST:
                return this.getObjectList(request);
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
            case AbciRequestType.GET_BLOCK_INFORMATION:
                return this.getBlockInformation(request);
            case AbciRequestType.GET_BLOCK_CONTENT:
                return this.getBlockContent(request);
            case AbciRequestType.GET_CHAIN_INFORMATION:
                return this.getChainInformation(request);
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
        //return this.messageSerializer.serialize(SCHEMAS.MSG_GENESIS_SNAPSHOT, snapshot);
    }

    async getChainInformation(request: GetChainInformationAbciRequest): Promise<ChainInformationAbciResponse> {
        this.logger.verbose(`getChainInformation`);
        const chainInfo = await this.db.getChainInformationObject();
        return {
            responseType: AbciResponseType.CHAIN_INFORMATION,
            ...chainInfo
        }
    }

    async getBlockInformation(request: GetBlockInformationAbciRequest): Promise<BlockInformationAbciResponse> {
        const requestedBlockHeight = request.height;
        this.logger.verbose(`Request to get information for block ${requestedBlockHeight} `);
        const blockInformation = await this.db.getBlockInformation(requestedBlockHeight);
        if (blockInformation === null) throw new Error(`No information found for block ${requestedBlockHeight}`);
        return {
            responseType: AbciResponseType.BLOCK_INFORMATION,
            ...blockInformation
        }
    }

    async getBlockContent(request: GetBlockContentAbciRequest): Promise<BlockContentAbciResponse> {
        const requestedBlockHeight = request.height;
        this.logger.verbose(`Request to get content for block ${requestedBlockHeight}`);
        const blockContent = await this.db.getBlockContent(requestedBlockHeight);
        return {
            responseType: AbciResponseType.BLOCK_CONTENT,
            ...blockContent
        }
    }

    async getVirtualBlockchainState(request: GetVirtualBlockchainStateAbciRequest): Promise<VirtualBlockchainStateAbciResponse> {
        const virtualBlockchainId: Uint8Array = request.virtualBlockchainId;
        const cachedDb = this.provider.getCachedDatabase();
        const stateData = await cachedDb.getSerializedVirtualBlockchainState(virtualBlockchainId);
        if (!stateData) {
            throw new Error(`Virtual blockchain with id ${Utils.binaryToHexa(virtualBlockchainId)} not found`);
        }
        return {
            responseType: AbciResponseType.VIRTUAL_BLOCKCHAIN_STATE,
            serializedVirtualBlockchainState: stateData,
        }
    }

    async getVirtualBlockchainUpdate(request: GetVirtualBlockchainUpdateAbciRequest): Promise<VirtualBlockchainUpdateAbciResponse> {
        const knownHeight = request.knownHeight;
        const virtualBlockchainId: Uint8Array = request.virtualBlockchainId;
        const db = this.provider.getCachedDatabase();
        const vbStatus = await this.provider.getVirtualBlockchainStatus(
            virtualBlockchainId
        );

        // return empty response if virtual blockchain does not exists
        const exists = vbStatus instanceof Uint8Array;
        if (!exists) {
            return {
                responseType: AbciResponseType.VIRTUAL_BLOCKCHAIN_UPDATE,
                exists: false,
                changed: false,
                serializedVirtualBlockchainState: Utils.getNullHash(),
                serializedHeaders: [],
            }
        }

        // search missing headers
        const vbState = vbStatus.state;
        const vbHashes = vbStatus.microblockHashes;
        const changed = vbStatus.state.height !== knownHeight;
        const headers: Uint8Array[] = []
        for (let currentHeight = knownHeight + 1; currentHeight <= vbState.height; currentHeight++ ) {
            const microblockHash = vbHashes[currentHeight];
            const header = await this.provider.getMicroblockHeader(
                Hash.from(microblockHash)
            );
            headers.push(BlockchainUtils.encodeMicroblockHeader(header));
        }

        return  {
            responseType: AbciResponseType.VIRTUAL_BLOCKCHAIN_UPDATE,
            exists,
            changed,
            serializedVirtualBlockchainState: BlockchainUtils.encodeVirtualBlockchainState(vbState),
            serializedHeaders: headers,
        };

    }

    async getMicroblockInformation(request: GetMicroblockInformationAbciRequest): Promise<MicroblockInformationAbciResponse> {
        const microblockHash: Uint8Array = request.hash;
        const cachedDb = this.provider.getCachedDatabase();
        const microblockInfo = await cachedDb.getMicroblockInformation(microblockHash);
        return {
            responseType: AbciResponseType.MICROBLOCK_INFORMATION,
            ...microblockInfo
        }
    }

    async awaitMicroblockAnchoring(request: AwaitMicroblockAnchoringAbciRequest): Promise<MicroblockAnchoringAbciResponse> {
        let remaingingAttempts = 120;
        const db = this.provider.getCachedDatabase();

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
        const history = await this.accountManager.loadHistory(
            request.accountHash,
            request.lastHistoryHash,
            request.maxRecords,
        );

        return {
            responseType: AbciResponseType.ACCOUNT_HISTORY,
            list: history.list
        }


        //return this.messageSerializer.serialize(SCHEMAS.MSG_ACCOUNT_HISTORY, history);
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
        const validatorNodeHash = dataObject.validatorNodeHash;
        return {
            responseType: AbciResponseType.VALIDATOR_NODE_BY_ADDRESS,
            validatorNodeHash
        }
    }

    async getObjectList(request: GetObjectListAbciRequest): Promise<ObjectListAbciResponse> {
        const requestedObjectType = request.type;
        this.logger.debug(`Request a list of objects of type ${requestedObjectType}`);
        const indexTableId = LevelDb.getTableIdFromVirtualBlockchainType(requestedObjectType);
        if (indexTableId == -1) {
            throw new Error(`Invalid object type ${requestedObjectType}`);
        }

        const list = await this.db.getKeys(indexTableId);
        this.logger.debug(`Returning ${list.length} elements`);
        return {
            responseType: AbciResponseType.OBJECT_LIST,
            list: list
        }
        //return this.messageSerializer.serialize(SCHEMAS.MSG_OBJECT_LIST, { list });
    }

    async getMicroblockBodys(request: GetMicroblockBodysAbciRequest): Promise<MicroblockBodysAbciResponse> {
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
