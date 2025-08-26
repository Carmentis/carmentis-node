import { NODE_SCHEMAS } from './constants/constants';
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
    Account,
    AccountVb,
    Secp256k1PrivateSignatureKey,
    KeyedProvider,
    Microblock,
    PrivateSignatureKey,
    IllegalParameterError,
    EncoderFactory,
} from '@cmts-dev/carmentis-sdk/server';
import { Logger } from '@nestjs/common';
import { SectionCallback } from './types/SectionCallback';
import { QueryCallback } from './types/QueryCallback';
import { LevelDb } from './levelDb';
import { AccountManager } from './accountManager';
import { GenesisSnapshotStorageService } from './genesis-snapshot-storage.service';

export class ABCIQueryHandler {
    private logger: Logger;

    queryCallbacks: Map<number, QueryCallback>;

    messageSerializer: MessageSerializer;
    messageUnserializer: MessageUnserializer;

    constructor(
        private readonly blockchain: Blockchain,
        private readonly db: LevelDb,
        private readonly accountManager: AccountManager,
        private readonly genesisSnapshotHandler: GenesisSnapshotStorageService,
    ) {
        this.logger = new Logger(ABCIQueryHandler.name);

        this.messageUnserializer = new MessageUnserializer(SCHEMAS.NODE_MESSAGES);
        this.messageSerializer = new MessageSerializer(SCHEMAS.NODE_MESSAGES);
        this.queryCallbacks = new Map();

        this.registerQueryCallback(SCHEMAS.MSG_GET_CHAIN_INFORMATION, this.getChainInformation);
        this.registerQueryCallback(SCHEMAS.MSG_GET_BLOCK_INFORMATION, this.getBlockInformation);
        this.registerQueryCallback(SCHEMAS.MSG_GET_BLOCK_CONTENT, this.getBlockContent);
        this.registerQueryCallback(
            SCHEMAS.MSG_GET_VIRTUAL_BLOCKCHAIN_STATE,
            this.getVirtualBlockchainState,
        );
        this.registerQueryCallback(
            SCHEMAS.MSG_GET_VIRTUAL_BLOCKCHAIN_UPDATE,
            this.getVirtualBlockchainUpdate,
        );
        this.registerQueryCallback(
            SCHEMAS.MSG_GET_MICROBLOCK_INFORMATION,
            this.getMicroblockInformation,
        );
        this.registerQueryCallback(
            SCHEMAS.MSG_AWAIT_MICROBLOCK_ANCHORING,
            this.awaitMicroblockAnchoring,
        );
        this.registerQueryCallback(SCHEMAS.MSG_GET_MICROBLOCK_BODYS, this.getMicroblockBodys);
        this.registerQueryCallback(SCHEMAS.MSG_GET_ACCOUNT_STATE, this.getAccountState);
        this.registerQueryCallback(SCHEMAS.MSG_GET_ACCOUNT_HISTORY, this.getAccountHistory);
        this.registerQueryCallback(
            SCHEMAS.MSG_GET_ACCOUNT_BY_PUBLIC_KEY_HASH,
            this.getAccountByPublicKeyHash,
        );
        this.registerQueryCallback(
            SCHEMAS.MSG_GET_VALIDATOR_NODE_BY_ADDRESS,
            this.getValidatorNodeByAddress,
        );
        this.registerQueryCallback(SCHEMAS.MSG_GET_OBJECT_LIST, this.getObjectList);
        this.registerQueryCallback(SCHEMAS.MSG_GET_GENESIS_SNAPSHOT, this.getGenesisSnapshot);
    }

    handleQuery(type: number, object: object) {
        const queryCallback = this.queryCallbacks.get(type);

        if (!queryCallback) {
            throw new Error(`unsupported query type`);
        }

        return queryCallback(object);
    }

    registerQueryCallback(messageId: any, callback: QueryCallback) {
        this.queryCallbacks.set(messageId, callback.bind(this));
    }

    async getGenesisSnapshot(object: any) {
        const snapshot = await this.genesisSnapshotHandler.readGenesisSnapshotFromDisk();
        return this.messageSerializer.serialize(SCHEMAS.MSG_GENESIS_SNAPSHOT, snapshot);
    }

    async getChainInformation(object: any) {
        this.logger.verbose(`getChainInformation`);
        const dataObject = await this.db.getObject(
            NODE_SCHEMAS.DB_CHAIN_INFORMATION,
            NODE_SCHEMAS.DB_CHAIN_INFORMATION_KEY,
        );

        return this.messageSerializer.serialize(SCHEMAS.MSG_CHAIN_INFORMATION, dataObject);
    }

    async getBlockInformation(object: any) {
        this.logger.verbose(`getBlockInformation`);
        const dataObject = await this.db.getObject(
            NODE_SCHEMAS.DB_BLOCK_INFORMATION,
            this.heightToTableKey(object.height),
        );

        return this.messageSerializer.serialize(SCHEMAS.MSG_BLOCK_INFORMATION, dataObject);
    }

    async getBlockContent(object: any) {
        this.logger.verbose(`getBlockContent`);
        const dataObject = await this.db.getObject(
            NODE_SCHEMAS.DB_BLOCK_CONTENT,
            this.heightToTableKey(object.height),
        );

        return this.messageSerializer.serialize(SCHEMAS.MSG_BLOCK_CONTENT, dataObject);
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
            accountHash,
        });
    }

    async getValidatorNodeByAddress(object: any) {
        const dataObject = await this.db.getObject(
            NODE_SCHEMAS.DB_VALIDATOR_NODE_BY_ADDRESS,
            object.address,
        );

        // @ts-expect-error The validator hash should be verified
        const validatorNodeHash = dataObject.validatorNodeHash;
        return this.messageSerializer.serialize(SCHEMAS.MSG_VALIDATOR_NODE_BY_ADDRESS, {
            validatorNodeHash,
        });
    }

    async getObjectList(object: any) {
        const indexTableId = LevelDb.getTableIdFromVirtualBlockchainType(object.type);

        if (indexTableId == -1) {
            throw new Error(`invalid object type ${object.type}`);
        }

        const list = await this.db.getKeys(indexTableId);

        return this.messageSerializer.serialize(SCHEMAS.MSG_OBJECT_LIST, { list });
    }

    async getMicroblockBodys(object: any) {
        const list = await this.blockchain.provider.getMicroblockBodys(object.hashes);

        return this.messageSerializer.serialize(SCHEMAS.MSG_MICROBLOCK_BODYS, {
            list,
        });
    }

    private heightToTableKey(height: number) {
        return LevelDb.convertHeightToTableKey(height);
    }
}
