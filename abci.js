import * as sdk from "@cmts-dev/carmentis-sdk";

const core = sdk.nodeCore;

// ============================================================================================================================ //
//  query()                                                                                                                     //
// ---------------------------------------------------------------------------------------------------------------------------- //
//  Request:                                                                                                                    //
//    data      bytes     Request parameters for the application to interpret analogously to a URI query component. Can be      //
//                        used with or in lieu of path.                                                                         //
//    path      string    A request path for the application to interpret analogously to a URI path component in e.g. routing.  //
//                        Can be used with or in lieu of data. Applications MUST interpret “/store” or any path starting with   //
//                        “/store/” as a query by key on the underlying store, in which case a key SHOULD be specified in       //
//                        data. Applications SHOULD allow queries over specific types like /accounts/... or /votes/....         //
//    height    int64     The block height against which to query (default=0 returns data for the latest committed block).      //
//                        Note that this is the height of the block containing the application’s Merkle root hash, which        //
//                        represents the state as it was after committing the block at Height-1.                                //
//    prove     bool      Return Merkle proof with response if possible.                                                        //
//                                                                                                                              //
//  Answer:                                                                                                                     //
//    code      uint32    Response code.                                                                                        //
//    log       string    The output of the application’s logger.                                                               //
//    info      string    Additional information.                                                                               //
//    index     int64     The index of the key in the tree.                                                                     //
//    key       bytes     The key of the matching data.                                                                         //
//    value     bytes     The value of the matching data.                                                                       //
//    proof_ops ProofOps  Serialized proof for the value data, if requested, to be verified against the app_hash for the        //
//                        given Height.                                                                                         //
//    height    int64     The block height from which data was derived. Note that this is the height of the block containing    //
//                        the application’s Merkle root hash, which represents the state as it was after committing the         //
//                        block at Height-1                                                                                     //
//    codespace string    Namespace for the code.                                                                               //
// ============================================================================================================================ //
async function query(request, respond) {
}

// ============================================================================================================================ //
//  checkTx()                                                                                                                   //
// ---------------------------------------------------------------------------------------------------------------------------- //
//  Request:                                                                                                                    //
//    tx          bytes       The request transaction bytes                                                                     //
//                                                                                                                              //
//    type        CheckTxType One of CheckTx_New or CheckTx_Recheck. CheckTx_New is the default and means that a full check of  //
//                            the transaction is required. CheckTx_Recheck types are used when the mempool is initiating a      //
//                            normal recheck of a transaction.                                                                  //
//                                                                                                                              //
//  Answer:                                                                                                                     //
//    code        uint32      Response code.                                                                                    //
//    data        bytes       Result bytes, if any.                                                                             //
//    log         string      The output of the application’s logger.                                                           //
//    info        string      Additional information.                                                                           //
//    gas_wanted  int64       Amount of gas requested for transaction.                                                          //
//    gas_used    int64       Amount of gas consumed by transaction.                                                            //
//    events      repeated    Type & Key-Value events for indexing transactions (e.g. by account).                              //
//                Event                                                                                                         //
//    codespace   string      Namespace for the code.                                                                           //
// ============================================================================================================================ //
async function checkTx(request, respond) {
}

// ============================================================================================================================ //
//  prepareProposal()                                                                                                           //
// ---------------------------------------------------------------------------------------------------------------------------- //
//  Request:                                                                                                                    //
//    max_tx_bytes          int64               Currently configured maximum size in bytes taken by the modified transactions.  //
//    txs                   repeated bytes      Preliminary list of transactions that have been picked as part of the block to  //
//                                              propose.                                                                        //
//    local_last_commit     ExtendedCommitInfo  Info about the last commit, obtained locally from CometBFT’s data structures.   //
//    misbehavior           repeated            List of information about validators that misbehaved.                           //
//                          Misbehavior                                                                                         //
//    height                int64               The height of the block that will be proposed.                                  //
//    time                  google.protobuf     Timestamp of the block that that will be proposed.                              //
//                          .Timestamp                                                                                          //
//    next_validators_hash  bytes               Merkle root of the next validator set.                                          //
//    proposer_address      bytes               Address of the validator that is creating the proposal.                         //
//                                                                                                                              //
//  Answer:                                                                                                                     //
//    txs                   repeated bytes      Possibly modified list of transactions that have been picked as part of the     //
//                                              proposed block.                                                                 //
// ============================================================================================================================ //
async function prepareProposal(request, respond) {
}

