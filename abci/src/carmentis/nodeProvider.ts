import { NODE_SCHEMAS } from './constants/constants';
import { SCHEMAS } from '@cmts-dev/carmentis-sdk/server';

export class NodeProvider {
    db: any;

    constructor(db: any) {
        this.db = db;
    }

    async getMicroblockInformation(hash: Uint8Array): Promise<Uint8Array> {
        return await this.get(NODE_SCHEMAS.DB_MICROBLOCK_INFORMATION, hash);
    }

    async getMicroblockBody(identifier: Uint8Array) {
        const microblockData = await this.getMicroblock(identifier);
        return microblockData.slice(SCHEMAS.MICROBLOCK_HEADER_SIZE);
    }

    async getMicroblock(identifier: Uint8Array) {
        // must be called from child class
        return new Uint8Array();
    }

    async getMicroblockTxHash(identifier: Uint8Array) {
        return await this.get(NODE_SCHEMAS.DB_MICROBLOCK_TX_HASH, identifier);
    }

    async getVirtualBlockchainState(identifier: Uint8Array) {
        return await this.get(NODE_SCHEMAS.DB_VIRTUAL_BLOCKCHAIN_STATE, identifier);
    }

    async getAccountByPublicKeyHash(publicKeyHash: Uint8Array) {
        return await this.get(NODE_SCHEMAS.DB_ACCOUNT_BY_PUBLIC_KEY, publicKeyHash);
    }

    async setMicroblockInformation(identifier: Uint8Array, data: Uint8Array) {
        return await this.set(NODE_SCHEMAS.DB_MICROBLOCK_INFORMATION, identifier, data);
    }

    async setMicroblockBody(identifier: Uint8Array, data: Uint8Array) {
        // the node does not store the body
    }

    async setMicroblock(identifier: Uint8Array, headerData: Uint8Array, bodyData: Uint8Array) {
        // must be called from child class
    }

    async setMicroblockTxHash(identifier: Uint8Array, txHash: Uint8Array) {
        return await this.set(NODE_SCHEMAS.DB_MICROBLOCK_TX_HASH, identifier, txHash);
    }

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
