import {
    ApplySnapshotChunkRequest,
    ApplySnapshotChunkResponse,
    CheckTxRequest,
    CheckTxResponse,
    CommitRequest,
    CommitResponse,
    EchoRequest,
    EchoResponse,
    ExecTxResult,
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
    VerifyVoteExtensionResponse,
} from './proto-ts/cometbft/abci/v1/types';

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { NodeCore } from './carmentis/nodeCore';
import { ConfigService } from '@nestjs/config';
import { KeyManagementService } from './key-management.service';
import { CometBFTNodeConfigService } from './carmentis/CometBFTNodeConfigService';
import { GenesisSnapshotStorageService } from './carmentis/genesis-snapshot-storage.service';

@Injectable()
export class AbciService implements OnModuleInit {
    private logger = new Logger('AbciService');
    private nodeCore: NodeCore;

    constructor(
        private config: ConfigService,
        private readonly cometConfig: CometBFTNodeConfigService,
        private kms: KeyManagementService,
        private genesisSnapshotHandler: GenesisSnapshotStorageService
    ) {}

    onModuleInit() {
        this.nodeCore = new NodeCore(this.logger, this.config, this.cometConfig, this.kms, this.genesisSnapshotHandler);
    }

    Echo(request: EchoRequest): Promise<EchoResponse> {
        return Promise.resolve({
            message: `Echo: ${request.message}`,
        });
    }

    Flush(request: FlushRequest): Promise<FlushResponse> {
        return Promise.resolve(undefined);
    }

    async Info(request: InfoRequest): Promise<InfoResponse> {
        return Promise.resolve(await this.nodeCore.info(request));
    }

    async InitChain(request: InitChainRequest): Promise<InitChainResponse> {
        return Promise.resolve(await this.nodeCore.initChain(request));
    }

    async CheckTx(request: CheckTxRequest): Promise<CheckTxResponse> {
        this.logger.debug(`CheckTx: ${request.tx.length} bytes`);

        const resultCheck = await this.nodeCore.checkTx(request);

        return Promise.resolve({
            code: resultCheck.success ? 0 : 1,
            log: '',
            data: new Uint8Array(request.tx),
            gas_wanted: 0,
            gas_used: 0,
            info: !resultCheck.success ? resultCheck.error : '',
            events: [],
            codespace: 'app',
        });
    }

    async PrepareProposal(request: PrepareProposalRequest): Promise<PrepareProposalResponse> {
        return Promise.resolve({
            txs: await this.nodeCore.prepareProposal(request),
        });
    }

    async ProcessProposal(request: ProcessProposalRequest): Promise<ProcessProposalResponse> {
        return Promise.resolve({
            status: await this.nodeCore.processProposal(request),
        });
    }

    async FinalizeBlock(request: FinalizeBlockRequest): Promise<FinalizeBlockResponse> {
        const response = await this.nodeCore.finalizeBlock(request);

        return Promise.resolve(response);
    }

    async Commit(request: CommitRequest): Promise<CommitResponse> {
        const response = await this.nodeCore.commit(request);

        return Promise.resolve(response);
    }

    async ListSnapshots(request: ListSnapshotsRequest): Promise<ListSnapshotsResponse> {
        return await this.nodeCore.listSnapshots(request);
    }

    async LoadSnapshotChunk(request: LoadSnapshotChunkRequest): Promise<LoadSnapshotChunkResponse> {
        return await this.nodeCore.loadSnapshotChunk(request);
    }

    async OfferSnapshot(request: OfferSnapshotRequest): Promise<OfferSnapshotResponse> {
        return await this.nodeCore.offerSnapshot(request);
    }

    async ApplySnapshotChunk(
        request: ApplySnapshotChunkRequest,
    ): Promise<ApplySnapshotChunkResponse> {
        return await this.nodeCore.applySnapshotChunk(request);
    }

    ExtendVote(request: ExtendVoteRequest): Promise<ExtendVoteResponse> {
        return Promise.resolve(undefined);
    }

    VerifyVoteExtension(request: VerifyVoteExtensionRequest): Promise<VerifyVoteExtensionResponse> {
        return Promise.resolve(undefined);
    }

    async Query(request: QueryRequest): Promise<QueryResponse> {
        const response = await this.nodeCore.query(new Uint8Array(request.data));

        return Promise.resolve({
            code: 2,
            log: '',
            info: '',
            index: 0,
            key: new Uint8Array(),
            value: response,
            proof_ops: undefined,
            height: 0,
            codespace: 'Carmentis',
        });
    }
}
