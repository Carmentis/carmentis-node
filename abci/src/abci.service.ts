import {ABCIService} from "./proto-ts/cometbft/abci/v1/service";
import { createHash } from "crypto";
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
import {Injectable} from "@nestjs/common";

@Injectable()
export class AbciService implements ABCIService {

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

    PrepareProposal(request: PrepareProposalRequest): Promise<PrepareProposalResponse> {
        const txs = [];

        for (let i=0; i<request.txs.length; i++) {
            txs.push(new Uint8Array(request.txs[i]));
        }

        return Promise.resolve({
            txs: txs
        });
    }

    ApplySnapshotChunk(request: ApplySnapshotChunkRequest): Promise<ApplySnapshotChunkResponse> {
        return Promise.resolve(undefined);
    }

    CheckTx(request: CheckTxRequest): Promise<CheckTxResponse> {
        console.log('tx', request.tx, new Uint8Array(request.tx));
        return Promise.resolve({
            code: 0,
            log: "test",
            data: new Uint8Array(request.tx),
            gasWanted: 0,
            gasUsed: 0,
            info: "test",
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

    FinalizeBlock(request: FinalizeBlockRequest): Promise<FinalizeBlockResponse> {
        const txResults: ExecTxResult[] = [];
        for (let i = 0; i < request.txs.length; i++) {
            console.log(`Processing transaction at index ${i}:`, request.txs[i], new Uint8Array(request.txs[i]));

            txResults.push({
                code: 0,
                data: request.txs[i],
                log: "",
                info: "",
                gasWanted: 0,
                gasUsed: 0,
                events: [],
                codespace: "app",
            });
        }

        const finalizedBlock: FinalizeBlockResponse = {
            events: txResults.flatMap(txResult => txResult.events),
        // @ts-ignore
            tx_results: txResults,
            validatorUpdates: [],
            appHash: Uint8Array.from(request.txs),
            consensusParamUpdates: undefined
        };

        return Promise.resolve(finalizedBlock);
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
