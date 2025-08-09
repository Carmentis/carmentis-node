import { CHAIN, DATA, ECO, SCHEMAS } from '@cmts-dev/carmentis-sdk/server';

export const DB_CHAIN = 0x00;
export const DB_VB_RADIX = 0x01;
export const DB_TOKEN_RADIX = 0x02;
export const DB_BLOCK_INFORMATION = 0x03;
export const DB_BLOCK_CONTENT = 0x04;
export const DB_MICROBLOCK_VERIFICATION = 0x05;
export const DB_MICROBLOCK_VB_INFORMATION = 0x06;
export const DB_MICROBLOCK_STORAGE = 0x07;
export const DB_VIRTUAL_BLOCKCHAIN_STATE = 0x08;
export const DB_ACCOUNT_STATE = 0x09;
export const DB_ACCOUNT_HISTORY = 0x0a;
export const DB_ACCOUNT_BY_PUBLIC_KEY = 0x0b;
export const DB_VALIDATOR_NODE_BY_ADDRESS = 0x0c;
export const DB_ACCOUNTS = 0x0d;
export const DB_VALIDATOR_NODES = 0x0e;
export const DB_ORGANIZATIONS = 0x0f;
export const DB_APPLICATIONS = 0x10;

export const DB: SCHEMAS.Schema[] = [];

// chain information
DB[DB_CHAIN] = {
    label: 'DbChain',
    definition: [
        { name: 'height', type: DATA.TYPE_UINT48 },
        { name: 'lastBlockTs', type: DATA.TYPE_UINT48 },
        { name: 'nMicroblock', type: DATA.TYPE_UINT48 },
        {
            name: 'objectCounters',
            type: DATA.TYPE_ARRAY_OF | DATA.TYPE_UINT48,
            size: CHAIN.N_VIRTUAL_BLOCKCHAINS,
        },
    ],
};

// content of the VB radix tree
// key: VB identifier
DB[DB_VB_RADIX] = {
    label: 'VbRadix',
    definition: [],
};

// content of the token radix tree
// key: account identifier
DB[DB_TOKEN_RADIX] = {
    label: 'TokenRadix',
    definition: [],
};

// block meta information
// key: block height
DB[DB_BLOCK_INFORMATION] = {
    label: 'BlockInformation',
    definition: [
        { name: 'hash', type: DATA.TYPE_BIN256 },
        { name: 'timestamp', type: DATA.TYPE_UINT48 },
        { name: 'proposerNode', type: DATA.TYPE_BIN256 },
        { name: 'size', type: DATA.TYPE_UINT48 },
        { name: 'nMicroblock', type: DATA.TYPE_UINT48 },
    ],
};

// block content
// key: block height
DB[DB_BLOCK_CONTENT] = {
    label: 'BlockContent',
    definition: [
        {
            name: 'microblocks',
            type: DATA.TYPE_ARRAY_OF | DATA.TYPE_OBJECT,
            definition: [
                { name: 'hash', type: DATA.TYPE_BIN256 },
                { name: 'vbHash', type: DATA.TYPE_BIN256 },
                { name: 'vbType', type: DATA.TYPE_UINT8 },
                { name: 'height', type: DATA.TYPE_UINT48 },
                { name: 'size', type: DATA.TYPE_UINT48 },
                { name: 'nSection', type: DATA.TYPE_UINT48 },
            ],
        },
    ],
};

// microblock verification
// the purpose of this table is to avoid verifying the signatures
// of the same microblock twice
// key: microblock hash
DB[DB_MICROBLOCK_VERIFICATION] = {
    label: 'MicroblockVerification',
    definition: [
      { name: 'status', type: DATA.TYPE_UINT8 }
    ]
};

// microblock VB information
// key: microblock hash
DB[DB_MICROBLOCK_VB_INFORMATION] = SCHEMAS.MICROBLOCK_VB_INFORMATION;

// microblock storage information
// key: microblock hash
DB[DB_MICROBLOCK_STORAGE] = {
    label: 'MicroblockStorage',
    definition: [
      { name: 'expirationDay', type: DATA.TYPE_UINT32 },
      { name: 'fileOffset', type: DATA.TYPE_UINT48 }
    ]
};

// virtual blockchain meta information
// key: VB identifier
DB[DB_VIRTUAL_BLOCKCHAIN_STATE] = SCHEMAS.VIRTUAL_BLOCKCHAIN_STATE;

// current state of an account
// the hash of this record is stored in the account radix tree
// key: accountHash
DB[DB_ACCOUNT_STATE] = SCHEMAS.ACCOUNT_STATE;

// each transaction that occurred on an account
// key: HASH(accountHash + entryHash)
DB[DB_ACCOUNT_HISTORY] = SCHEMAS.ACCOUNT_HISTORY;

// account public key hash -> account VB hash
// key: public key hash
DB[DB_ACCOUNT_BY_PUBLIC_KEY] = {
    label: 'AccountByPublicKey',
    definition: [
      { name: 'accountHash', type: DATA.TYPE_BIN256 }
    ],
};

// Comet address -> validator node VB hash
// key: Comet address
DB[DB_VALIDATOR_NODE_BY_ADDRESS] = {
    label: 'ValidatorNodeByAddress',
    definition: [{ name: 'validatorNodeHash', type: DATA.TYPE_BIN256 }],
};

// tables used as indexes
DB[DB_ACCOUNTS] = {
    label: 'Accounts',
    definition: [],
};
DB[DB_VALIDATOR_NODES] = {
    label: 'ValidatorNodes',
    definition: [],
};
DB[DB_ORGANIZATIONS] = {
    label: 'Organizations',
    definition: [],
};
DB[DB_APPLICATIONS] = {
    label: 'Applications',
    definition: [],
};

// ============================================================================================================================ //
//  Account history references (chainReference field in DB_ACCOUNT_HISTORY)                                                     //
// ============================================================================================================================ //
// reference to a block (for earned fees)
const ACCOUNT_BLOCK_REFERENCE = {
    label: 'AccountBlockReference',
    definition: [{ name: 'height', type: DATA.TYPE_UINT48 }],
};

// reference to a microblock (for paid fees)
const ACCOUNT_MB_REFERENCE = {
    label: 'AccountMbReference',
    definition: [{ name: 'mbHash', type: DATA.TYPE_BIN256 }],
};

// reference to a microblock section (for token transfers)
const ACCOUNT_SECTION_REFERENCE = {
    label: 'AccountSectionReference',
    definition: [
        { name: 'mbHash', type: DATA.TYPE_BIN256 },
        { name: 'sectionIndex', type: DATA.TYPE_UINT16 },
    ],
};

export const ACCOUNT_REF_SCHEMAS: SCHEMAS.Schema[] = [];

ACCOUNT_REF_SCHEMAS[ECO.BK_REF_BLOCK] = ACCOUNT_BLOCK_REFERENCE;
ACCOUNT_REF_SCHEMAS[ECO.BK_REF_MICROBLOCK] = ACCOUNT_MB_REFERENCE;
ACCOUNT_REF_SCHEMAS[ECO.BK_REF_SECTION] = ACCOUNT_SECTION_REFERENCE;
