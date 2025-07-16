import {GrpcMethod} from "@nestjs/microservices";
import {Controller, Logger} from "@nestjs/common";
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
    QueryRequest,
    QueryResponse,
    VerifyVoteExtensionRequest,
    VerifyVoteExtensionResponse,
    VerifyVoteExtensionStatus
} from "./proto-ts/cometbft/abci/v1/types";
import {AbciService} from "./abci.service";

@Controller()
export class AbciController {

    private logger = new Logger('AbciController');

    constructor(private readonly abciService: AbciService) {
        this.logger.debug('AbciController initialized');
        this.logger.debug('AbciService: ' + JSON.stringify(this.abciService));
    }

    @GrpcMethod('ABCIService', 'Echo')
    Echo(request: EchoRequest): Promise<EchoResponse> {
        this.logger.debug('Called Echo');
        return this.abciService.Echo(request);
    }

    @GrpcMethod('ABCIService', 'Info')
    Info(request: InfoRequest): Promise<InfoResponse> {
        this.logger.debug('Called Info');
        return this.abciService.Info(request);
    }

    @GrpcMethod('ABCIService', 'InitChain')
    InitChain(request: InitChainRequest): Promise<InitChainResponse> {
        this.logger.debug('Called InitChain');
        return this.abciService.InitChain(request);
    }

    @GrpcMethod('ABCIService', 'PrepareProposal')
    PrepareProposal(request: PrepareProposalRequest): Promise<PrepareProposalResponse> {
        this.logger.debug('Called PrepareProposal');
        return this.abciService.PrepareProposal(request);
    }

    @GrpcMethod('ABCIService', 'ProcessProposal')
    ProcessProposal(request: ProcessProposalRequest): Promise<ProcessProposalResponse> {
        this.logger.debug('Called ProcessProposal');
        return this.abciService.ProcessProposal(request);
    }

    @GrpcMethod('ABCIService', 'Commit')
    Commit(request: CommitRequest): Promise<CommitResponse> {
        return this.abciService.Commit(request);
    }

    ApplySnapshotChunk(request: ApplySnapshotChunkRequest): Promise<ApplySnapshotChunkResponse> {
        return Promise.resolve(undefined);
    }

    @GrpcMethod('ABCIService', 'CheckTx')
    CheckTx(request: CheckTxRequest): Promise<CheckTxResponse> {
        this.logger.debug('Called CheckTx');
        return this.abciService.CheckTx(request);
    }

    @GrpcMethod('ABCIService', 'ExtendVote')
    ExtendVote(request: ExtendVoteRequest): Promise<ExtendVoteResponse> {
        this.logger.debug('Called ExtendVote');
        return Promise.resolve({
            voteExtension: new Uint8Array([])
        });
    }

    @GrpcMethod('ABCIService', 'FinalizeBlock')
    async FinalizeBlock(request: FinalizeBlockRequest): Promise<FinalizeBlockResponse> {
        this.logger.debug('Called FinalizeBlock');
        return FinalizeBlockResponse.fromPartial(await this.abciService.FinalizeBlock(request));
    }

    @GrpcMethod('ABCIService', 'Flush')
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

    @GrpcMethod('ABCIService', 'Query')
    Query(request: QueryRequest): Promise<QueryResponse> {
        this.logger.debug('Called Query');
        return Promise.resolve({
            code: 2,
            /** bytes data = 2; // use "value" instead. */
            log: "",
            info: "",
            index: 0,
            key: new Uint8Array,
            value: new Uint8Array,
            proofOps: undefined,
            height: 0,
            codespace: "abci"
        });
    }

    @GrpcMethod('ABCIService', 'VerifyVoteExtension')
    VerifyVoteExtension(request: VerifyVoteExtensionRequest): Promise<VerifyVoteExtensionResponse> {
        this.logger.debug('Called VerifyVoteExtension');
        return Promise.resolve({
            status: VerifyVoteExtensionStatus.VERIFY_VOTE_EXTENSION_STATUS_ACCEPT
        });
    }
}
