import { GrpcMethod } from '@nestjs/microservices';
import { Controller, Logger } from '@nestjs/common';
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
    VerifyVoteExtensionStatus,
} from '../../../proto-ts/cometbft/abci/v1/types';
import { AbciService } from '../AbciService';

@Controller()
export class GrpcAbciController {
    private logger = new Logger('AbciController');

    constructor(private readonly abciService: AbciService) {}

    @GrpcMethod('ABCIService', 'Echo')
    async Echo(request: EchoRequest): Promise<EchoResponse> {
        this.logger.debug('Called Echo');
        return await this.abciService.Echo(request);
    }

    @GrpcMethod('ABCIService', 'Info')
    async Info(request: InfoRequest): Promise<InfoResponse> {
        this.logger.debug('Called Info');
        return await this.abciService.Info(request);
    }

    @GrpcMethod('ABCIService', 'InitChain')
    async InitChain(request: InitChainRequest): Promise<InitChainResponse> {
        this.logger.debug('Called InitChain');
        return await this.abciService.InitChain(request);
    }

    @GrpcMethod('ABCIService', 'PrepareProposal')
    async PrepareProposal(request: PrepareProposalRequest): Promise<PrepareProposalResponse> {
        this.logger.debug('Called PrepareProposal');
        return await this.abciService.PrepareProposal(request);
    }

    @GrpcMethod('ABCIService', 'ProcessProposal')
    async ProcessProposal(request: ProcessProposalRequest): Promise<ProcessProposalResponse> {
        this.logger.debug('Called ProcessProposal');
        return await this.abciService.ProcessProposal(request);
    }

    @GrpcMethod('ABCIService', 'Commit')
    async Commit(request: CommitRequest): Promise<CommitResponse> {
        return await this.abciService.Commit(request);
    }

    ApplySnapshotChunk(request: ApplySnapshotChunkRequest): Promise<ApplySnapshotChunkResponse> {
        return Promise.resolve(undefined);
    }

    @GrpcMethod('ABCIService', 'CheckTx')
    async CheckTx(request: CheckTxRequest): Promise<CheckTxResponse> {
        this.logger.debug('Called CheckTx');
        return await this.abciService.CheckTx(request);
    }

    @GrpcMethod('ABCIService', 'ExtendVote')
    ExtendVote(request: ExtendVoteRequest): Promise<ExtendVoteResponse> {
        this.logger.debug('Called ExtendVote');
        return Promise.resolve({
            vote_extension: new Uint8Array([]),
        });
    }

    @GrpcMethod('ABCIService', 'FinalizeBlock')
    async FinalizeBlock(request: FinalizeBlockRequest): Promise<FinalizeBlockResponse> {
        this.logger.debug('Called FinalizeBlock');
        return await this.abciService.FinalizeBlock(request);
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
    async Query(request: QueryRequest): Promise<QueryResponse> {
        this.logger.debug('Called Query');
        return await this.abciService.Query(request);
    }

    @GrpcMethod('ABCIService', 'VerifyVoteExtension')
    VerifyVoteExtension(request: VerifyVoteExtensionRequest): Promise<VerifyVoteExtensionResponse> {
        this.logger.debug('Called VerifyVoteExtension');
        return Promise.resolve({
            status: VerifyVoteExtensionStatus.VERIFY_VOTE_EXTENSION_STATUS_ACCEPT,
        });
    }
}
