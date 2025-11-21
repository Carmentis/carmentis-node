import { NODE_SCHEMAS } from './constants/constants';
import { DbInterface } from './database/DbInterface';
import { Storage } from './Storage';
import {getLogger} from "@logtape/logtape";
import { Utils } from '@cmts-dev/carmentis-sdk/server';

export class NodeProvider {
    db: DbInterface;
    storage: Storage;
    private logger = getLogger(["node", 'provider', NodeProvider.name]);

    constructor(db: DbInterface, storage: Storage) {
        this.db = db;
        this.storage = storage;
    }

    async getMicroblockVbInformation(hash: Uint8Array): Promise<Uint8Array> {
        const data = await this.get(NODE_SCHEMAS.DB_MICROBLOCK_VB_INFORMATION, hash);
        this.logger.debug(`Reading microblock vb information for {identifier}: {readDataLength} bytes`, () => ({
            identifier: Utils.binaryToHexa(hash),
            readDataLength: data.length
        }));
        return data;
    }

    async getMicroblockHeader(identifier: Uint8Array) {
        const data = await this.storage.readMicroblockHeader(identifier);
        this.logger.debug(`Reading microblock header for {identifier}: {readDataLength} bytes`, () => ({
            identifier: Utils.binaryToHexa(identifier),
            readDataLength: data.length
        }));
        return data;
    }

    async getMicroblockBody(identifier: Uint8Array) {
        const data = await this.storage.readMicroblockBody(identifier);
        this.logger.debug(`Reading microblock body for {identifier}: {readDataLength} bytes`, () => ({
            identifier: Utils.binaryToHexa(identifier),
            readDataLength: data.length
        }));
        return data;
    }

    async getMicroblock(identifier: Uint8Array) {
        const mb = await this.storage.readFullMicroblock(identifier);
        this.logger.debug(`Reading microblock for {identifier}: {readDataLength} bytes`, () => ({
            identifier: Utils.binaryToHexa(identifier),
            readDataLength: mb.length
        }));
        return mb;
    }

    async getVirtualBlockchainState(identifier: Uint8Array) {
        this.logger.debug(`Reading virtual blockchain state for ${Utils.binaryToHexa(identifier)}`);
        return await this.get(NODE_SCHEMAS.DB_VIRTUAL_BLOCKCHAIN_STATE, identifier);
    }

    async getAccountByPublicKeyHash(publicKeyHash: Uint8Array) {
        this.logger.debug(`Getting account by public key {publicKeyHash}`, () => ({
            publicKeyHash,
        }));
        return await this.get(NODE_SCHEMAS.DB_ACCOUNT_BY_PUBLIC_KEY, publicKeyHash);
    }

    async setMicroblockVbInformation(identifier: Uint8Array, data: Uint8Array) {
        console.trace()
        this.logger.debug(`Setting microblock VB information for {identifier}: {dataLength} bytes`, () => ({
            identifier: Utils.binaryToHexa(identifier),
            dataLength: data.length,
        }));
        return await this.set(NODE_SCHEMAS.DB_MICROBLOCK_VB_INFORMATION, identifier, data);
    }

    async setMicroblockHeader(identifier: Uint8Array, data: Uint8Array) {
        this.logger.debug(`Setting microblock header for {identifier}: {dataLength} bytes`, () => ({
            identifier: Utils.binaryToHexa(identifier),
            dataLength: data.length,
        }));
        // ignored
    }

    async setMicroblockBody(identifier: Uint8Array, data: Uint8Array) {
        this.logger.debug(`Setting microblock body for {identifier}: {dataLength} bytes`, () => ({
            identifier: Utils.binaryToHexa(identifier),
            dataLength: data.length,
        }));
        // ignored
    }

    /*
    async setMicroblock(
        identifier: Uint8Array,
        expirationDay: number,
        headerData: Uint8Array,
        bodyData: Uint8Array,
    ) {
        const data = Utils.binaryFrom(headerData, bodyData);
        const fileOffset = await this.storage.writeMicroblock(expirationDay, data);
        return await this.db.putObject(NODE_SCHEMAS.DB_MICROBLOCK_STORAGE, identifier, {
            expirationDay,
            fileOffset,
        });
    }
     */

    async setVirtualBlockchainState(identifier: Uint8Array, data: Uint8Array) {
        this.logger.debug(`Setting vb state for {identifier}: {dataLength}`, () => ({
            identifier: Utils.binaryToHexa(identifier),
            dataLength: data.length,
        }));
        return await this.set(NODE_SCHEMAS.DB_VIRTUAL_BLOCKCHAIN_STATE, identifier, data);
    }

    async get(tableId: number, identifier: Uint8Array) {
        this.logger.debug(`Getting data from table ${tableId} for ${Utils.binaryToHexa(identifier)}`);
        const data = await this.db.getRaw(tableId, identifier);
        return data;
    }

    async set(tableId: number, identifier: Uint8Array, data: Uint8Array) {
        this.logger.debug(`Setting data in table ${tableId} for ${Utils.binaryToHexa(identifier)}`);
        return await this.db.putRaw(tableId, identifier, data);
    }
}
