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
import { LevelDb } from './database/LevelDb';
import { AccountManager } from './accounts/AccountManager';
import { GenesisSnapshotStorageService } from './GenesisSnapshotStorageService';
import { GlobalState } from './state/GlobalState';
import { Logger, getLogger } from '@logtape/logtape';

export class ABCIQueryHandler {

    private static readonly MAX_HISTORY_RECORDS_LIMIT = 100;

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
        this.logger.info(`Request for chain information`);
        const chainInfo = await this.db.getChainInformation();
        return {
            responseType: AbciResponseType.CHAIN_INFORMATION,
            ...chainInfo
        }
    }

    async getBlockInformation(request: GetBlockInformationAbciRequest): Promise<BlockInformationAbciResponse> {
        const requestedBlockHeight = request.height;
        this.logger.info(`Request to get information for block ${requestedBlockHeight} `);
        const blockInformation = await this.db.getBlockInformation(requestedBlockHeight);
        if (blockInformation === undefined) throw new Error(`No information found for block ${requestedBlockHeight}`);
        return {
            responseType: AbciResponseType.BLOCK_INFORMATION,
            ...blockInformation
        }
    }

    async getBlockContent(request: GetBlockContentAbciRequest): Promise<BlockContentAbciResponse> {
        const requestedBlockHeight = request.height;
        this.logger.info(`Request to get content for block ${requestedBlockHeight}`);
        const blockContent = await this.db.getBlockContent(requestedBlockHeight);
        if (blockContent === undefined) {
            throw new Error(`No block found at height ${requestedBlockHeight}`)
        } else {
            return {
                responseType: AbciResponseType.BLOCK_CONTENT,
                ...blockContent
            }
        }

    }

    async getVirtualBlockchainState(request: GetVirtualBlockchainStateAbciRequest): Promise<VirtualBlockchainStateAbciResponse> {
        const virtualBlockchainId: Uint8Array = request.virtualBlockchainId;
        this.logger.info(`Request state for virtual blockchain ${Utils.binaryToHexa(virtualBlockchainId)}`)
        const cachedDb = this.provider.getDatabase();
        const stateData = await cachedDb.getSerializedVirtualBlockchainState(virtualBlockchainId);
        if (!stateData) {
            const errMsg = `Cannot load virtual blockchain state: Virtual blockchain with id ${Utils.binaryToHexa(virtualBlockchainId)} not found`;
            this.logger.warn(errMsg);
            throw new Error(errMsg);
        }
        this.logger.info(
            `Virtual blockchain state request for id ${Utils.binaryToHexa(virtualBlockchainId)}: done`,
        );
        return {
            responseType: AbciResponseType.VIRTUAL_BLOCKCHAIN_STATE,
            serializedVirtualBlockchainState: stateData,
        }
    }

    async getVirtualBlockchainUpdate(request: GetVirtualBlockchainUpdateAbciRequest): Promise<VirtualBlockchainUpdateAbciResponse> {
        const knownHeight = request.knownHeight;
        const virtualBlockchainId: Uint8Array = request.virtualBlockchainId;
        this.logger.info(
            `Request update for virtual blockchain ${Utils.binaryToHexa(virtualBlockchainId)}`,
        );
        const vbStatus = await this.provider.getVirtualBlockchainStatus(
            virtualBlockchainId
        );

        // return empty response if virtual blockchain does not exists
        if (vbStatus === null) {
            this.logger.warn(`Cannot load virtual blockchain update: Virtual blockchain with id ${Utils.binaryToHexa(virtualBlockchainId)} not found`);
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
            this.logger.debug(`Requesting header for height ${currentHeight}/${vbHashes.length} of virtual blockchain ${Utils.binaryToHexa(virtualBlockchainId)}`)
            const microblockHash = vbHashes[currentHeight - 1];
            const header = await this.provider.getMicroblockHeader(
                Hash.from(microblockHash)
            );
            if (!header) throw new Error('Cannot recover all the headers of the virtual blockchain.')
            this.logger.debug(
                `Found header body hash: ${Utils.binaryToHexa(header.bodyHash)}`,
            );
            headers.push(BlockchainUtils.encodeMicroblockHeader(header));
        }

        this.logger.info(
            `Virtual blockchain update request for id ${Utils.binaryToHexa(virtualBlockchainId)}: done`,
        );
        return  {
            responseType: AbciResponseType.VIRTUAL_BLOCKCHAIN_UPDATE,
            exists: true,
            changed,
            serializedVirtualBlockchainState: BlockchainUtils.encodeVirtualBlockchainState(vbState),
            serializedHeaders: headers,
        };

    }

    async getMicroblockInformation(request: GetMicroblockInformationAbciRequest): Promise<MicroblockInformationAbciResponse> {
        const microblockHash: Uint8Array = request.hash;
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
            request.accountHash,
            request.lastHistoryHash,
            maxRecords,
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
        if (dataObject === undefined) throw new Error(`Validator node with address ${Utils.binaryToHexa(request.address)} not found`);
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
