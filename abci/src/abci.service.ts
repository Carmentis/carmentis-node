import {ABCIService} from "./proto-ts/cometbft/abci/v1/service";
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
//  ProcessProposalStatus,
    QueryRequest,
    QueryResponse,
    VerifyVoteExtensionRequest,
    VerifyVoteExtensionResponse
} from "./proto-ts/cometbft/abci/v1/types";
import {Injectable, Logger, OnModuleInit} from "@nestjs/common";
import { NodeCore } from "./carmentis/node-core";

@Injectable()
export class AbciService implements ABCIService {

    private logger = new Logger('AbciService');
    private nodeCore: NodeCore;

    Echo(request: EchoRequest): Promise<EchoResponse> {
        return Promise.resolve({
            message: `Echo: ${request.message}`,
        });
    }

//  Info(request: InfoRequest): Promise<InfoResponse> {
    Info(request: InfoRequest): Promise<any> {
        return Promise.resolve({
            version: '123',
            data: "Carmentis ABCI application",
            app_version: 456,
            last_block_height: 0,
            last_block_app_hash: new Uint8Array(32)
        });
    }

    InitChain(request: InitChainRequest): Promise<InitChainResponse> {
        this.nodeCore = new NodeCore(
            this.logger,
            {
              dbPath: '../../.carmentis',
            }
        );

        return Promise.resolve({
            consensusParams: {
                feature: {
                    voteExtensionsEnableHeight: 2,
                    pbtsEnableHeight: undefined
                },
                block: {
                    maxBytes: 2202009,
                    maxGas: -1,
                },
                evidence: {
                    maxAgeDuration: {
                        seconds: 172800,
                        nanos: 0
                    },
                    maxBytes: 2202009,
                    maxAgeNumBlocks: 100000
                },
                validator: {
                    pubKeyTypes: ['ed25519']
                },
                version: {
                    app: 1
                },
                abci: undefined,
                synchrony: {
                    precision: {
                        seconds: 172800,
                        nanos: 0
                    },
                    messageDelay: {
                        seconds: 172800,
                        nanos: 0
                    }
                }
            },
            validators: [],
            appHash: new Uint8Array(32)
        });
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
            gasWanted: 0,
            gasUsed: 0,
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

//      this.logger.debug(`txResults: ${response.txResults.length} entries`);
//      const encoded = FinalizeBlockResponse.encode(response).finish();
//      this.logger.debug('Encoded FinalizeBlockResponse:', [...encoded].map(v => v.toString(16).padStart(2, "0")).join(" "));
//      const decoded = FinalizeBlockResponse.decode(encoded);
//      this.logger.debug('Decoded:', decoded);

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

    Query(request: QueryRequest): Promise<QueryResponse> {
        return Promise.resolve(undefined);
    }

    VerifyVoteExtension(request: VerifyVoteExtensionRequest): Promise<VerifyVoteExtensionResponse> {
        return Promise.resolve(undefined);
    }

}
