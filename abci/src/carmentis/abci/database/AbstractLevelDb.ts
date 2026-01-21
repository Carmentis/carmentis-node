import { DbInterface, LevelQueryIteratorOptions, LevelQueryResponseType } from './DbInterface';
import { NODE_SCHEMAS } from '../constants/constants';
import {
    BlockContent,
    BlockInformation,
    ChainInformation,
    DataFile,
    Escrows,
    ValidatorNodeByAddress,
} from '../types/valibot/db/db';
import {
    AccountState,
    BlockchainUtils,
    CHAIN,
    Microblock,
    MicroblockInformation,
    Utils,
} from '@cmts-dev/carmentis-sdk/server';
import { NodeEncoder } from '../NodeEncoder';
import { LevelDb } from './LevelDb';
import { ChainInformationObject } from '../types/ChainInformationObject';
import { AccountHistoryEntry } from '../types/valibot/account/AccountHistoryEntry';
import { MicroblockStorage } from '../types/valibot/storage/MicroblockStorage';
import { ChainInformationIndex, LevelDbTable } from './LevelDbTable';
import { getLogger, Logger } from '@logtape/logtape';

export abstract class AbstractLevelDb implements DbInterface {
    abstract getRaw(tableId: number, key: Uint8Array): Promise<Uint8Array | undefined>;
    abstract putRaw(tableId: number, key: Uint8Array, data: Uint8Array): Promise<boolean>;
    abstract getKeys(tableId: number): Promise<Uint8Array[]>;
    abstract query(
        tableId: number,
        query?: LevelQueryIteratorOptions,
    ): Promise<LevelQueryResponseType>;
    abstract getFullTable(tableId: number): Promise<Uint8Array[][]>;
    abstract del(tableId: number, key: Uint8Array): Promise<boolean>;

    constructor(protected logger: Logger) {
    }

    public static getTableName(tableId: number) {
        const entry = Object.entries(LevelDbTable).find(([ name, id ]) => id == tableId);
        return entry ? entry[0] : '(UNKNOWN TABLE)';
    }

    async getProtocolVirtualBlockchainIdentifier() {
        const protocolTableId = LevelDb.getTableIdFromVirtualBlockchainType(CHAIN.VB_PROTOCOL);
        const protocolVirtualBlockchainIdentifiers = await this.getKeys(protocolTableId);
        const foundIdentifiersNumber = protocolVirtualBlockchainIdentifiers.length;
        // we expect at least one identifier
        if (foundIdentifiersNumber === 0) {
            this.logger.error(
                `No protocol virtual blockchain identifier found in table ${protocolTableId}`,
            );
            throw new Error(
                `No protocol virtual blockchain identifier found in table ${protocolTableId}`,
            );
        }

        // we expect no more than one identifier
        if (foundIdentifiersNumber > 1) {
            this.logger.error(
                `More than one protocol virtual blockchain identifier found in table ${protocolTableId}: ${protocolVirtualBlockchainIdentifiers}`,
            );
            throw new Error(
                `More than one protocol virtual blockchain identifier found in table ${protocolTableId}: ${protocolVirtualBlockchainIdentifiers}`,
            );
        }
        return protocolVirtualBlockchainIdentifiers[0];
    }

    async getSerializedVirtualBlockchainState(vbIdentifier: Uint8Array) {
        return this.getRaw(LevelDbTable.VIRTUAL_BLOCKCHAIN_STATE, vbIdentifier);
    }

    async setSerializedVirtualBlockchainState(identifier: Uint8Array, serializedState: Uint8Array) {
        this.logger.debug(`Setting vb state for {identifier}: {dataLength}`, () => ({
            identifier: Utils.binaryToHexa(identifier),
            dataLength: serializedState.length,
        }));
        await this.putRaw(LevelDbTable.VIRTUAL_BLOCKCHAIN_STATE, identifier, serializedState);
    }

    async getChainInformation(): Promise<ChainInformation> {
        this.logger.debug('Getting chain information');
        const serializedChainInfo = await this.getRaw(
            LevelDbTable.CHAIN_INFORMATION,
            ChainInformationIndex.CHAIN_INFORMATION_KEY,
        );
        if (serializedChainInfo) {
            return NodeEncoder.decodeChainInformation(serializedChainInfo);
        } else {
            const defaultChainInfo: ChainInformation = {
                height: 0,
                lastBlockTimestamp: 0,
                objectCounts: Array(CHAIN.N_VIRTUAL_BLOCKCHAINS).fill(0),
                microblockCount: 0,
            };
            return defaultChainInfo;
        }
    }

