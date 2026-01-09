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
    ProcessProposalStatus,
    QueryRequest,
    QueryResponse,
    VerifyVoteExtensionRequest,
    VerifyVoteExtensionResponse,
    VerifyVoteExtensionStatus,
} from '../../../proto-ts/cometbft/abci/v1/types';
import { Utils } from '@cmts-dev/carmentis-sdk/server';
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

    @GrpcMethod('ABCIService', 'CheckTx')
    async CheckTx(request: CheckTxRequest, referenceTimestamp = Utils.getTimestampInSeconds()): Promise<CheckTxResponse> {
        this.logger.debug('Called CheckTx');
        return await this.abciService.CheckTx(request, referenceTimestamp);
    }

    @GrpcMethod('ABCIService', 'ApplySnapshotChunk')
    async ApplySnapshotChunk(request: ApplySnapshotChunkRequest): Promise<ApplySnapshotChunkResponse> {
        this.logger.debug('Called ApplySnapshotChunk');
        return await this.abciService.ApplySnapshotChunk(request);
    }

    @GrpcMethod('ABCIService', 'ListSnapshots')
    async ListSnapshots(request: ListSnapshotsRequest): Promise<ListSnapshotsResponse> {
        this.logger.debug('Called ListSnapshots');
        return await this.abciService.ListSnapshots(request);
    }

    @GrpcMethod('ABCIService', 'LoadSnapshotChunk')
    async LoadSnapshotChunk(request: LoadSnapshotChunkRequest): Promise<LoadSnapshotChunkResponse> {
        this.logger.debug('Called LoadSnapshotChunk');
        return await this.abciService.LoadSnapshotChunk(request);
    }

    @GrpcMethod('ABCIService', 'OfferSnapshot')
    async OfferSnapshot(request: OfferSnapshotRequest): Promise<OfferSnapshotResponse> {
        this.logger.debug('Called OfferSnapshot');
        return await this.abciService.OfferSnapshot(request);
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
    async Flush(request: FlushRequest): Promise<FlushResponse> {
        return FlushResponse.create();
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
