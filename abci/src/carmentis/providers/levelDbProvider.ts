import {NODE_SCHEMAS} from "../constants/constants";
import {Utils} from '@cmts-dev/carmentis-sdk/server';

export class LevelDbProvider {
  db: any;
  microblockBodyStore: any;

  constructor(db: any) {
    this.db = db;
    // NB: a microblock body must be retrieved from Comet
    // this Map is for the dev node only
    this.microblockBodyStore = new Map;
  }

  async getMicroblockInformation(hash: Uint8Array): Promise<Uint8Array> {
    return await this.get(NODE_SCHEMAS.DB_MICROBLOCK_INFORMATION, hash);
  }

  async getMicroblockBody(identifier: Uint8Array) {
    const key = Utils.binaryToHexa(identifier);

    if(!this.microblockBodyStore.has(key)) {
      return null;
    }
    return this.microblockBodyStore.get(key);
  }

  async getVirtualBlockchainState(identifier: Uint8Array) {
    return await this.get(NODE_SCHEMAS.DB_VIRTUAL_BLOCKCHAIN_STATE, identifier);
  }

  async setMicroblockInformation(identifier: Uint8Array, data: Uint8Array) {
    return await this.set(NODE_SCHEMAS.DB_MICROBLOCK_INFORMATION, identifier, data);
  }

  async setMicroblockBody(identifier: Uint8Array, data: Uint8Array) {
    const key = Utils.binaryToHexa(identifier);

    this.microblockBodyStore.set(key, data);
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