    async getAccountIdByPublicKeyHash(
        publicKeyBytesHash: Uint8Array,
    ): Promise<Uint8Array | undefined> {
        const serialzedAccountId = this.getRaw(
            LevelDbTable.ACCOUNT_BY_PUBLIC_KEY,
            publicKeyBytesHash,
        );
        if (serialzedAccountId === undefined) return undefined;
        return serialzedAccountId;
    }

    putAccountState(id: Uint8Array, accountState: AccountState): Promise<boolean> {
        return this.putRaw(
            LevelDbTable.ACCOUNT_STATE,
            id,
            BlockchainUtils.encodeAccountState(accountState),
        );
    }

    putAccountHistoryEntry(historyHash: Uint8Array, entry: AccountHistoryEntry): Promise<boolean> {
        return this.putRaw(
            LevelDbTable.ACCOUNT_HISTORY,
            historyHash,
            NodeEncoder.encodeAccountHistoryEntry(entry),
        );
    }

    async setMicroblockInformation(microblock: Microblock, info: MicroblockInformation) {
        this.logger.debug(
            `Setting microblock information for microblock ${microblock.getHash().encode()}`,
        );
        const hash = microblock.getHashAsBytes();
        const serializedInfo = BlockchainUtils.encodeMicroblockInformation(info);
        await this.putRaw(LevelDbTable.MICROBLOCK_VB_INFORMATION, hash, serializedInfo);
    }

    async getMicroblockInformation(
        microblockHash: Uint8Array,
    ): Promise<MicroblockInformation | undefined> {
        this.logger.debug(
            `Getting information for microblock ${Utils.binaryToHexa(microblockHash)}`,
        );
        const serializedMicroblockInformation = await this.getRaw(
            LevelDbTable.MICROBLOCK_VB_INFORMATION,
            microblockHash,
        );
        if (serializedMicroblockInformation === undefined) {
            return undefined;
        }
        return BlockchainUtils.decodeMicroblockInformation(serializedMicroblockInformation);
    }

    async containsAccountWithVestingLocks(accountId: Uint8Array): Promise<boolean> {
        const response = await this.getRaw(LevelDbTable.ACCOUNTS_WITH_VESTING_LOCKS, accountId);
        return response !== undefined;
    }

    async getEscrow(escrowIdentifier: Uint8Array): Promise<Escrows | undefined> {
        const serializedEscrows = await this.getRaw(LevelDbTable.ESCROWS, escrowIdentifier);
        return serializedEscrows === undefined
            ? undefined
            : NodeEncoder.decodeEscrows(serializedEscrows);
    }

    async putBlockInformation(blockHeight: number, info: BlockInformation) {
        return await this.putRaw(
            LevelDbTable.BLOCK_INFORMATION,
            LevelDb.convertHeightToTableKey(blockHeight),
            NodeEncoder.encodeBlockInformation(info),
        );
    }

    async putBlockContent(height: number, blockContent: BlockContent) {
        return await this.putRaw(
            LevelDbTable.BLOCK_CONTENT,
            LevelDb.convertHeightToTableKey(height),
            NodeEncoder.encodeBlockContent(blockContent),
        );
    }

    async getDataFileFromDataFileKey(
        dbFileKey: Uint8Array<ArrayBuffer>,
    ): Promise<DataFile | undefined> {
        const serializedDataFile = await this.getRaw(LevelDbTable.DATA_FILE, dbFileKey);
        if (serializedDataFile === undefined) return undefined;
        return NodeEncoder.decodeDataFile(serializedDataFile);
    }

    async putDataFile(dataFileKey: Uint8Array, dataFileObject: DataFile) {
        return await this.putRaw(
            LevelDbTable.DATA_FILE,
            dataFileKey,
            NodeEncoder.encodeDataFile(dataFileObject),
        );
    }

    async putMicroblockStorage(
        microblockHeaderHash: Uint8Array,
        microblockStorage: MicroblockStorage,
    ) {
        return await this.putRaw(
            LevelDbTable.MICROBLOCK_STORAGE,
            microblockHeaderHash,
            NodeEncoder.encodeMicroblockStorage(microblockStorage),
        );
    }

