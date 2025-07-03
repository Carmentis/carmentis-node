import { NODE_SCHEMAS } from "./constants/constants";
import { ECO, Utils, SchemaSerializer, SchemaUnserializer, Crypto } from '@cmts-dev/carmentis-sdk/server';

interface Transfer {
  type: number;
  payerAccount: Uint8Array|null;
  payeeAccount: Uint8Array|null;
  amount: number;
}

export class AccountManager {
  db: any;
  constructor(db: any) {
    this.db = db;
  }

  async tokenTransfer(transfer: Transfer, chainReference: any, timestamp: any) {
    const accountCreation = transfer.type == ECO.BK_SENT_ISSUANCE || transfer.type == ECO.BK_SALE;
    let payeeBalance;
    let payerBalance;

    if(transfer.payerAccount === null) {
      payerBalance = null;
    }
    else {
      const payerState = await this.loadState(transfer.payerAccount);

      payerBalance = payerState.balance;

      if(payerBalance < transfer.amount) {
        throw `insufficient funds`;
      }
    }

    if(transfer.payeeAccount === null) {
      payeeBalance = null;
    }
    else {
      const payeeState = await this.loadState(transfer.payeeAccount);

      if(accountCreation){
        if(payeeState.height != 0) {
          throw `account already exists`;
        }
      }
      else {
        if(payeeState.height == 0) {
          throw `invalid payee`;
        }
      }

      payeeBalance = payeeState.balance;
    }

    const payerAccountId = transfer.payerAccount === null ? "NULL" : Utils.truncateStringMiddle(Utils.binaryToHexa(transfer.payerAccount), 8, 4);
    const payeeAccountId = transfer.payeeAccount === null ? "NULL" : Utils.truncateStringMiddle(Utils.binaryToHexa(transfer.payeeAccount), 8, 4);

    console.log(`${transfer.amount / ECO.TOKEN} ${ECO.TOKEN_NAME} transferred from ${payerAccountId} to ${payeeAccountId} (${ECO.BK_NAMES[transfer.type]})`);

    if(payerBalance !== null) {
      await this.update(transfer.type, transfer.payerAccount, transfer.payeeAccount, transfer.amount, chainReference, timestamp);
    }

    if(payeeBalance !== null) {
      await this.update(transfer.type ^ 1, transfer.payeeAccount, transfer.payerAccount, transfer.amount, chainReference, timestamp);
    }
  }

  async loadState(accountHash: any) {
    const state = await this.db.getObject(NODE_SCHEMAS.DB_ACCOUNT_STATE, accountHash);

    return state || {
      height: 0,
      balance: 0,
      lastHistoryHash: Utils.getNullHash()
    };
  }

  async update(type: any, accountHash: any, linkedAccountHash: any, amount: any, chainReference: any, timestamp: any) {
    const state = await this.loadState(accountHash);

    state.height++;
    state.balance += type & ECO.BK_PLUS ? amount : -amount;
    state.lastHistoryHash = await this.addHistoryEntry(state, type, accountHash, linkedAccountHash, amount, chainReference, timestamp);

    await this.db.putObject(
      NODE_SCHEMAS.DB_ACCOUNT_STATE,
      accountHash,
      state
    );
  }

  async loadHistory(accountHash: any, lastHistoryHash: any, maxRecords: any) {
    let historyHash = lastHistoryHash;
    const list = [];

    while(maxRecords-- && !Utils.binaryIsEqual(historyHash, Utils.getNullHash())) {
      const entry = await this.loadHistoryEntry(accountHash, historyHash);

      list.push(entry)
      historyHash = entry.previousHistoryHash;
    }

    return { list };
  }

  async loadHistoryEntry(accountHash: any, historyHash: any) {
    const entry = await this.db.getObject(NODE_SCHEMAS.DB_ACCOUNT_HISTORY, historyHash);

    if(!entry) {
      throw `Internal error: account history entry not found`;
    }

    return entry
  }

  async addHistoryEntry(state: any, type: number, accountHash: any, linkedAccountHash: any, amount: any, chainReference: any, timestamp: any) {
    const serializer = new SchemaSerializer(NODE_SCHEMAS.ACCOUNT_REF_SCHEMAS[ECO.BK_REFERENCES[type]]);
    const chainReferenceBinary = serializer.serialize(chainReference);

    const entry = {
      height             : state.height,
      previousHistoryHash: state.lastHistoryHash,
      type               : type,
      timestamp          : timestamp,
      linkedAccount      : linkedAccountHash || Utils.getNullHash(),
      amount             : amount,
      chainReference     : chainReferenceBinary
    };

    const record = this.db.serialize(NODE_SCHEMAS.DB_ACCOUNT_HISTORY, entry);
    const hash = this.getHistoryEntryHash(accountHash, Crypto.Hashes.sha256AsBinary(record));

    await this.db.putRaw(
      NODE_SCHEMAS.DB_ACCOUNT_HISTORY,
      hash,
      record
    );

    return hash;
  }

  getHistoryEntryHash(accountHash: any, recordHash: any) {
    return Crypto.Hashes.sha256AsBinary(Utils.binaryFrom(accountHash, recordHash));
  }

  async testPublicKeyAvailability(publicKey: Uint8Array) {
    const keyHash = Crypto.Hashes.sha256AsBinary(publicKey);

    const accountHash = await this.db.getRaw(
      NODE_SCHEMAS.DB_ACCOUNT_BY_PUBLIC_KEY,
      keyHash
    );

    if(accountHash) {
      throw `public key already in use`;
    }
  }

  async saveAccountByPublicKey(accountHash: Uint8Array, publicKey: Uint8Array) {
    const keyHash = Crypto.Hashes.sha256AsBinary(publicKey);

    await this.db.putRaw(
      NODE_SCHEMAS.DB_ACCOUNT_BY_PUBLIC_KEY,
      keyHash,
      accountHash
    );
  }

  async loadAccountByPublicKeyHash(keyHash: Uint8Array) {
    const accountHash = await this.db.getRaw(
      NODE_SCHEMAS.DB_ACCOUNT_BY_PUBLIC_KEY,
      keyHash
    );

    if(!accountHash) {
      throw `unknown account key hash`;
    }

    return accountHash;
  }
}
