import {NODE_SCHEMAS} from "./constants/constants";
import {AccountManager} from "./accountManager";
import {LevelDb} from "./levelDb";
import {RadixTree} from "./radixTree";
import {CachedLevelDb} from "./cachedLevelDb";
import {LevelDbProvider} from "./providers/levelDbProvider";

const PROPOSAL_UNKNOWN = 0;
const PROPOSAL_ACCEPT  = 1;
const PROPOSAL_REJECT  = 2;

import {
  CheckTxRequest,
  CheckTxResponse,
  CommitResponse,
  ExecTxResult,
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
} from "../proto-ts/cometbft/abci/v1/types";

import {
  CHAIN,
  ECO,
  SCHEMAS,
  SECTIONS,
  Base64,
  Utils,
  Blockchain,
  Economics,
  MemoryProvider,
  NullNetworkProvider,
  Provider,
  MessageSerializer,
  MessageUnserializer
} from '@cmts-dev/carmentis-sdk/server';

interface Cache {
  db: CachedLevelDb;
  blockchain: Blockchain;
  accountManager: AccountManager;
  vbRadix: RadixTree;
  tokenRadix: RadixTree;
};

type SectionCallback = (arg: any) => Promise<void>;
type QueryCallback = (arg: any) => Promise<Uint8Array>;

export class NodeCore {
  logger: any;
  accountManager: AccountManager;
  blockchain: Blockchain;
  db: LevelDb;
  messageSerializer: MessageSerializer;
  messageUnserializer: MessageUnserializer;
  vbRadix: RadixTree;
  tokenRadix: RadixTree;
  sectionCallbacks: Map<number, SectionCallback>;
  queryCallbacks: Map<number, QueryCallback>;
  finalizedBlockCache: Cache | null;

