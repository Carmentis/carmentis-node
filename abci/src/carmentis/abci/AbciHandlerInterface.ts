import {
    ApplySnapshotChunkRequest,
    ApplySnapshotChunkResponse, ApplySnapshotChunkResult,
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
    OfferSnapshotResponse, OfferSnapshotResult,
    PrepareProposalRequest,
    PrepareProposalResponse,
    ProcessProposalRequest,
    ProcessProposalResponse, ProcessProposalStatus,
    QueryRequest,
    QueryResponse,
    Snapshot as SnapshotProto,
    VerifyVoteExtensionRequest,
    VerifyVoteExtensionResponse,
} from '../../proto-ts/cometbft/abci/v1/types';


export interface AbciHandlerInterface {
    Echo(request: EchoRequest): Promise<EchoResponse>;
    Flush(request: FlushRequest): Promise<FlushResponse>;
    Info(request: InfoRequest): Promise<InfoResponse> ;
    InitChain(request: InitChainRequest): Promise<InitChainResponse>;
    CheckTx(request: CheckTxRequest): Promise<CheckTxResponse>;
    PrepareProposal(request: PrepareProposalRequest): Promise<PrepareProposalResponse>;
    ProcessProposal(request: ProcessProposalRequest): Promise<ProcessProposalResponse>;
    FinalizeBlock(request: FinalizeBlockRequest): Promise<FinalizeBlockResponse>;
    Commit(request: CommitRequest): Promise<CommitResponse>;
    ListSnapshots(request: ListSnapshotsRequest): Promise<ListSnapshotsResponse>;
    LoadSnapshotChunk(request: LoadSnapshotChunkRequest): Promise<LoadSnapshotChunkResponse>;
    OfferSnapshot(request: OfferSnapshotRequest): Promise<OfferSnapshotResponse>;
    ApplySnapshotChunk(request: ApplySnapshotChunkRequest,): Promise<ApplySnapshotChunkResponse>;
    ExtendVote(request: ExtendVoteRequest): void;
    VerifyVoteExtension(request: VerifyVoteExtensionRequest): Promise<VerifyVoteExtensionResponse>;
    Query(request: QueryRequest): Promise<QueryResponse>;
}