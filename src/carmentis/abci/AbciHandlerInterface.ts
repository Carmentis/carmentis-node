import {
    RequestApplySnapshotChunk,
    ResponseApplySnapshotChunk,
    RequestCheckTx,
    ResponseCheckTx,
    RequestCommit,
    ResponseCommit,
    RequestEcho,
    ResponseEcho,
    RequestExtendVote,
    RequestFinalizeBlock,
    ResponseFinalizeBlock,
    RequestFlush,
    ResponseFlush,
    RequestInfo,
    ResponseInfo,
    RequestInitChain,
    ResponseInitChain,
    RequestListSnapshots,
    ResponseListSnapshots,
    RequestLoadSnapshotChunk,
    ResponseLoadSnapshotChunk,
    RequestOfferSnapshot,
    ResponseOfferSnapshot,
    RequestPrepareProposal,
    ResponsePrepareProposal,
    RequestProcessProposal,
    ResponseProcessProposal,
    RequestQuery,
    ResponseQuery,
    RequestVerifyVoteExtension,
    ResponseVerifyVoteExtension,
} from '../../proto/tendermint/abci/types';


/**
 * Interface representing the handler for ABCI (Application Blockchain Interface) methods.
 * This interface defines the communication methods between the application and the ABCI.
 */
export interface AbciHandlerInterface {
    /**
     * Sends an EchoRequest and returns an EchoResponse.
     *
     * @param {EchoRequest} request - The request object containing the data to be echoed.
     * @return {Promise<EchoResponse>} A promise that resolves to the response object.
     */
    Echo(request: RequestEcho): Promise<ResponseEcho>;
    /**
     * Executes the flush operation to process the provided request and returns a response upon completion.
     *
     * @param {FlushRequest} request - The request object containing the data and parameters for the flush operation.
     * @return {Promise<FlushResponse>} A promise that resolves to a FlushResponse object containing the result of the operation.
     */
    Flush(request: RequestFlush): Promise<ResponseFlush>;
    /**
     * Fetches and processes information based on the provided request.
     *
     * @param {InfoRequest} request - The request object containing input details for retrieving information.
     * @return {Promise<InfoResponse>} A promise that resolves to the response object containing the processed information.
     */
    Info(request: RequestInfo): Promise<ResponseInfo> ;
    /**
     * Initializes the chain with the given request parameters.
     *
     * @param {InitChainRequest} request - The request object containing initialization parameters for the chain.
     * @return {Promise<InitChainResponse>} A promise that resolves to the response object after the chain has been initialized.
     */
    InitChain(request: RequestInitChain): Promise<ResponseInitChain>;
    /**
     * Processes a transaction check request and returns the corresponding response.
     *
     * @param {CheckTxRequest} request - The transaction check request object containing all necessary details for validation.
     * @return {Promise<CheckTxResponse>} A promise that resolves to a response object containing the result of the transaction check.
     */
    CheckTx(request: RequestCheckTx): Promise<ResponseCheckTx>;
    /**
     * Prepares a proposal based on the provided request object and returns the response.
     *
     * @param {PrepareProposalRequest} request - The request object containing the necessary details to prepare the proposal.
     * @return {Promise<PrepareProposalResponse>} A promise that resolves to the response object containing the prepared proposal details.
     */
    PrepareProposal(request: RequestPrepareProposal): Promise<ResponsePrepareProposal>;
    /**
     * Processes a proposal based on the provided request data and returns a response.
     *
     * @param {ProcessProposalRequest} request - The request object containing the necessary data to process the proposal.
     * @return {Promise<ProcessProposalResponse>} - A promise that resolves with the response object after processing the proposal.
     */
    ProcessProposal(request: RequestProcessProposal): Promise<ResponseProcessProposal>;
    /**
     * Finalizes a block based on the provided request parameters.
     *
     * @param {FinalizeBlockRequest} request - The request object containing the necessary information to finalize the block.
     * @return {Promise<FinalizeBlockResponse>} A promise that resolves to the response object containing the finalized block details.
     */
    FinalizeBlock(request: RequestFinalizeBlock): Promise<ResponseFinalizeBlock>;
    /**
     * Executes a commit operation based on the specified request.
     *
     * @param {CommitRequest} request - An object containing the details of the commit operation to be executed.
     * @return {Promise<CommitResponse>} A promise that resolves to the response of the commit operation.
     */
    Commit(request: RequestCommit): Promise<ResponseCommit>;
    /**
     * Retrieves a list of snapshots based on the provided request criteria.
     *
     * @param {ListSnapshotsRequest} request - The request object containing parameters to filter and retrieve snapshots.
     * @return {Promise<ListSnapshotsResponse>} A promise that resolves to the response containing the list of snapshots.
     */
    ListSnapshots(request: RequestListSnapshots): Promise<ResponseListSnapshots>;
    /**
     * Handles the loading of a snapshot chunk based on the provided request.
     *
     * @param {LoadSnapshotChunkRequest} request - The request object containing details necessary to load the snapshot chunk.
     * @return {Promise<LoadSnapshotChunkResponse>} A promise that resolves to the response containing the snapshot chunk data.
     */
    LoadSnapshotChunk(request: RequestLoadSnapshotChunk): Promise<ResponseLoadSnapshotChunk>;
    /**
     * Fetches a snapshot of an offer based on the provided request details.
     *
     * @param {OfferSnapshotRequest} request - The request object containing necessary parameters to generate the offer snapshot.
     * @return {Promise<OfferSnapshotResponse>} A promise resolving to the response containing the offer snapshot details.
     */
    OfferSnapshot(request: RequestOfferSnapshot): Promise<ResponseOfferSnapshot>;
    /**
     * Applies a snapshot chunk and processes the given data. This is typically used during state synchronization
     * or snapshot restoration to apply portions of the state.
     *
     * @param {ApplySnapshotChunkRequest} request - The snapshot chunk request containing the data to be applied.
     * @return {Promise<ApplySnapshotChunkResponse>} A promise that resolves to the response after applying the snapshot chunk.
     */
    ApplySnapshotChunk(request: RequestApplySnapshotChunk,): Promise<ResponseApplySnapshotChunk>;
    /**
     * Extends the voting period or modifies the vote duration based on the provided request.
     *
     * @param {ExtendVoteRequest} request - The request object containing necessary data to extend the vote.
     *                                       This may include information such as the target vote ID and new time parameters.
     * @return {void} This method does not return a value.
     */
    ExtendVote(request: RequestExtendVote): void;
    /**
     * Verifies the vote extension for a given request.
     *
     * @param {VerifyVoteExtensionRequest} request - The request object containing details for vote verification.
     * @return {Promise<VerifyVoteExtensionResponse>} A promise that resolves to the response of the vote verification.
     */
    VerifyVoteExtension(request: RequestVerifyVoteExtension): Promise<ResponseVerifyVoteExtension>;
    /**
     * Executes a query based on the provided request parameter and returns a promise with the response.
     *
     * @param {QueryRequest} request - The query request object containing the necessary parameters for the query.
     * @return {Promise<QueryResponse>} A promise that resolves to the query response.
     */
    Query(request: RequestQuery): Promise<ResponseQuery>;
}