  constructor(logger: any, options: any) {
    this.logger = logger;

    this.db = new LevelDb(options.dbPath, NODE_SCHEMAS.DB);
    this.db.initialize();

    const levelDbProvider = new LevelDbProvider(this.db);
    const provider = new Provider(levelDbProvider, new NullNetworkProvider());
    this.blockchain = new Blockchain(provider);

    this.messageUnserializer = new MessageUnserializer(SCHEMAS.NODE_MESSAGES);
    this.messageSerializer = new MessageSerializer(SCHEMAS.NODE_MESSAGES);
    this.sectionCallbacks = new Map;
    this.queryCallbacks = new Map;
    this.accountManager = new AccountManager(this.db);

    this.vbRadix = new RadixTree(this.db, NODE_SCHEMAS.DB_VB_RADIX);
    this.tokenRadix = new RadixTree(this.db, NODE_SCHEMAS.DB_TOKEN_RADIX);

    this.finalizedBlockCache = null;

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

  registerSectionCallbacks(objectType: number, callbackList: Array<[number, SectionCallback]>) {
    for(const [ sectionType, callback ] of callbackList) {
      const key = sectionType << 4 | objectType;
      this.sectionCallbacks.set(key, callback.bind(this));
    }
  }

  registerQueryCallback(messageId: any, callback: QueryCallback) {
    this.queryCallbacks.set(messageId, callback.bind(this));
  }

  async invokeSectionCallback(vbType: number, sectionType: number, context: any) {
    const key = sectionType << 4 | vbType;

    if(this.sectionCallbacks.has(key)) {
      const callback = this.sectionCallbacks.get(key);

      if(!callback) {
        throw `callback unexpectedly undefined`;
      }
      await callback(context);
    }
  }

  /**
    Incoming transaction
  */
  async checkTx(request: CheckTxRequest) {
    this.logger.log(`checkTx`);

    const cache = this.getCacheInstance();
    const importer = cache.blockchain.getMicroblockImporter(new Uint8Array(request.tx));
    const success = await this.checkMicroblock(cache, importer);

    if(success) {
      this.logger.log(`Type: ${CHAIN.VB_NAME[importer.vb.type]}`);
      this.logger.log(`Total size: ${request.tx.length} bytes`);

      const vb: any = await importer.getVirtualBlockchain();

      for(const section of vb.currentMicroblock.sections) {
        this.logger.log(`${(SECTIONS.DEF[importer.vb.type][section.type].label + " ").padEnd(36, ".")} ${section.data.length} byte(s)`);
      }
    }

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
    this.logger.log(`prepareProposal: ${request.txs.length} txs`);
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
      PROPOSAL_UNKNOWN = 0; // Unknown status. Returning this from the application is always an error.
      PROPOSAL_ACCEPT  = 1; // Status that signals that the application finds the proposal valid.
      PROPOSAL_REJECT  = 2; // Status that signals that the application finds the proposal invalid.
  */
  async processProposal(request: ProcessProposalRequest) {
    this.logger.log(`processProposal: ${request.txs.length} txs`);

    let fees = 0;

    const cache = this.getCacheInstance();

    for(const tx of request.txs) {
      const importer = cache.blockchain.getMicroblockImporter(new Uint8Array(tx));
      const success = await this.checkMicroblock(cache, importer);
      const vb: any = await importer.getVirtualBlockchain();

      await importer.store();

      fees += vb.currentMicroblock.header.gas * vb.currentMicroblock.header.gasPrice;
    }

    fees /= ECO.GAS_UNIT;

    this.logger.log(`processProposal / total block fees: ${fees / ECO.TOKEN} ${ECO.TOKEN_NAME}`);

    return PROPOSAL_ACCEPT;
  }

  async extendVote(request: ExtendVoteRequest) {
  }

  async verifyVoteExtension(request: VerifyVoteExtensionRequest) {
  }

  async finalizeBlock(request: FinalizeBlockRequest) {
    this.logger.log(`finalizeBlock: ${request.txs.length} txs`);
    const txResults = [];
    let totalFees = 0;

    if(this.finalizedBlockCache !== null) {
      this.logger.warn(`finalizeBlock() called before the previous commit()`);
    }

    this.finalizedBlockCache = this.getCacheInstance();

    for(const tx of request.txs) {
      const importer = this.finalizedBlockCache.blockchain.getMicroblockImporter(new Uint8Array(tx));
      const success = await this.checkMicroblock(this.finalizedBlockCache, importer);
      const vb: any = await importer.getVirtualBlockchain();
      const fees = Math.floor(vb.currentMicroblock.header.gas * vb.currentMicroblock.header.gasPrice / ECO.GAS_UNIT);
      const feesPayerAccount = vb.currentMicroblock.getFeesPayerAccount();

      totalFees += fees;

      this.logger.log(`Storing microblock ${Utils.binaryToHexa(vb.currentMicroblock.hash)}`);
      this.logger.log(`Fees: ${fees / ECO.TOKEN} ${ECO.TOKEN_NAME}, paid by ${this.finalizedBlockCache.accountManager.getShortAccountString(feesPayerAccount)}`);

      await importer.store();

      if(feesPayerAccount !== null) {
/*
        this.finalizedBlockCache.accountManager.tokenTransfer(
          {
            type        : ECO.BK_PAID_FEES,
            payerAccount: feesPayerAccount,
            payeeAccount: Economics.specialAccountTypeToIdentifier(ECO.ACCOUNT_BLOCK_FEES),
            amount      : fees
          },
          {
            mbHash: vb.currentMicroblock.hash
          },
          importer.currentTimestamp
        );
*/
      }

      txResults.push(
        ExecTxResult.create({
          code: 0,
          data: new Uint8Array(),
          log: "",
          info: "",
          gasWanted: 0,
          gasUsed: 0,
          events: [],
          codespace: "app"
        })
      );
    }

    this.logger.log(`Total block fees: ${totalFees / ECO.TOKEN} ${ECO.TOKEN_NAME}`);

    const appHash = new Uint8Array(32);
    appHash[30] = request.height >> 8 & 0xFF;
    appHash[31] = request.height & 0xFF;

    return FinalizeBlockResponse.create({
      txResults,
      appHash,
      events: [],
      validatorUpdates: [],
      consensusParamUpdates: undefined
    });
  }

  async commit() {
    if(this.finalizedBlockCache === null) {
      throw `nothing to commit`;
    }

    await this.finalizedBlockCache.db.commit();

    this.finalizedBlockCache = null;

    this.logger.log(`Commit done`);

    return CommitResponse.create({
      retainHeight: 0
    });
  }

  /**
    Checks a microblock and invokes the section callbacks of the node.
  */
  async checkMicroblock(cache: Cache, importer: any) {
    this.logger.log(`Checking microblock ${Utils.binaryToHexa(importer.hash)}`);

    const status = await importer.check();

    if(status) {
      this.logger.error(`Rejected with status ${status}: ${importer.error}`);
      return false;
    }

    for(const section of importer.vb.currentMicroblock.sections) {
      const context = {
        vb: importer.vb,
        mb: importer.vb.currentMicroblock,
        section,
        timestamp: importer.currentTimestamp,
        accountManager: cache.accountManager
      };
      await this.invokeSectionCallback(importer.vb.type, section.type, context);
    }

    switch(importer.vb.type) {
      case CHAIN.VB_ACCOUNT: { await cache.db.putObject(NODE_SCHEMAS.DB_ACCOUNTS, importer.vb.identifier, {}); break; }
      case CHAIN.VB_VALIDATOR_NODE: { await cache.db.putObject(NODE_SCHEMAS.DB_VALIDATOR_NODES, importer.vb.identifier, {}); break; }
      case CHAIN.VB_ORGANIZATION: { await cache.db.putObject(NODE_SCHEMAS.DB_ORGANIZATIONS, importer.vb.identifier, {}); break; }
      case CHAIN.VB_APPLICATION: { await cache.db.putObject(NODE_SCHEMAS.DB_APPLICATIONS, importer.vb.identifier, {}); break; }
    }

    this.logger.log(`Accepted`);
    return true;
  }

  /**
    Account callbacks
  */
  async accountTokenIssuanceCallback(context: any) {
    const rawPublicKey = await context.vb.getPublicKey();
    await context.accountManager.testPublicKeyAvailability(rawPublicKey);

    await context.accountManager.tokenTransfer(
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

    await context.accountManager.saveAccountByPublicKey(context.vb.identifier, rawPublicKey);
  }

  async accountCreationCallback(context: any) {
    const rawPublicKey = await context.vb.getPublicKey();
    await context.accountManager.testPublicKeyAvailability(rawPublicKey);

    await context.accountManager.tokenTransfer(
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

    await context.accountManager.saveAccountByPublicKey(context.vb.identifier, rawPublicKey);
  }

  async accountTokenTransferCallback(context: any) {
    await context.accountManager.tokenTransfer(
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

    this.logger.log(`Received query ${SCHEMAS.NODE_MESSAGES[type].label} (${type})`);

    const callback = this.queryCallbacks.get(type);

    if(!callback) {
      throw `unsupported query type`;
    }

    try {
      return await callback(object);
    }
    catch(error) {
      let errorMsg = "error";

      this.logger.error(error);

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

  async awaitMicroblockAnchoring(object:any): Promise<Uint8Array> {
    let remaingingAttempts = 1000;

    return new Promise((resolve, reject) => {
      const test = async () => {
        const microblockInfo = await this.blockchain.provider.getMicroblockInformation(object.hash);

        if(microblockInfo) {
          resolve(
            this.messageSerializer.serialize(
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
      };
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

  getCacheInstance(): Cache {
    const db = new CachedLevelDb(this.db);
    const cachedLevelDbProvider = new LevelDbProvider(db);
    const cachedProvider = new Provider(cachedLevelDbProvider, new NullNetworkProvider());
    const blockchain = new Blockchain(cachedProvider);
    const accountManager = new AccountManager(db);
    const vbRadix = new RadixTree(db, NODE_SCHEMAS.DB_VB_RADIX);
    const tokenRadix = new RadixTree(db, NODE_SCHEMAS.DB_TOKEN_RADIX);

    return { db, blockchain, accountManager, vbRadix, tokenRadix };
  };

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
