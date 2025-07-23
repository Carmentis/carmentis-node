import {
  ApplySnapshotChunkRequest,
  ApplySnapshotChunkResponse,
  CheckTxRequest,
  CheckTxResponse,
  CommitRequest,
  CommitResponse,
  EchoRequest,
  EchoResponse, ExecTxResult,
  ExtendVoteRequest,
  ExtendVoteResponse,
  FinalizeBlockRequest,
  FinalizeBlockResponse,
  FlushRequest,
  FlushResponse,
  InfoRequest,
  InfoResponse,
  InitChainRequest,
  InitChainResponse,
  ListSnapshotsRequest,
  ListSnapshotsResponse,
  LoadSnapshotChunkRequest,
  LoadSnapshotChunkResponse,
  OfferSnapshotRequest,
  OfferSnapshotResponse,
  PrepareProposalRequest,
  PrepareProposalResponse,
  ProcessProposalRequest,
  ProcessProposalResponse,
//ProcessProposalStatus,
  QueryRequest,
  QueryResponse,
  VerifyVoteExtensionRequest,
  VerifyVoteExtensionResponse
} from "./proto-ts/cometbft/abci/v1/types";

import {Injectable, Logger, OnModuleInit} from "@nestjs/common";
import {NodeCore} from "./carmentis/nodeCore";
import {CometNodeProvider} from "./cometNodeProvider";

@Injectable()
export class AbciService {
  private logger = new Logger('AbciService');
  private nodeCore: NodeCore;

  Echo(request: EchoRequest): Promise<EchoResponse> {
    return Promise.resolve({
      message: `Echo: ${request.message}`,
    });
  }

  Info(request: InfoRequest): Promise<InfoResponse> {
    return Promise.resolve({
      version: '1',
      data: "Carmentis ABCI application",
      app_version: 1,
      last_block_height: 0,
      last_block_app_hash: new Uint8Array(32)
    });
  }

  async InitChain(request: InitChainRequest): Promise<InitChainResponse> {
    this.nodeCore = new NodeCore(
      this.logger,
      CometNodeProvider,
      {
        dbPath: '../../.carmentis',
      }
    );

    return Promise.resolve(await this.nodeCore.initChain(request));
  }

  async PrepareProposal(request: PrepareProposalRequest): Promise<PrepareProposalResponse> {
    return Promise.resolve({
      txs: await this.nodeCore.prepareProposal(request)
    });
  }

  async ProcessProposal(request: ProcessProposalRequest): Promise<ProcessProposalResponse> {
    return Promise.resolve({
      status: await this.nodeCore.processProposal(request)
    });
  }

  ApplySnapshotChunk(request: ApplySnapshotChunkRequest): Promise<ApplySnapshotChunkResponse> {
    return Promise.resolve(undefined);
  }

  async CheckTx(request: CheckTxRequest): Promise<CheckTxResponse> {
    this.logger.debug(`CheckTx: ${request.tx.length} bytes`);

    const resultCheck = await this.nodeCore.checkTx(request)

    return Promise.resolve({
      code: resultCheck.success ? 0 : 1,
      log: "",
      data: new Uint8Array(request.tx),
      gas_wanted: 0,
      gas_used: 0,
      info: !resultCheck.success ? resultCheck.error : "",
      events: [],
      codespace: "app"
    });
  }

  async Commit(request: CommitRequest): Promise<CommitResponse> {
    const response = await this.nodeCore.commit();

    return Promise.resolve(response);
  }

  ExtendVote(request: ExtendVoteRequest): Promise<ExtendVoteResponse> {
    return Promise.resolve(undefined);
  }

  async FinalizeBlock(request: FinalizeBlockRequest): Promise<FinalizeBlockResponse> {
    const response = await this.nodeCore.finalizeBlock(request);

//    this.logger.debug(`txResults: ${response.txResults.length} entries`);
//    const encoded = FinalizeBlockResponse.encode(response).finish();
//    this.logger.debug('Encoded FinalizeBlockResponse:', [...encoded].map(v => v.toString(16).padStart(2, "0")).join(" "));
//    const decoded = FinalizeBlockResponse.decode(encoded);
//    this.logger.debug('Decoded:', decoded);

    return Promise.resolve(response);
  }

  Flush(request: FlushRequest): Promise<FlushResponse> {
    return Promise.resolve(undefined);
  }

  ListSnapshots(request: ListSnapshotsRequest): Promise<ListSnapshotsResponse> {
    return Promise.resolve(undefined);
  }

  LoadSnapshotChunk(request: LoadSnapshotChunkRequest): Promise<LoadSnapshotChunkResponse> {
    return Promise.resolve(undefined);
  }

  OfferSnapshot(request: OfferSnapshotRequest): Promise<OfferSnapshotResponse> {
    return Promise.resolve(undefined);
  }

  VerifyVoteExtension(request: VerifyVoteExtensionRequest): Promise<VerifyVoteExtensionResponse> {
    return Promise.resolve(undefined);
  }

  async Query(request: QueryRequest): Promise<QueryResponse> {
    const response = await this.nodeCore.query(new Uint8Array(request.data));

    return Promise.resolve({
      code: 2,
      log: "",
      info: "",
      index: 0,
      key: new Uint8Array,
      value: response,
      proof_ops: undefined,
      height: 0,
      codespace: "Carmentis"
    });
  }
}
