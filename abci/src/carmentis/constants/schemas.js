import * as sdk from "../index.mjs";

const { CHAIN, DATA, ECO, SCHEMAS } = sdk.constants;

export const DB_CHAIN                    = 0x00;
export const DB_VB_RADIX                 = 0x01;
export const DB_TOKEN_RADIX              = 0x02;
export const DB_VALIDATOR                = 0x03;
export const DB_BLOCK_INFORMATION        = 0x04;
export const DB_BLOCK_CONTENT            = 0x05;
export const DB_MICROBLOCK_VERIFICATION  = 0x06;
export const DB_MICROBLOCK_INFORMATION   = 0x07;
export const DB_VIRTUAL_BLOCKCHAIN_STATE = 0x08;
export const DB_ACCOUNT_STATE            = 0x09;
export const DB_ACCOUNT_HISTORY          = 0x0A;
export const DB_ACCOUNT_BY_PUBLIC_KEY    = 0x0B;
export const DB_ACCOUNTS                 = 0x0C;
export const DB_VALIDATOR_NODES          = 0x0D;
export const DB_ORGANIZATIONS            = 0x0E;
export const DB_APPLICATIONS             = 0x0F;

export const DB = {
  // chain information
  [ DB_CHAIN ] : [
    { name: "height",         type: DATA.TYPE_UINT48 },
    { name: "lastBlockTs",    type: DATA.TYPE_UINT48 },
    { name: "nMicroblock",    type: DATA.TYPE_UINT48 },
    { name: "objectCounters", type: DATA.TYPE_ARRAY_OF | DATA.TYPE_UINT48, size: CHAIN.N_VIRTUAL_BLOCKCHAINS }
  ],

  // validator: Comet address -> Carmentis ID
  [ DB_VALIDATOR ] : [
    { name: "validatorNodeId", type: DATA.TYPE_BIN256 }
  ],

  // block meta information
  // key: block height
  [ DB_BLOCK_INFORMATION ] : [
    { name: "hash",         type: DATA.TYPE_BIN256 },
    { name: "timestamp",    type: DATA.TYPE_UINT48 },
    { name: "proposerNode", type: DATA.TYPE_BIN256 },
    { name: "size",         type: DATA.TYPE_UINT48 },
    { name: "nMicroblock",  type: DATA.TYPE_UINT48 }
  ],

  // block content
  // key: block height
  [ DB_BLOCK_CONTENT ] : [
    {
      name: "microblocks",
      type: DATA.TYPE_ARRAY_OF | DATA.TYPE_OBJECT,
      schema: [
        { name: "hash",     type: DATA.TYPE_BIN256 },
        { name: "vbHash",   type: DATA.TYPE_BIN256 },
        { name: "vbType",   type: DATA.TYPE_UINT8 },
        { name: "height",   type: DATA.TYPE_UINT48 },
        { name: "size",     type: DATA.TYPE_UINT48 },
        { name: "nSection", type: DATA.TYPE_UINT48 }
      ]
    }
  ],

  // microblock verification
  // the purpose of this table is to avoid verifying the signatures
  // of the same microblock twice
  // key: microblock hash
  [ DB_MICROBLOCK_VERIFICATION ] : [
    { name: "status", type: DATA.TYPE_UINT8 }
  ],

  // microblock information
  // key: microblock hash
  [ DB_MICROBLOCK_INFORMATION ] : SCHEMAS.MICROBLOCK_INFORMATION,

  // virtual blockchain meta information
  // key: VB identifier
  [ DB_VIRTUAL_BLOCKCHAIN_STATE ] : SCHEMAS.VIRTUAL_BLOCKCHAIN_STATE,

  // current state of an account
  // the hash of this record is stored in the account radix tree
  // key: accountHash
  [ DB_ACCOUNT_STATE ] : [
    { name: "height",          type: DATA.TYPE_UINT48 },
    { name: "balance",         type: DATA.TYPE_UINT48 },
    { name: "lastHistoryHash", type: DATA.TYPE_BIN256 }
  ],

  // each transaction that occurred on an account
  // key: HASH(accountHash + entryHash)
  [ DB_ACCOUNT_HISTORY ] : [
    { name: "height",              type: DATA.TYPE_UINT48 },
    { name: "previousHistoryHash", type: DATA.TYPE_BIN256 },
    { name: "type",                type: DATA.TYPE_UINT8 },
    { name: "timestamp",           type: DATA.TYPE_UINT48 },
    { name: "linkedAccount",       type: DATA.TYPE_BIN256 },
    { name: "amount",              type: DATA.TYPE_UINT48 },
    { name: "chainReference",      type: DATA.TYPE_BINARY }
  ],

  // account public key hash -> account VB hash
  // key: public key hash
  [ DB_ACCOUNT_BY_PUBLIC_KEY ] : [
    { name: "accountHash", type: DATA.TYPE_BIN256 }
  ],

  // tables used as indexes
  [ DB_ACCOUNTS        ]: [],
  [ DB_VALIDATOR_NODES ]: [],
  [ DB_ORGANIZATIONS   ]: [],
  [ DB_APPLICATIONS    ]: []
};

// ============================================================================================================================ //
//  Account history references (chainReference field in DB_ACCOUNT_HISTORY)                                                     //
// ============================================================================================================================ //
// reference to a block (for earned fees)
const ACCOUNT_BLOCK_REFERENCE = [
  { name: "height", type: DATA.TYPE_UINT48 }
];

// reference to a microblock (for paid fees)
const ACCOUNT_MB_REFERENCE = [
  { name: "mbHash", type: DATA.TYPE_BIN256 }
];

// reference to a microblock section (for token transfers)
const ACCOUNT_SECTION_REFERENCE = [
  { name: "mbHash",       type: DATA.TYPE_BIN256 },
  { name: "sectionIndex", type: DATA.TYPE_UINT16 }
];

export const ACCOUNT_REF_SCHEMAS = {
  [ ECO.BK_REF_BLOCK ]: ACCOUNT_BLOCK_REFERENCE,
  [ ECO.BK_REF_MICROBLOCK ]: ACCOUNT_MB_REFERENCE,
  [ ECO.BK_REF_SECTION ]: ACCOUNT_SECTION_REFERENCE
};
