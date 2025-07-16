import {NODE_SCHEMAS} from "../constants/constants";
import {AccountManager} from "../accountManager";

export class LevelDbProvider {
  db: any;

  constructor(db: any) {
    this.db = db;
  }

  async getMicroblockInformation(hash: Uint8Array): Promise<Uint8Array> {
    return await this.get(NODE_SCHEMAS.DB_MICROBLOCK_INFORMATION, hash);
  }

  async getMicroblockBody(identifier: Uint8Array) {
    return await this.get(NODE_SCHEMAS.DB_MICROBLOCK_BODY, identifier);
  }

  async getVirtualBlockchainState(identifier: Uint8Array) {
    return await this.get(NODE_SCHEMAS.DB_VIRTUAL_BLOCKCHAIN_STATE, identifier);
  }

  async getAccountByPublicKeyHash(publicKeyHash: Uint8Array) {
    const accountManager = new AccountManager(this.db);
    return await accountManager.loadAccountByPublicKeyHash(publicKeyHash);
  }

  async setMicroblockInformation(identifier: Uint8Array, data: Uint8Array) {
    return await this.set(NODE_SCHEMAS.DB_MICROBLOCK_INFORMATION, identifier, data);
  }

  async setMicroblockBody(identifier: Uint8Array, data: Uint8Array) {
    return await this.set(NODE_SCHEMAS.DB_MICROBLOCK_BODY, identifier, data);
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