    async getMicroblockStorage(
        microblockHeaderHash: Uint8Array,
    ): Promise<MicroblockStorage | undefined> {
        const serializedMicroblockStorage = await this.getRaw(
            LevelDbTable.MICROBLOCK_STORAGE,
            microblockHeaderHash,
        );
        if (serializedMicroblockStorage === undefined) return undefined;
        return NodeEncoder.decodeMicroblockStorage(serializedMicroblockStorage);
    }

    async putChainInformation(chainInfoObject: ChainInformationObject) {
        this.logger.debug(
            `Setting chain information at height ${chainInfoObject.height}: ${chainInfoObject.microblockCount} microblocks, ${chainInfoObject.objectCounts} object created`,
        );
        const serializedChainInfo = NodeEncoder.encodeChainInformation(chainInfoObject);
        return await this.putRaw(
            LevelDbTable.CHAIN_INFORMATION,
            ChainInformationIndex.CHAIN_INFORMATION_KEY,
            serializedChainInfo,
        );
    }

    async putAccountWithVestingLocks(accountHash: Uint8Array): Promise<boolean> {
        return await this.putRaw(
            LevelDbTable.ACCOUNTS_WITH_VESTING_LOCKS,
            accountHash,
            NodeEncoder.encodeAccountsWithVestingLocks({}),
        );
    }

    async putEscrow(escrowIdentifier: Uint8Array, escrowData: Escrows): Promise<boolean> {
        return await this.putRaw(
            LevelDbTable.ESCROWS,
            escrowIdentifier,
            NodeEncoder.encodeEscrows(escrowData),
        );
    }

    async getValidatorNodeByAddress(
        nodeAddress: Uint8Array,
    ): Promise<ValidatorNodeByAddress | undefined> {
        const response = await this.getRaw(LevelDbTable.VALIDATOR_NODE_BY_ADDRESS, nodeAddress);
        if (response === undefined) return undefined;
        return NodeEncoder.decodeValidatorNodeByAddress(response);
    }

    async putValidatorNodeByAddress(nodeAddress: Uint8Array, validatorNodeHash: Uint8Array, votingPower: number): Promise<boolean> {
        if (validatorNodeHash.length != 32) {
            throw new Error(`invalid size of validatorNodeHash: ${validatorNodeHash.length} bytes (expecting 32)`);
        }
        return await this.putRaw(
            LevelDbTable.VALIDATOR_NODE_BY_ADDRESS,
            nodeAddress,
            NodeEncoder.encodeValidatorNodeByAddress({
                validatorNodeHash,
                votingPower,
            }),
        );
    }

    async getBlockInformation(height: number): Promise<BlockInformation | undefined> {
        const serializedBlockInformation = await this.getRaw(
            LevelDbTable.BLOCK_INFORMATION,
            LevelDb.convertHeightToTableKey(height),
        );
        if (serializedBlockInformation === undefined) return undefined;
        return NodeEncoder.decodeBlockInformation(serializedBlockInformation);
    }

    async getBlockContent(height: number): Promise<BlockContent | undefined> {
        const serializedBlockContent = await this.getRaw(
            LevelDbTable.BLOCK_CONTENT,
            LevelDb.convertHeightToTableKey(height),
        );
        if (serializedBlockContent === undefined) return undefined;
        return NodeEncoder.decodeBlockContent(serializedBlockContent);
    }

    async getAccountStateByAccountId(accountId: Uint8Array): Promise<AccountState | undefined> {
        const serializedAccountState = await this.getRaw(LevelDbTable.ACCOUNT_STATE, accountId);
        if (serializedAccountState === undefined) return undefined;
        return BlockchainUtils.decodeAccountState(serializedAccountState);
    }

    async getAccountHistoryEntryByHistoryHash(historyHash: Uint8Array) {
        const serializedAccountHistoryEntry = await this.getRaw(
            LevelDbTable.ACCOUNT_HISTORY,
            historyHash,
        );
        if (serializedAccountHistoryEntry === undefined) return undefined;
        return NodeEncoder.decodeAccountHistoryEntry(serializedAccountHistoryEntry);
        //return result as AccountHistoryEntry;
    }
}