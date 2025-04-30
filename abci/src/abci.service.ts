import {ABCIService} from "./proto-ts/cometbft/abci/v1/service";
import {
    ApplySnapshotChunkRequest,
    ApplySnapshotChunkResponse,
    CheckTxRequest,
    CheckTxResponse,
    CommitRequest,
    CommitResponse,
    EchoRequest,
    EchoResponse,
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
    ProcessProposalStatus,
    QueryRequest,
    QueryResponse,
    VerifyVoteExtensionRequest,
    VerifyVoteExtensionResponse
} from "./proto-ts/cometbft/abci/v1/types";
import {Injectable} from "@nestjs/common";

@Injectable()
export class AbciService implements ABCIService {
    ApplySnapshotChunk(request: ApplySnapshotChunkRequest): Promise<ApplySnapshotChunkResponse> {
        return Promise.resolve(undefined);
    }

    CheckTx(request: CheckTxRequest): Promise<CheckTxResponse> {
        return Promise.resolve(undefined);
    }

    Commit(request: CommitRequest): Promise<CommitResponse> {
        return Promise.resolve(undefined);
    }

    Echo(request: EchoRequest): Promise<EchoResponse> {
        return Promise.resolve({
            message: `Echo: ${request.message}`,
        });
    }

    ExtendVote(request: ExtendVoteRequest): Promise<ExtendVoteResponse> {
        return Promise.resolve(undefined);
    }

    FinalizeBlock(request: FinalizeBlockRequest): Promise<FinalizeBlockResponse> {
        return Promise.resolve(undefined);
    }

    Flush(request: FlushRequest): Promise<FlushResponse> {
        return Promise.resolve(undefined);
    }

    Info(request: InfoRequest): Promise<InfoResponse> {
        return Promise.resolve({
            version: '1',
            data: "hello",
            appVersion: 1,
            lastBlockHeight: 0,
            lastBlockAppHash: new Uint8Array()
        });
    }

    InitChain(request: InitChainRequest): Promise<InitChainResponse> {
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
            appHash: new Uint8Array()
        });
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

    PrepareProposal(request: PrepareProposalRequest): Promise<PrepareProposalResponse> {
        return Promise.resolve({
            txs: request.txs
        });
    }

    ProcessProposal(request: ProcessProposalRequest): Promise<ProcessProposalResponse> {
        return Promise.resolve({
            status: ProcessProposalStatus.PROCESS_PROPOSAL_STATUS_ACCEPT
        });
    }

    Query(request: QueryRequest): Promise<QueryResponse> {
        return Promise.resolve(undefined);
    }

    VerifyVoteExtension(request: VerifyVoteExtensionRequest): Promise<VerifyVoteExtensionResponse> {
        return Promise.resolve(undefined);
    }

}
