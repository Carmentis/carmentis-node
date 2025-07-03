import {NODE_SCHEMAS} from "./constants/constants";
import {AccountManager} from "./accountManager";
import {LevelDb} from "./levelDb";
import {RadixTree} from "./radixTree";
import {CachedLevelDb} from "./cachedLevelDb";
import {LevelDbProvider} from "./providers/levelDbProvider";

import {
  CheckTxRequest,
  CheckTxResponse,
  PrepareProposalRequest,
  PrepareProposalResponse,
  ProcessProposalRequest,
  ProcessProposalResponse,
  ExtendVoteRequest,
  ExtendVoteResponse,
  VerifyVoteExtensionRequest,
  VerifyVoteExtensionResponse,
  FinalizeBlockRequest,
  FinalizeBlockResponse
} from "./types";

import {
  CHAIN,
  ECO,
  SCHEMAS,
  SECTIONS,
  Base64,
  Utils,
  Blockchain,
  MemoryProvider,
  NullNetworkProvider,
  Provider,
  MessageSerializer,
  MessageUnserializer
} from '@cmts-dev/carmentis-sdk/server';

export class NodeCore {
  accountManager: AccountManager;
  blockchain: Blockchain;
  cachedBlockchain: Blockchain;
  db: LevelDb;
  cachedDb: CachedLevelDb;
  messageSerializer: MessageSerializer;
  messageUnserializer: MessageUnserializer;
  tokenRadix: RadixTree;
  vbRadix: RadixTree;
  cachedTokenRadix: RadixTree;
  cachedVbRadix: RadixTree;
  sectionCallbacks: any;
  queryCallbacks: any;

  constructor(options: any) {
    this.db = new LevelDb(options.dbPath, NODE_SCHEMAS.DB);
    this.db.initialize();
    this.cachedDb = new CachedLevelDb(this.db);

    const levelDbProvider = new LevelDbProvider(this.db);
    const provider = new Provider(levelDbProvider, new NullNetworkProvider());
    this.blockchain = new Blockchain(provider);

    const cachedLevelDbProvider = new LevelDbProvider(this.cachedDb);
    const cachedProvider = new Provider(cachedLevelDbProvider, new NullNetworkProvider());
    this.cachedBlockchain = new Blockchain(cachedProvider);

    this.messageUnserializer = new MessageUnserializer(SCHEMAS.NODE_MESSAGES);
    this.messageSerializer = new MessageSerializer(SCHEMAS.NODE_MESSAGES);
    this.sectionCallbacks = new Map;
    this.queryCallbacks = new Map;
    this.accountManager = new AccountManager(this.cachedDb);

    this.vbRadix = new RadixTree(this.db, NODE_SCHEMAS.DB_VB_RADIX);
    this.tokenRadix = new RadixTree(this.db, NODE_SCHEMAS.DB_TOKEN_RADIX);
    this.cachedVbRadix = new RadixTree(this.cachedDb, NODE_SCHEMAS.DB_VB_RADIX);
    this.cachedTokenRadix = new RadixTree(this.cachedDb, NODE_SCHEMAS.DB_TOKEN_RADIX);

    this.registerSectionCallbacks(
      CHAIN.VB_ACCOUNT,
      [
        [ SECTIONS.ACCOUNT_TOKEN_ISSUANCE, this.accountTokenIssuanceCallback ],
        [ SECTIONS.ACCOUNT_CREATION, this.accountCreationCallback ],
        [ SECTIONS.ACCOUNT_TRANSFER, this.accountTokenTransferCallback ]
      ]
    );

    this.registerQueryCallback(SCHEMAS.MSG_GET_VIRTUAL_BLOCKCHAIN_STATE, this.getVirtualBlockchainState);
    this.registerQueryCallback(SCHEMAS.MSG_GET_VIRTUAL_BLOCKCHAIN_UPDATE, this.getVirtualBlockchainUpdate);
    this.registerQueryCallback(SCHEMAS.MSG_GET_MICROBLOCK_INFORMATION, this.getMicroblockInformation);
    this.registerQueryCallback(SCHEMAS.MSG_AWAIT_MICROBLOCK_ANCHORING, this.awaitMicroblockAnchoring);
    this.registerQueryCallback(SCHEMAS.MSG_GET_MICROBLOCK_BODYS, this.getMicroblockBodys);
    this.registerQueryCallback(SCHEMAS.MSG_GET_ACCOUNT_STATE, this.getAccountState);
    this.registerQueryCallback(SCHEMAS.MSG_GET_ACCOUNT_HISTORY, this.getAccountHistory);
    this.registerQueryCallback(SCHEMAS.MSG_GET_ACCOUNT_BY_PUBLIC_KEY_HASH, this.getAccountByPublicKeyHash);
    this.registerQueryCallback(SCHEMAS.MSG_GET_OBJECT_LIST, this.getObjectList);
  }