// ============================================================================================================================ //
//  processProposal()                                                                                                           //
// ---------------------------------------------------------------------------------------------------------------------------- //
//  Request:                                                                                                                    //
//    txs                   repeated bytes    List of transactions of the proposed block.                                       //
//    proposed_last_commit  CommitInfo        Info about the last commit, obtained from the information in the proposed block.  //
//    misbehavior           repeated          List of information about validators that misbehaved.                             //
//                          Misbehavior                                                                                         //
//    hash                  bytes             The hash of the proposed block.                                                   //
//    height                int64             The height of the proposed block.                                                 //
//    time                  google.protobuf   Timestamp of the proposed block.                                                  //
//                          .Timestamp                                                                                          //
//    next_validators_hash  bytes             Merkle root of the next validator set.                                            //
//    proposer_address      bytes             Address of the validator that created the proposal.                               //
//                                                                                                                              //
//  Answer:                                                                                                                     //
//    status                ProposalStatus    enum that signals if the application finds the proposal valid.                    //
// ============================================================================================================================ //
async function processProposal(request, respond) {
}

// ============================================================================================================================ //
//  extendVote()                                                                                                                //
// ---------------------------------------------------------------------------------------------------------------------------- //
//  Request:                                                                                                                    //
//    hash                  bytes             The header hash of the proposed block that the vote extension is to refer to.     //
//    height                int64             Height of the proposed block (for sanity check).                                  //
//    time                  google.protobuf   Timestamp of the proposed block (that the extension is to refer to).              //
//                          .Timestamp                                                                                          //
//    txs                   repeated bytes    List of transactions of the block that the extension is to refer to.              //
//    proposed_last_commit  CommitInfo        Info about the last proposed block’s last commit.                                 //
//    misbehavior           repeated          List of information about validators that misbehaved contained in the proposed    //
//                          Misbehavior       block.                                                                            //
//    next_validators_hash  bytes             Merkle root of the next validator set contained in the proposed block.            //
//    proposer_address      bytes             Address of the validator that created the proposal.                               //
//                                                                                                                              //
//  Answer:                                                                                                                     //
//    vote_extension        bytes             Information signed by by CometBFT. Can have 0 length.                             //
// ============================================================================================================================ //
async function extendVote(request, respond) {
}

// ============================================================================================================================ //
//  verifyVoteExtension()                                                                                                       //
// ---------------------------------------------------------------------------------------------------------------------------- //
//  Request:                                                                                                                    //
//    hash                bytes         The hash of the proposed block that the vote extension refers to.                       //
//    validator_address   bytes         Address of the validator that signed the extension.                                     //
//    height              int64         Height of the block (for sanity check).                                                 //
//    vote_extension      bytes         Application-specific information signed by CometBFT. Can have 0 length.                 //
//                                                                                                                              //
//  Answer:                                                                                                                     //
//    status              VerifyStatus  enum signaling if the application accepts the vote extension                            //
// ============================================================================================================================ //
async function verifyVoteExtension(request, respond) {
}

// ============================================================================================================================ //
//  finalizeBlock()                                                                                                             //
// ---------------------------------------------------------------------------------------------------------------------------- //
//  Request:                                                                                                                    //
//    txs                       repeated bytes    List of transactions committed as part of the block.                          //
//    decided_last_commit       CommitInfo        Info about the last commit, obtained from the block that was just decided.    //
//    misbehavior               repeated          List of information about validators that misbehaved.                         //
//                              Misbehavior                                                                                     //
//    hash                      bytes             The block’s hash.                                                             //
//    height                    int64             The height of the finalized block.                                            //
//    time                      google.protobuf   Timestamp of the finalized block.                                             //
//                              .Timestamp                                                                                      //
//    next_validators_hash      bytes             Merkle root of the next validator set.                                        //
//    proposer_address          bytes             Address of the validator that created the proposal.                           //
//                                                                                                                              //
//  Answer:                                                                                                                     //
//    events                    repeated          Type & Key-Value events for indexing                                          //
//                              Event                                                                                           //
//    tx_results                repeated          List of structures containing the data resulting from executing the           //
//                              ExecTxResult      transactions                                                                  //
//    validator_updates         repeated          Changes to validator set (set voting power to 0 to remove).                   //
//                              ValidatorUpdate                                                                                 //
//    consensus_param_updates   ConsensusParams   Changes to gas, size, and other consensus-related parameters.                 //
//    app_hash                  bytes             The Merkle root hash of the application state.                                //
// ============================================================================================================================ //
async function finalizeBlock(request, respond) {
}

// ============================================================================================================================ //
//  commit()                                                                                                                    //
// ---------------------------------------------------------------------------------------------------------------------------- //
//  Request:                                                                                                                    //
//    (none)                                                                                                                    //
//                                                                                                                              //
//  Answer:                                                                                                                     //
//    retain_height  int64    Blocks below this height may be removed. Defaults to 0 (retain all).                              //
// ============================================================================================================================ //
async function commit(request, respond) {
}
