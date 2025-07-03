export interface CheckTxRequest {
  tx: Uint8Array;
  type: number;
}

export interface CheckTxResponse {
  code: number;
  data: Uint8Array;
  log: string
  info: string;
  gas_wanted: number;
  gas_used: number;
  events: object[];  
  codespace: string;
}

export interface PrepareProposalRequest {
  maxTxBytes: number;
  txs: Uint8Array[];
  localLastCommit: object;
  misbehavior: object[];
  height: number;
  time: Date;
  nextValidatorsHash: Uint8Array;
  proposerAddress: Uint8Array;
}

export interface PrepareProposalResponse {
  txs: Uint8Array[];
}

export interface ProcessProposalRequest {
  txs: Uint8Array[];
  proposedLastCommit: object;
  misbehavior: object[];
  hash: Uint8Array;
  height: number;
  time: Date;
  nextValidatorsHash: Uint8Array;
  proposerAddress: Uint8Array;
}

export interface ProcessProposalResponse {
  status: number;
}

export interface ExtendVoteRequest {
  hash: Uint8Array;
  height: number;
  time: Date;
  txs: Uint8Array[];
  proposedLastCommit: object;
  misbehavior: object[];
  nextValidatorsHash: Uint8Array;
  proposerAddress: Uint8Array;
}

export interface ExtendVoteResponse {
  voteExtension: Uint8Array;
}

export interface VerifyVoteExtensionRequest {
  hash: Uint8Array;
  validatorAddress: Uint8Array;
  height: number;
  voteExtension: Uint8Array;
}

export interface VerifyVoteExtensionResponse {
  status: number;
}

export interface FinalizeBlockRequest {
  txs: Uint8Array[];
  decidedLastCommit: object;
  misbehavior: object[];
  hash: Uint8Array;
  height: number;
  time: Date;
  nextValidatorsHash: Uint8Array;
  proposerAddress: Uint8Array;
  syncingToHeight: number;
}

export interface FinalizeBlockResponse {
  events: object[];
  txResults: object[];
  validatorUpdates: object[];
  consensusParamUpdates: object;
  appHash: Uint8Array;
}
