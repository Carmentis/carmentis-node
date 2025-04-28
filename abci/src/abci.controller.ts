import {GrpcMethod} from "@nestjs/microservices";
import {Controller} from "@nestjs/common";
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
    ProcessProposalResponse, QueryRequest, QueryResponse, VerifyVoteExtensionRequest, VerifyVoteExtensionResponse
} from "./cometbft/abci/v1/types";
import {ABCIService} from "./cometbft/abci/v1/service";

@Controller()
export class AbciController {

    constructor() {
    }

    @GrpcMethod('ABCIService', 'Echo')
    Echo(request: EchoRequest): EchoResponse {
        console.log(`Handling echo request with message: ${request.message}`)
        return { message: `Echo: ${request.message}` };
    }

    ApplySnapshotChunk(request: ApplySnapshotChunkRequest): Promise<ApplySnapshotChunkResponse> {
        return Promise.resolve(undefined);
    }

    CheckTx(request: CheckTxRequest): Promise<CheckTxResponse> {
        return Promise.resolve(undefined);
    }

    Commit(request: CommitRequest): Promise<CommitResponse> {
        return Promise.resolve(undefined);
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
        return Promise.resolve(undefined);
    }

    InitChain(request: InitChainRequest): Promise<InitChainResponse> {
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

    PrepareProposal(request: PrepareProposalRequest): Promise<PrepareProposalResponse> {
        return Promise.resolve(undefined);
    }

    ProcessProposal(request: ProcessProposalRequest): Promise<ProcessProposalResponse> {
        return Promise.resolve(undefined);
    }

    Query(request: QueryRequest): Promise<QueryResponse> {
        return Promise.resolve(undefined);
    }

    VerifyVoteExtension(request: VerifyVoteExtensionRequest): Promise<VerifyVoteExtensionResponse> {
        return Promise.resolve(undefined);
    }
}