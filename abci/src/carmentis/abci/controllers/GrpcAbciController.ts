import { GrpcMethod } from '@nestjs/microservices';
import { Controller, Logger } from '@nestjs/common';
import { Utils } from '@cmts-dev/carmentis-sdk/server';
import { AbciService } from '../AbciService';
import {
    RequestEcho,
    RequestInfo,
    RequestLoadSnapshotChunk,
    RequestOfferSnapshot,
    RequestVerifyVoteExtension,
    ResponseEcho,
    ResponseInfo,
    ResponseLoadSnapshotChunk,
    ResponseOfferSnapshot,
    ResponseVerifyVoteExtension,
    RequestInitChain,
    ResponseInitChain,
    RequestPrepareProposal,
    ResponsePrepareProposal,
    RequestProcessProposal,
    ResponseProcessProposal,
    RequestCommit,
    ResponseCommit,
    RequestCheckTx,
    ResponseCheckTx,
    RequestApplySnapshotChunk,
    ResponseApplySnapshotChunk,
    RequestListSnapshots,
    ResponseListSnapshots,
    RequestExtendVote,
    ResponseExtendVote,
    RequestFinalizeBlock,
    ResponseFinalizeBlock,
    RequestFlush,
    ResponseFlush,
    RequestQuery,
    ResponseQuery,
} from '../../../proto/tendermint/abci/types';

@Controller()
export class GrpcAbciController {
    private logger = new Logger('AbciController');

    constructor(private readonly abciService: AbciService) {}

    @GrpcMethod('ABCI', 'Echo')
    async Echo(request: RequestEcho): Promise<ResponseEcho> {
        this.logger.debug('Called Echo');
        return await this.abciService.Echo(request);
    }

    @GrpcMethod('ABCI', 'Info')
    async Info(request: RequestInfo): Promise<ResponseInfo> {
        this.logger.debug('Called Info');
        return await this.abciService.Info(request);
    }

    @GrpcMethod('ABCI', 'InitChain')
    async InitChain(request: RequestInitChain): Promise<ResponseInitChain> {
        this.logger.debug('Called InitChain');
        return await this.abciService.InitChain(request);
    }

    @GrpcMethod('ABCI', 'PrepareProposal')
    async PrepareProposal(request: RequestPrepareProposal): Promise<ResponsePrepareProposal> {
        this.logger.debug('Called PrepareProposal');
        return await this.abciService.PrepareProposal(request);
    }

    @GrpcMethod('ABCI', 'ProcessProposal')
    async ProcessProposal(request: RequestProcessProposal): Promise<ResponseProcessProposal> {
        this.logger.debug('Called ProcessProposal');
        return await this.abciService.ProcessProposal(request);
    }

    @GrpcMethod('ABCI', 'Commit')
    async Commit(request: RequestCommit): Promise<ResponseCommit> {
        return await this.abciService.Commit(request);
    }

    @GrpcMethod('ABCI', 'CheckTx')
    async CheckTx(request: RequestCheckTx, referenceTimestamp = Utils.getTimestampInSeconds()): Promise<ResponseCheckTx> {
        this.logger.debug('Called CheckTx');
        return await this.abciService.CheckTx(request, referenceTimestamp);
    }

    @GrpcMethod('ABCI', 'ApplySnapshotChunk')
    async ApplySnapshotChunk(request: RequestApplySnapshotChunk): Promise<ResponseApplySnapshotChunk> {
        this.logger.debug('Called ApplySnapshotChunk');
        return await this.abciService.ApplySnapshotChunk(request);
    }

    @GrpcMethod('ABCI', 'ListSnapshots')
    async ListSnapshots(request: RequestListSnapshots): Promise<ResponseListSnapshots> {
        this.logger.debug('Called ListSnapshots');
        return await this.abciService.ListSnapshots(request);
    }

    @GrpcMethod('ABCI', 'LoadSnapshotChunk')
    async LoadSnapshotChunk(request: RequestLoadSnapshotChunk): Promise<ResponseLoadSnapshotChunk> {
        this.logger.debug('Called LoadSnapshotChunk');
        return await this.abciService.LoadSnapshotChunk(request);
    }

    @GrpcMethod('ABCI', 'OfferSnapshot')
    async OfferSnapshot(request: RequestOfferSnapshot): Promise<ResponseOfferSnapshot> {
        this.logger.debug('Called OfferSnapshot');
        return await this.abciService.OfferSnapshot(request);
    }

    @GrpcMethod('ABCI', 'ExtendVote')
    async ExtendVote(request: RequestExtendVote): Promise<ResponseExtendVote> {
        this.logger.debug('Called ExtendVote');
        return this.abciService.ExtendVote(request);
    }

    @GrpcMethod('ABCI', 'FinalizeBlock')
    async FinalizeBlock(request: RequestFinalizeBlock): Promise<ResponseFinalizeBlock> {
        this.logger.debug('Called FinalizeBlock');
        return await this.abciService.FinalizeBlock(request);
    }

    @GrpcMethod('ABCI', 'Flush')
    async Flush(request: RequestFlush): Promise<ResponseFlush> {
        return this.abciService.Flush(request);
    }

    @GrpcMethod('ABCI', 'Query')
    async Query(request: RequestQuery): Promise<ResponseQuery> {
        this.logger.debug('Called Query');
        return await this.abciService.Query(request);
    }

    @GrpcMethod('ABCI', 'VerifyVoteExtension')
    VerifyVoteExtension(request: RequestVerifyVoteExtension): Promise<ResponseVerifyVoteExtension> {
        this.logger.debug('Called VerifyVoteExtension');
        return this.abciService.VerifyVoteExtension(request);
    }
}