  registerSectionCallbacks(objectType: any, callbackList: any) {
    for(const [ sectionType, callback ] of callbackList) {
      const key = sectionType << 4 | objectType;
      this.sectionCallbacks.set(key, callback.bind(this));
    }
  }

  registerQueryCallback(messageId: any, callback: any) {
    this.queryCallbacks.set(messageId, callback.bind(this));
  }

  async invokeSectionCallback(vbType: any, sectionType: any, context: any) {
    const key = sectionType << 4 | vbType;

    if(this.sectionCallbacks.has(key)) {
      const callback = this.sectionCallbacks.get(key);
      await callback(context);
    }
  }

  /**
    Incoming transaction
  */
  async checkTx(request: CheckTxRequest) {
    console.log(`checkTx`);

    const importer = this.cachedBlockchain.getMicroblockImporter(request.tx);
    const success = await this.checkMicroblock(importer);

    console.log(`Type: ${CHAIN.VB_NAME[importer.vb.type]}`);
    console.log(`Total size: ${request.tx.length} bytes`);

    const vb: any = await importer.getVirtualBlockchain();

    for(const section of vb.currentMicroblock.sections) {
      console.log(`${(SECTIONS.DEF[importer.vb.type][section.type].label + " ").padEnd(36, ".")} ${section.data.length} byte(s)`);
    }

    this.cachedDb.resetCache();

    return {
      success,
      error: importer.error
    };
  }

  /**
    Executed by the proposer
    request.txs
  */
  async prepareProposal(request: PrepareProposalRequest) {
    console.log(`prepareProposal: ${request.txs.length} txs`);
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
  async processProposal(request: ProcessProposalRequest) {
    console.log(`processProposal: ${request.txs.length} txs`);
    return 1;
  }

  async extendVote(request: ExtendVoteRequest) {
  }

  async verifyVoteExtension(request: VerifyVoteExtensionRequest) {
  }

  async finalizeBlock(request: FinalizeBlockRequest) {
    console.log(`finalizeBlock: ${request.txs.length} txs`);
    const txResults = [];

    for(const tx of request.txs) {
      const importer = this.blockchain.getMicroblockImporter(tx);
      const success = await this.checkMicroblock(importer);
      const vb: any = await importer.getVirtualBlockchain();

      console.log(`Storing microblock ${Utils.binaryToHexa(vb.currentMicroblock.hash)}`);

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
    await this.cachedDb.commit();
  }

  /**
    Checks a microblock and invokes the section callbacks of the node.
  */
  async checkMicroblock(importer: any) {
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
        timestamp: importer.currentTimestamp
      };
      await this.invokeSectionCallback(importer.vb.type, section.type, context);
    }

    switch(importer.vb.type) {
      case CHAIN.VB_ACCOUNT: { await this.cachedDb.putObject(NODE_SCHEMAS.DB_ACCOUNTS, importer.vb.identifier, {}); break; }
      case CHAIN.VB_VALIDATOR_NODE: { await this.cachedDb.putObject(NODE_SCHEMAS.DB_VALIDATOR_NODES, importer.vb.identifier, {}); break; }
      case CHAIN.VB_ORGANIZATION: { await this.cachedDb.putObject(NODE_SCHEMAS.DB_ORGANIZATIONS, importer.vb.identifier, {}); break; }
      case CHAIN.VB_APPLICATION: { await this.cachedDb.putObject(NODE_SCHEMAS.DB_APPLICATIONS, importer.vb.identifier, {}); break; }
    }

    console.log(`Accepted`);
    return true;
  }

  /**
    Account callbacks
  */
  async accountTokenIssuanceCallback(context: any) {
    const rawPublicKey = await context.vb.getPublicKey();
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

    await this.accountManager.saveAccountByPublicKey(context.vb.identifier, rawPublicKey);
  }

  async accountCreationCallback(context: any) {
    const rawPublicKey = await context.vb.getPublicKey();
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
      context.timestamp
    );

