import * as sdk from "./index.mjs";
import { NODE_SCHEMAS } from "./constants/constants.js";

const { DATA, ECO } = sdk.constants;
const { SchemaSerializer } = sdk.schemaSerializer;
const { Crypto } = sdk.crypto;
const { Utils } = sdk.utils;
//import { accountError } from "../errors/error.js";

export class AccountManager {
  constructor(db) {
    this.db = db;
  }

  async tokenTransfer(transfer, chainReference, timestamp, apply) {
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
//      throw new accountError(ERRORS.ACCOUNT_INSUFFICIENT_FUNDS, transfer.payerAccount);
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
//        throw new accountError(ERRORS.ACCOUNT_ALREADY_EXISTS, transfer.payeeAccount);
          throw `account already exists`;
        }
      }
      else {
        if(payeeState.height == 0) {
//        throw new accountError(ERRORS.ACCOUNT_INVALID_PAYEE, transfer.payeeAccount);
          throw `invalid payee`;
        }
      }

      payeeBalance = payeeState.balance;
    }

    console.log("transfer", transfer.type, transfer.payerAccount, transfer.payeeAccount, transfer.amount, chainReference, timestamp);

    if(apply) {
      if(payerBalance !== null) {
        await this.update(transfer.type, transfer.payerAccount, transfer.payeeAccount, transfer.amount, chainReference, timestamp);
      }

      if(payeeBalance !== null) {
        await this.update(transfer.type ^ 1, transfer.payeeAccount, transfer.payerAccount, transfer.amount, chainReference, timestamp);
      }
    }
  }

  async loadState(accountHash) {
    const state = await this.db.getObject(NODE_SCHEMAS.DB_ACCOUNT_STATE, accountHash);

    return state || {
      height: 0,
      balance: 0,
      lastHistoryHash: Utils.getNullHash()
    };
  }

  async update(type, accountHash, linkedAccountHash, amount, chainReference, timestamp) {
console.log("update()", type, accountHash, linkedAccountHash, amount, chainReference, timestamp);
    const state = await this.loadState(accountHash);

    state.height++;
    state.balance += type & ECO.BK_PLUS ? amount : -amount;
    state.lastHistoryHash = Utils.binaryFromHexa(await this.addHistoryEntry(state, type, accountHash, linkedAccountHash, amount, chainReference, timestamp));

console.log("update() state =", state);

    await this.db.putObject(
      NODE_SCHEMAS.DB_ACCOUNT_STATE,
      accountHash,
      state
    );
  }

  async loadHistory(accountHash, lastHistoryHash, maxRecords) {
    const historyHash = lastHistoryHash;
    const list = [];

    while(maxRecords-- && !Utils.binaryIsEqual(historyHash, Utils.getNullHash())) {
      const entry = await this.loadHistoryEntry(accountHash, historyHash);

      list.push(entry)
      historyHash = entry.previousHistoryHash;
    }

    return { list };
  }

  async loadHistoryEntry(accountHash, historyHash) {
    const entry = await this.db.getObject(NODE_SCHEMAS.DB_ACCOUNT_HISTORY, historyHash);

    if(!entry) {
      throw `Internal error: account history entry not found`;
    }

    return entry
  }

  async addHistoryEntry(state, type, accountHash, linkedAccountHash, amount, chainReference, timestamp) {
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
    const hash = this.getHistoryEntryHash(Utils.binaryFromHexa(accountHash), Crypto.Hashes.sha256AsBinary(record));

    await this.db.putRaw(
      NODE_SCHEMAS.DB_ACCOUNT_HISTORY,
      hash,
      record
    );

    return hash;
  }

  getHistoryEntryHash(accountHash, recordHash) {
    return Crypto.Hashes.sha256(Utils.binaryFrom(accountHash, recordHash));
  }

  async testPublicKeyAvailability(publicKey) {
    const keyHash = Crypto.Hashes.sha256(Utils.binaryFromHexa(publicKey));

    const accountHash = await this.db.getRaw(
      NODE_SCHEMAS.DB_ACCOUNT_BY_PUBLIC_KEY,
      keyHash
    );

    if(accountHash) {
//    throw new accountError(ERRORS.ACCOUNT_KEY_ALREADY_IN_USE, publicKey);
      throw `key already in use`;
    }
  }

  async saveAccountByPublicKey(accountHash, publicKey) {
    const keyHash = Crypto.Hashes.sha256(Utils.binaryFromHexa(publicKey));

    await this.db.putRaw(
      NODE_SCHEMAS.DB_ACCOUNT_BY_PUBLIC_KEY,
      keyHash,
      accountHash
    );
  }

  async loadAccountByPublicKey(publicKey) {
    const keyHash = Crypto.Hashes.sha256(Utils.binaryFromHexa(publicKey));

    const accountHash = await this.db.getRaw(
      NODE_SCHEMAS.DB_ACCOUNT_BY_PUBLIC_KEY,
      keyHash
    );

    if(!accountHash) {
//    throw new accountError(ERRORS.ACCOUNT_KEY_UNKNOWN, publicKey);
      throw `unknown account key`;
    }

    return accountHash;
  }
}
