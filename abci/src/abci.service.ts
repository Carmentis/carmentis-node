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
    ProcessProposalStatus,
    QueryRequest,
    QueryResponse,
    VerifyVoteExtensionRequest,
    VerifyVoteExtensionResponse
} from "./proto-ts/cometbft/abci/v1/types";
import {Injectable, OnModuleInit} from "@nestjs/common";
import { NodeCore } from "./carmentis/node-core";

@Injectable()
export class AbciService implements ABCIService {

    private nodeCore: NodeCore;

    Echo(request: EchoRequest): Promise<EchoResponse> {
        return Promise.resolve({
            message: `Echo: ${request.message}`,
        });
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
        this.nodeCore = new NodeCore({
            dbPath: '../../.carmentis',
        });

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
        console.log('tx', request.tx, new Uint8Array(request.tx));

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

    Commit(request: CommitRequest): Promise<CommitResponse> {
        return Promise.resolve({
            retainHeight: 0,
        });
    }

    ExtendVote(request: ExtendVoteRequest): Promise<ExtendVoteResponse> {
        return Promise.resolve(undefined);
    }

    async FinalizeBlock(request: FinalizeBlockRequest): Promise<FinalizeBlockResponse> {

        const { txResults, appHash } = await this.nodeCore.finalizeBlock(request);

        return Promise.resolve({
            txResults,
            appHash,
            events: [],
            validatorUpdates: undefined,
            consensusParamUpdates: undefined,
        });
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
