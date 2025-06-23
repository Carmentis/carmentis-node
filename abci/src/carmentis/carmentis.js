// @ts-nocheck
import * as sdk from "./sdk.js";
import { NODE_SCHEMAS } from "./constants/constants.js";
import { AccountManager } from "./accountManager.js";
import { LevelDb } from "./levelDb.js";

const { CHAIN, ECO, SCHEMAS, SECTIONS } = sdk.constants;
const { Base64 } = sdk.base64;
const { RadixTree } = sdk.radixTree;
const { Crypto } = sdk.crypto;
const { Utils } = sdk.utils;
const { Blockchain } = sdk.blockchain;
const { MemoryProvider } = sdk.memoryProvider;
const { NullNetworkProvider } = sdk.nullNetworkProvider;
const { Provider } = sdk.provider;
const { MessageSerializer, MessageUnserializer } = sdk.messageSerializer;

class NodeCore {
  constructor(options) {
    this.db = new LevelDb(options.dbPath, NODE_SCHEMAS.DB);

    const provider = new Provider(new MemoryProvider(), new NullNetworkProvider());

    this.blockchain = new Blockchain(provider);
    this.messageUnserializer = new MessageUnserializer(SCHEMAS.NODE_MESSAGES);
    this.messageSerializer = new MessageSerializer(SCHEMAS.NODE_MESSAGES);
    this.sectionCallbacks = new Map;
    this.accountManager = new AccountManager(this.db);
    this.db.initialize();
    this.vbRadix = new RadixTree(this.db, NODE_SCHEMAS.DB_VB_RADIX);
    this.tokenRadix = new RadixTree(this.db, NODE_SCHEMAS.DB_TOKEN_RADIX);

    this.registerSectionCallbacks(
      CHAIN.ACCOUNT,
      [
        [ SECTIONS.ACCOUNT_TOKEN_ISSUANCE, this.accountTokenIssuanceCallback ],
        [ SECTIONS.ACCOUNT_CREATION, this.accountCreationCallback ],
        [ SECTIONS.ACCOUNT_TRANSFER, this.accountTokenTransferCallback ]
      ]
    );
  }

  registerSectionCallbacks(objectType, callbackList) {
    for(const [ sectionType, callback ] of callbackList) {
      const key = sectionType << 4 | objectType;
      this.sectionCallbacks.set(key, callback.bind(this));
    }
  }

  async invokeSectionCallback(vbType, sectionType, context) {
    const key = sectionType << 4 | vbType;

    if(this.sectionCallbacks.has(key)) {
      const callback = this.sectionCallbacks.get(key);
      await callback(context);
    }
  }

  /**
    Incoming transaction
  */
  async checkTx(request) {
    console.log(`checkTx`);

    const importer = this.blockchain.getMicroblockImporter(request.tx);
    const success = await this.checkMicroblock(importer, false);

    return {
      success,
      error: importer.error
    };
  }

  /**
    Executed by the proposer
    request.txs
  */
  async prepareProposal(request) {
    console.log(`prepareProposal`);
    const proposedTxs = [];

    for(const tx of request.txs) {
      proposedTxs.push(tx);
    }

    return proposedTxs;
  }

  /**
    Executed by all validators
    request.txs
    request.proposed_last_commit
    answer:
      UNKNOWN = 0; // Unknown status. Returning this from the application is always an error.
      ACCEPT  = 1; // Status that signals that the application finds the proposal valid.
      REJECT  = 2; // Status that signals that the application finds the proposal invalid.
  */
  async processProposal(request) {
    console.log(`processProposal`);
    return 1;
  }

  async extendVote(request) {
  }

  async verifyVoteExtension(request) {
  }

  async finalizeBlock(request) {
    const txResults = [];

    for(const tx of request.txs) {
      const importer = this.blockchain.getMicroblockImporter(tx);
      const success = await this.checkMicroblock(importer, true);

      await importer.store();

      txResults.push({
        code: 0,
        data: new Uint8Array(),
        log: "",
        info: "",
        gasWanted: 0,
        gasUsed: 0,
        events: [],
        codespace: "app"
      });
    }

    const appHash = new Uint8Array(32);

    return {
      txResults,
      appHash
    };
  }

  async commit() {
    // commit changes to DB
  }

  /**
    Checks a microblock and invokes the section callbacks of the node.
  */
  async checkMicroblock(importer, apply) {
    console.log(`Checking microblock ${Utils.binaryToHexa(importer.hash)}`);

    const status = await importer.check();

    if(status) {
      console.error(`Rejected with status ${status}: ${importer.error}`);
      return false;
    }

    for(const section of importer.vb.currentMicroblock.sections) {
      const context = {
        vb: importer.vb,
        mb: importer.vb.currentMicroblock,
        section,
        timestamp: importer.currentTimestamp,
        apply
      };
      await this.invokeSectionCallback(importer.vb.type, section.type, context);
    }

    console.log(`Accepted`);
    return true;
  }