    await this.accountManager.saveAccountByPublicKey(context.vb.identifier, rawPublicKey);
  }

  async accountTokenTransferCallback(context: any) {
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
      context.timestamp
    );
  }

  /**
    Custom Carmentis query via abci_query
  */
  async query(data: any) {
    const { type, object } = this.messageUnserializer.unserialize(data);

    console.log(`Received query ${type} (${SCHEMAS.NODE_MESSAGE_NAMES[type]})`);

    if(!this.queryCallbacks.has(type)) {
      throw `unsupported query type`;
    }

    const callback = this.queryCallbacks.get(type);

    try {
      return await callback(object);
    }
    catch(error) {
      let errorMsg = "error";

      console.error(error);

      if(error instanceof Error) {
        errorMsg = error.toString();
      }

      return this.messageSerializer.serialize(
        SCHEMAS.MSG_ERROR,
        {
          error: errorMsg
        }
      );
    }
  }

  async getVirtualBlockchainState(object: any) {
    const stateData = await this.blockchain.provider.getVirtualBlockchainStateInternal(object.virtualBlockchainId);

    if(!stateData) {
      return this.messageSerializer.serialize(
        SCHEMAS.MSG_ERROR,
        {
          error: `unknown virtual blockchain`
        }
      );
    }

    return this.messageSerializer.serialize(
      SCHEMAS.MSG_VIRTUAL_BLOCKCHAIN_STATE,
      { stateData }
    );
  }

  async getVirtualBlockchainUpdate(object: any) {
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

  async getMicroblockInformation(object: any) {
    const microblockInfo = await this.blockchain.provider.getMicroblockInformation(object.hash);

    return this.messageSerializer.serialize(
      SCHEMAS.MSG_MICROBLOCK_INFORMATION,
      microblockInfo
    );
  }

  async awaitMicroblockAnchoring(object:any) {
    const self = this;
    let remaingingAttempts = 1000;

    return new Promise(function(resolve, reject) {
      async function test() {
        const microblockInfo = await self.blockchain.provider.getMicroblockInformation(object.hash);

        if(microblockInfo) {
          resolve(
            self.messageSerializer.serialize(
              SCHEMAS.MSG_MICROBLOCK_ANCHORING,
              microblockInfo
            )
          );
        }
        else {
          if(--remaingingAttempts > 0) {
            setTimeout(test, 100);
          }
          else {
            reject();
          }
        }
      }
      test();
    });
  }

  async getAccountState(object:any) {
    const state = await this.accountManager.loadState(object.accountHash);

    return this.messageSerializer.serialize(
      SCHEMAS.MSG_ACCOUNT_STATE,
      state
    );
  }

  async getAccountHistory(object:any) {
    const history = await this.accountManager.loadHistory(object.accountHash, object.lastHistoryHash, object.maxRecords);

    return this.messageSerializer.serialize(
      SCHEMAS.MSG_ACCOUNT_HISTORY,
      history
    );
  }

  async getAccountByPublicKeyHash(object:any) {
    const accountHash = await this.accountManager.loadAccountByPublicKeyHash(object.publicKeyHash);

    return this.messageSerializer.serialize(
      SCHEMAS.MSG_ACCOUNT_BY_PUBLIC_KEY_HASH,
      { accountHash }
    );
  }

  async getObjectList(object:any) {
    let tableId;

    switch(object.type) {
      case CHAIN.VB_ACCOUNT       : { tableId = NODE_SCHEMAS.DB_ACCOUNTS; break };
      case CHAIN.VB_VALIDATOR_NODE: { tableId = NODE_SCHEMAS.DB_VALIDATOR_NODES; break };
      case CHAIN.VB_ORGANIZATION  : { tableId = NODE_SCHEMAS.DB_ORGANIZATIONS; break };
      case CHAIN.VB_APPLICATION   : { tableId = NODE_SCHEMAS.DB_APPLICATIONS; break };

      default: {
        throw `invalid object type ${object.type}`;
      }
    }

    const list = await this.db.getKeys(tableId);

    return this.messageSerializer.serialize(
      SCHEMAS.MSG_OBJECT_LIST,
      { list }
    );
  }

  async getMicroblockBodys(object: any) {
    const list = await this.blockchain.provider.getMicroblockBodys(object.hashes);

    return this.messageSerializer.serialize(
      SCHEMAS.MSG_MICROBLOCK_BODYS,
      {
        list
      }
    );
  }

  /**
    Static helper functions
  */
  static decodeQueryField(urlObject: any, fieldName: any) {
    const hexa = urlObject.searchParams.get(fieldName);
    const data = Utils.binaryFromHexa(hexa.slice(2));
    return data;
  }

  static encodeResponse(response: any) {
    return JSON.stringify({
      data: Base64.encodeBinary(response)
    });
  }
}
