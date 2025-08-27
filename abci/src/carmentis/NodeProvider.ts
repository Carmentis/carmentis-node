import { NODE_SCHEMAS } from './constants/constants';
import { DbInterface } from './database/DbInterface';
import { Storage } from './Storage';

export class NodeProvider {
    db: DbInterface;
    storage: Storage;

    constructor(db: DbInterface, storage: Storage) {
        this.db = db;
        this.storage = storage;
    }

    async getMicroblockVbInformation(hash: Uint8Array): Promise<Uint8Array> {
        return await this.get(NODE_SCHEMAS.DB_MICROBLOCK_VB_INFORMATION, hash);
    }

    async getMicroblockHeader(identifier: Uint8Array) {
        return await this.storage.readMicroblockHeader(identifier);
    }

    async getMicroblockBody(identifier: Uint8Array) {
        return await this.storage.readMicroblockBody(identifier);
    }

    async getMicroblock(identifier: Uint8Array) {
        return await this.storage.readFullMicroblock(identifier);
    }

    async getVirtualBlockchainState(identifier: Uint8Array) {
        return await this.get(NODE_SCHEMAS.DB_VIRTUAL_BLOCKCHAIN_STATE, identifier);
    }

    async getAccountByPublicKeyHash(publicKeyHash: Uint8Array) {
        return await this.get(NODE_SCHEMAS.DB_ACCOUNT_BY_PUBLIC_KEY, publicKeyHash);
    }

    async setMicroblockVbInformation(identifier: Uint8Array, data: Uint8Array) {
        return await this.set(NODE_SCHEMAS.DB_MICROBLOCK_VB_INFORMATION, identifier, data);
    }

    async setMicroblockHeader(identifier: Uint8Array, data: Uint8Array) {
        // ignored
    }

    async setMicroblockBody(identifier: Uint8Array, data: Uint8Array) {
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
        return await this.set(NODE_SCHEMAS.DB_VIRTUAL_BLOCKCHAIN_STATE, identifier, data);
    }

    async get(tableId: number, identifier: Uint8Array) {
        const data = await this.db.getRaw(tableId, identifier);
        return data;
    }

    async set(tableId: number, identifier: Uint8Array, data: Uint8Array) {
        return await this.db.putRaw(tableId, identifier, data);
    }
}