  /**
    Account callbacks
  */
  async accountTokenIssuanceCallback(context) {
    const keyMicroblock = await context.vb.getMicroblock(context.vb.state.publicKeyHeight);
    const rawPublicKey = keyMicroblock.getSection((section) => section.type == SECTIONS.ACCOUNT_PUBLIC_KEY).object.publicKey;
    await this.accountManager.testPublicKeyAvailability(rawPublicKey);

    await this.accountManager.tokenTransfer(
      {
        type        : ECO.BK_SENT_ISSUANCE,
        payerAccount: null,
        payeeAccount: context.vb.identifier,
        amount      : context.section.object.amount
      },
      {
        mbHash: context.mb.hash,
        sectionIndex: context.section.index
      },
      context.timestamp
    );
  }

  async accountCreationCallback(context) {
    const keyMicroblock = await context.vb.getMicroblock(context.vb.state.publicKeyHeight);
    const rawPublicKey = keyMicroblock.getSection((section) => section.type == SECTIONS.ACCOUNT_PUBLIC_KEY).object.publicKey;
    await this.accountManager.testPublicKeyAvailability(rawPublicKey);

    await this.accountManager.tokenTransfer(
      {
        type        : ECO.BK_SALE,
        payerAccount: context.section.object.sellerAccount,
        payeeAccount: context.vb.identifier,
        amount      : context.section.object.amount
      },
      {
        mbHash: context.mb.hash,
        sectionIndex: context.section.index
      },
      context.timestamp,
      context.apply
    );

//  if(apply) {
//    await this.accountManager.saveAccountByPublicKey(context.vb.id, object.buyerPublicKey);
//  }
  }

  async accountTokenTransferCallback(context) {
    await this.accountManager.tokenTransfer(
      {
        type        : ECO.BK_SENT_PAYMENT,
        payerAccount: context.vb.identifier,
        payeeAccount: context.section.object.account,
        amount      : context.section.object.amount
      },
      {
        mbHash: context.mb.hash,
        sectionIndex: context.section.index
      },
      context.timestamp,
      context.apply
    );
  }

  /**
    Custom Carmentis query via abci_query
  */
  async query(data) {
    const { type, object } = this.messageUnserializer.unserialize(data);

    console.log(`Received query ${SCHEMAS.NODE_MESSAGE_NAMES[type]}`);

    switch(type) {
      case SCHEMAS.MSG_GET_VIRTUAL_BLOCKCHAIN_UPDATE: { return await this.getVirtualBlockchainUpdate(object); }
      case SCHEMAS.MSG_GET_MICROBLOCK_INFORMATION: { return await this.getMicroblockInformation(object); }
      case SCHEMAS.MSG_GET_MICROBLOCK_BODYS: { return await this.getMicroblockBodys(object); }
    }
  }

  async getVirtualBlockchainUpdate(object) {
    let stateData = await this.blockchain.provider.getVirtualBlockchainStateInternal(object.virtualBlockchainId);
    const exists = !!stateData;
    const headers = exists ? await this.blockchain.provider.getVirtualBlockchainHeaders(object.virtualBlockchainId, object.knownHeight) : [];
    const changed = headers.length > 0;

    stateData = stateData || new Uint8Array();

    return this.messageSerializer.serialize(
      SCHEMAS.MSG_VIRTUAL_BLOCKCHAIN_UPDATE,
      {
        exists,
        changed,
        stateData,
        headers
      }
    );
  }

  async getMicroblockInformation(object) {
    const microblockInfo = await this.blockchain.provider.getMicroblockInformation(object.hash);

    return this.messageSerializer.serialize(
      SCHEMAS.MSG_MICROBLOCK_INFORMATION,
      microblockInfo
    );
  }

  async getMicroblockBodys(object) {
    const bodys = await this.blockchain.provider.getMicroblockBodys(object.hashes);

    return this.messageSerializer.serialize(
      SCHEMAS.MSG_MICROBLOCK_BODYS,
      {
        list: bodys
      }
    );
  }

  /**
    Static helper functions
  */
  static decodeQueryField(urlObject, fieldName) {
    const hexa = urlObject.searchParams.get(fieldName);
    const data = Utils.binaryFromHexa(hexa.slice(2));
    return data;
  }

  static encodeResponse(response) {
    return JSON.stringify({
      data: Base64.encodeBinary(response)
    });
  }
}
