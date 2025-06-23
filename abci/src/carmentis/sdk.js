import { etc, verify as verify$2, sign as sign$2, getPublicKey } from '@noble/secp256k1';

const TYPE_UNKNOWN = 0x00;
const TYPE_ARRAY = 0x01;
const TYPE_OBJECT = 0x02;
const TYPE_STRING = 0x03;
const TYPE_NUMBER = 0x04;
const TYPE_BOOLEAN = 0x05;
const TYPE_NULL = 0x06;
const TYPE_UINT8 = 0x07;
const TYPE_UINT16 = 0x08;
const TYPE_UINT24 = 0x09;
const TYPE_UINT32 = 0x0A;
const TYPE_UINT48 = 0x0B;
const TYPE_BINARY = 0x0C;
const TYPE_BIN256 = 0x0D;
const TYPE_HASH_STR = 0x0E;
const TYPE_MAIN = 0x1F;
const TYPE_ARRAY_OF = 0x20;
const TYPE_NAMES = [
    "unknown",
    "array",
    "object",
    "string",
    "number",
    "boolean",
    "null",
    "uint8",
    "uint16",
    "uint24",
    "uint32",
    "uint48",
    "binary",
    "bin256",
    "hashString"
];
const HASHABLE = 0x01;
const MASKABLE = 0x02;
const PROPERTIES = 0x03;
const REDACTED = 0x04;
const HASHED = 0x08;
const MASKED = 0x10;
const FORMAT = 0x1C;

var data = /*#__PURE__*/Object.freeze({
    __proto__: null,
    FORMAT: FORMAT,
    HASHABLE: HASHABLE,
    HASHED: HASHED,
    MASKABLE: MASKABLE,
    MASKED: MASKED,
    PROPERTIES: PROPERTIES,
    REDACTED: REDACTED,
    TYPE_ARRAY: TYPE_ARRAY,
    TYPE_ARRAY_OF: TYPE_ARRAY_OF,
    TYPE_BIN256: TYPE_BIN256,
    TYPE_BINARY: TYPE_BINARY,
    TYPE_BOOLEAN: TYPE_BOOLEAN,
    TYPE_HASH_STR: TYPE_HASH_STR,
    TYPE_MAIN: TYPE_MAIN,
    TYPE_NAMES: TYPE_NAMES,
    TYPE_NULL: TYPE_NULL,
    TYPE_NUMBER: TYPE_NUMBER,
    TYPE_OBJECT: TYPE_OBJECT,
    TYPE_STRING: TYPE_STRING,
    TYPE_UINT16: TYPE_UINT16,
    TYPE_UINT24: TYPE_UINT24,
    TYPE_UINT32: TYPE_UINT32,
    TYPE_UINT48: TYPE_UINT48,
    TYPE_UINT8: TYPE_UINT8,
    TYPE_UNKNOWN: TYPE_UNKNOWN
});

const MAGIC_STRING = "CMTS";
const PROTOCOL_VERSION = 1;
const VB_ACCOUNT = 0;
const VB_VALIDATOR_NODE = 1;
const VB_ORGANIZATION = 2;
const VB_APPLICATION = 3;
const VB_APP_LEDGER = 4;
const N_VIRTUAL_BLOCKCHAINS = 5;
const VB_NAME = [
    "account",
    "validator node",
    "organization",
    "application",
    "application ledger"
];
const MAX_MICROBLOCK_PAST_DELAY = 300;
const MAX_MICROBLOCK_FUTURE_DELAY = 60;
// The MB is invalid and cannot be made valid under any circumstances.
const MB_STATUS_UNRECOVERABLE_ERROR = 1;
// The MB is invalid because of its timestamp but may become valid. (Under normal operation, this only applies
// to a MB "too far in the future". However, the timestamp error may also be caused by a faulty system clock on
// the node itself, in which case a MB wrongly declared as "too far in the past" may become valid once the node
// clock is correctly synchronized.)
const MB_STATUS_TIMESTAMP_ERROR = 2;
// The MB is invalid because the previous hash declared its in header does not exist yet. It may become valid if
// this hash is created.
const MB_STATUS_PREVIOUS_HASH_ERROR = 3;

var chain = /*#__PURE__*/Object.freeze({
    __proto__: null,
    MAGIC_STRING: MAGIC_STRING,
    MAX_MICROBLOCK_FUTURE_DELAY: MAX_MICROBLOCK_FUTURE_DELAY,
    MAX_MICROBLOCK_PAST_DELAY: MAX_MICROBLOCK_PAST_DELAY,
    MB_STATUS_PREVIOUS_HASH_ERROR: MB_STATUS_PREVIOUS_HASH_ERROR,
    MB_STATUS_TIMESTAMP_ERROR: MB_STATUS_TIMESTAMP_ERROR,
    MB_STATUS_UNRECOVERABLE_ERROR: MB_STATUS_UNRECOVERABLE_ERROR,
    N_VIRTUAL_BLOCKCHAINS: N_VIRTUAL_BLOCKCHAINS,
    PROTOCOL_VERSION: PROTOCOL_VERSION,
    VB_ACCOUNT: VB_ACCOUNT,
    VB_APPLICATION: VB_APPLICATION,
    VB_APP_LEDGER: VB_APP_LEDGER,
    VB_NAME: VB_NAME,
    VB_ORGANIZATION: VB_ORGANIZATION,
    VB_VALIDATOR_NODE: VB_VALIDATOR_NODE
});

const MSG_ANS_ERROR = 0xFF;
const ERROR = [
    { name: "type", type: TYPE_UINT8 },
    { name: "id", type: TYPE_UINT8 },
    { name: "arg", type: TYPE_STRING | TYPE_ARRAY }
];
// ============================================================================================================================ //
//  Record description                                                                                                          //
// ============================================================================================================================ //
const RECORD_ACTOR = [
    { name: "name", type: TYPE_STRING }
];
const RECORD_CHANNEL = [
    { name: "name", type: TYPE_STRING },
    { name: "public", type: TYPE_BOOLEAN }
];
const RECORD_CHANNEL_ASSIGNATION = [
    { name: "fieldPath", type: TYPE_STRING },
    { name: "channelName", type: TYPE_STRING }
];
const RECORD_ACTOR_ASSIGNATION = [
    { name: "actorName", type: TYPE_STRING },
    { name: "channelName", type: TYPE_STRING }
];
const RECORD_MASKED_PART = [
    { name: "position", type: TYPE_UINT32 },
    { name: "length", type: TYPE_UINT32 },
    { name: "replacementString", type: TYPE_STRING }
];
const RECORD_MASKABLE_FIELD = [
    { name: "fieldPath", type: TYPE_STRING },
    { name: "maskedParts", type: TYPE_OBJECT | TYPE_ARRAY_OF, schema: RECORD_MASKED_PART }
];
const RECORD_HASHABLE_FIELD = [
    { name: "fieldPath", type: TYPE_STRING }
];
const RECORD_DESCRIPTION = [
    { name: "virtualBlockchainId", type: TYPE_STRING, size: 32, optional: true },
    { name: "data", type: TYPE_OBJECT, unspecifiedSchema: true },
    { name: "actors", type: TYPE_OBJECT | TYPE_ARRAY_OF, optional: true, schema: RECORD_ACTOR },
    { name: "channels", type: TYPE_OBJECT | TYPE_ARRAY_OF, optional: true, schema: RECORD_CHANNEL },
    { name: "channelAssignations", type: TYPE_OBJECT | TYPE_ARRAY_OF, optional: true, schema: RECORD_CHANNEL_ASSIGNATION },
    { name: "actorAssignations", type: TYPE_OBJECT | TYPE_ARRAY_OF, optional: true, schema: RECORD_ACTOR_ASSIGNATION },
    { name: "hashableFields", type: TYPE_OBJECT | TYPE_ARRAY_OF, optional: true, schema: RECORD_HASHABLE_FIELD },
    { name: "maskableFields", type: TYPE_OBJECT | TYPE_ARRAY_OF, optional: true, schema: RECORD_MASKABLE_FIELD },
    { name: "author", type: TYPE_STRING },
    { name: "endorser", type: TYPE_STRING, optional: true }
];
// ============================================================================================================================ //
//  Virtual blockchain state                                                                                                    //
// ============================================================================================================================ //
const VIRTUAL_BLOCKCHAIN_STATE = [
    { name: "type", type: TYPE_UINT8 },
    { name: "height", type: TYPE_UINT48 },
    { name: "lastMicroblockHash", type: TYPE_BIN256 },
    { name: "customState", type: TYPE_BINARY }
];
// ============================================================================================================================ //
//  Account state                                                                                                               //
// ============================================================================================================================ //
const ACCOUNT_STATE = [
    { name: "signatureAlgorithmId", type: TYPE_UINT8 },
    { name: "publicKeyHeight", type: TYPE_UINT48 }
];
// ============================================================================================================================ //
//  Validator node state                                                                                                        //
// ============================================================================================================================ //
const VALIDATOR_NODE_STATE = [];
// ============================================================================================================================ //
//  Organization state                                                                                                          //
// ============================================================================================================================ //
const ORGANIZATION_STATE = [
    { name: "signatureAlgorithmId", type: TYPE_UINT8 },
    { name: "publicKeyHeight", type: TYPE_UINT48 },
    { name: "descriptionHeight", type: TYPE_UINT48 }
];
// ============================================================================================================================ //
//  Application state                                                                                                           //
// ============================================================================================================================ //
const APPLICATION_STATE = [];
// ============================================================================================================================ //
//  Application ledger state                                                                                                    //
// ============================================================================================================================ //
const APP_LEDGER_STATE = [];
// ============================================================================================================================ //
//  All state schemas                                                                                                           //
// ============================================================================================================================ //
const STATES = {
    [VB_ACCOUNT]: ACCOUNT_STATE,
    [VB_VALIDATOR_NODE]: VALIDATOR_NODE_STATE,
    [VB_ORGANIZATION]: ORGANIZATION_STATE,
    [VB_APPLICATION]: APPLICATION_STATE,
    [VB_APP_LEDGER]: APP_LEDGER_STATE
};
// ============================================================================================================================ //
//  Microblock                                                                                                                  //
// ============================================================================================================================ //
const MICROBLOCK_HEADER_PREVIOUS_HASH_OFFSET = 12;
const MICROBLOCK_HEADER_BODY_HASH_OFFSET = 57;
const MICROBLOCK_HEADER_SIZE = 89;
const MICROBLOCK_HEADER = [
    { name: "magicString", type: TYPE_STRING, size: 4 }, // +0
    { name: "protocolVersion", type: TYPE_UINT16 }, // +4
    { name: "height", type: TYPE_UINT48 }, // +6
    { name: "previousHash", type: TYPE_BIN256 }, // +12
    { name: "timestamp", type: TYPE_UINT48 }, // +44
    { name: "gas", type: TYPE_UINT24 }, // +50
    { name: "gasPrice", type: TYPE_UINT32 }, // +53
    { name: "bodyHash", type: TYPE_BIN256 } // +57
];
const MICROBLOCK_SECTION = [
    { name: "type", type: TYPE_UINT8 },
    { name: "data", type: TYPE_BINARY }
];
const MICROBLOCK_BODY = [
    { name: "body", type: TYPE_ARRAY_OF | TYPE_OBJECT, schema: MICROBLOCK_SECTION }
];
const MICROBLOCK_INFORMATION = [
    { name: "virtualBlockchainId", type: TYPE_BIN256 },
    { name: "virtualBlockchainType", type: TYPE_UINT8 },
    { name: "header", type: TYPE_BINARY }
];
// ============================================================================================================================ //
//  Node messages                                                                                                               //
// ============================================================================================================================ //
const MSG_GET_VIRTUAL_BLOCKCHAIN_UPDATE = 0x00;
const MSG_VIRTUAL_BLOCKCHAIN_UPDATE = 0x01;
const MSG_GET_MICROBLOCK_INFORMATION = 0x02;
const MSG_MICROBLOCK_INFORMATION = 0x03;
const MSG_GET_MICROBLOCK_BODYS = 0x04;
const MSG_MICROBLOCK_BODYS = 0x05;
const NODE_MESSAGE_NAMES = [
    "GET_VIRTUAL_BLOCKCHAIN_UPDATE",
    "VIRTUAL_BLOCKCHAIN_UPDATE",
    "GET_MICROBLOCK_INFORMATION",
    "MICROBLOCK_INFORMATION",
    "GET_MICROBLOCK_BODYS",
    "MICROBLOCK_BODYS"
];
const NODE_MESSAGES = {
    [MSG_GET_VIRTUAL_BLOCKCHAIN_UPDATE]: [
        { name: "virtualBlockchainId", type: TYPE_BIN256 },
        { name: "knownHeight", type: TYPE_UINT48 }
    ],
    [MSG_VIRTUAL_BLOCKCHAIN_UPDATE]: [
        { name: "exists", type: TYPE_BOOLEAN },
        { name: "changed", type: TYPE_BOOLEAN },
        { name: "stateData", type: TYPE_BINARY },
        { name: "headers", type: TYPE_ARRAY_OF | TYPE_BINARY }
    ],
    [MSG_GET_MICROBLOCK_INFORMATION]: [
        { name: "hash", type: TYPE_BIN256 }
    ],
    [MSG_MICROBLOCK_INFORMATION]: MICROBLOCK_INFORMATION,
    [MSG_GET_MICROBLOCK_BODYS]: [
        { name: "hashes", type: TYPE_ARRAY_OF | TYPE_BIN256 }
    ],
    [MSG_MICROBLOCK_BODYS]: [
        {
            name: "list",
            type: TYPE_ARRAY_OF | TYPE_OBJECT,
            schema: [
                { name: "hash", type: TYPE_BIN256 },
                { name: "body", type: TYPE_BINARY }
            ]
        }
    ]
};
// ============================================================================================================================ //
//  Wallet interface                                                                                                            //
// ============================================================================================================================ //
const WI_MAX_SERVER_URL_LENGTH = 100;
const WI_QR_CODE = [
    { name: "qrId", type: TYPE_BIN256 },
    { name: "timestamp", type: TYPE_UINT48 },
    { name: "serverUrl", type: TYPE_STRING, size: WI_MAX_SERVER_URL_LENGTH }
];
// client -> server
const WIMSG_REQUEST = 0x0;
// server -> client
const WIMSG_UPDATE_QR = 0x1;
const WIMSG_CONNECTION_TOKEN = 0x2;
const WIMSG_FORWARDED_ANSWER = 0x3;
// wallet -> server
const WIMSG_GET_CONNECTION_INFO = 0x4;
const WIMSG_ANSWER = 0x5;
// server -> wallet
const WIMSG_CONNECTION_INFO = 0x6;
const WIMSG_CONNECTION_ACCEPTED = 0x7;
const WIMSG_FORWARDED_REQUEST = 0x8;
const WI_MESSAGES = {
    [WIMSG_REQUEST]: [
        { name: "requestType", type: TYPE_UINT8 },
        { name: "request", type: TYPE_BINARY },
        { name: "deviceId", type: TYPE_BIN256 },
        { name: "withToken", type: TYPE_UINT8 },
        { name: "token", type: TYPE_BIN256, condition: parent => parent.withToken }
    ],
    [WIMSG_UPDATE_QR]: [
        { name: "qrId", type: TYPE_BIN256 },
        { name: "timestamp", type: TYPE_UINT48 }
    ],
    [WIMSG_CONNECTION_TOKEN]: [
        { name: "token", type: TYPE_BIN256 }
    ],
    [WIMSG_FORWARDED_ANSWER]: [
        { name: "answerType", type: TYPE_UINT8 },
        { name: "answer", type: TYPE_BINARY }
    ],
    [WIMSG_GET_CONNECTION_INFO]: [
        { name: "qrId", type: TYPE_BIN256 }
    ],
    [WIMSG_ANSWER]: [
        { name: "answerType", type: TYPE_UINT8 },
        { name: "answer", type: TYPE_BINARY }
    ],
    [WIMSG_CONNECTION_INFO]: [],
    [WIMSG_CONNECTION_ACCEPTED]: [
        { name: "qrId", type: TYPE_BIN256 }
    ],
    [WIMSG_FORWARDED_REQUEST]: [
        { name: "requestType", type: TYPE_UINT8 },
        { name: "request", type: TYPE_BINARY }
    ]
};
const WIRQ_AUTH_BY_PUBLIC_KEY = 0x0;
const WIRQ_DATA_APPROVAL = 0x1;
const WIRQ_GET_EMAIL = 0x2;
const WIRQ_GET_USER_DATA = 0x3;
const WI_REQUESTS = {
    [WIRQ_AUTH_BY_PUBLIC_KEY]: [
        { name: "challenge", type: TYPE_BIN256 }
    ],
    [WIRQ_GET_EMAIL]: [],
    [WIRQ_GET_USER_DATA]: [
        { name: "requiredData", type: TYPE_ARRAY | TYPE_STRING }
    ],
    [WIRQ_DATA_APPROVAL]: [
        { name: "dataId", type: TYPE_BINARY },
        { name: "serverUrl", type: TYPE_STRING }
    ]
};
const WI_ANSWERS = {
    [WIRQ_AUTH_BY_PUBLIC_KEY]: [
        { name: "publicKey", type: TYPE_BINARY },
        { name: "signature", type: TYPE_BINARY }
    ],
    [WIRQ_GET_EMAIL]: [
        { name: "email", type: TYPE_STRING }
    ],
    [WIRQ_DATA_APPROVAL]: [
        { name: "vbHash", type: TYPE_BINARY },
        { name: "mbHash", type: TYPE_BINARY },
        { name: "height", type: TYPE_UINT48 }
    ],
    [WIRQ_GET_USER_DATA]: [
        { name: "userData", type: TYPE_STRING | TYPE_ARRAY }
    ]
};
// ============================================================================================================================ //
//  Wallet <-> operator network messages                                                                                        //
// ============================================================================================================================ //
const MSG_APPROVAL_HANDSHAKE = 0x00;
const MSG_ACTOR_KEY = 0x01;
const MSG_APPROVAL_SIGNATURE = 0x02;
const MSG_ANS_ACTOR_KEY_REQUIRED = 0x80;
const MSG_ANS_APPROVAL_DATA = 0x81;
const MSG_ANS_APPROVAL_SIGNATURE = 0x82;
const WALLET_OP_MESSAGES = {
    [MSG_APPROVAL_HANDSHAKE]: [
        { name: "dataId", type: TYPE_BINARY }
    ],
    [MSG_ACTOR_KEY]: [
        { name: "dataId", type: TYPE_BINARY },
        { name: "actorKey", type: TYPE_BINARY }
    ],
    [MSG_APPROVAL_SIGNATURE]: [
        { name: "dataId", type: TYPE_BINARY },
        { name: "signature", type: TYPE_BINARY }
    ],
    [MSG_ANS_ACTOR_KEY_REQUIRED]: [
        { name: "genesisSeed", type: TYPE_BINARY }
    ],
    [MSG_ANS_APPROVAL_DATA]: [
        { name: "data", type: TYPE_BINARY }
    ],
    [MSG_ANS_APPROVAL_SIGNATURE]: [
        { name: "vbHash", type: TYPE_BINARY },
        { name: "mbHash", type: TYPE_BINARY },
        { name: "height", type: TYPE_NUMBER }
    ],
    [MSG_ANS_ERROR]: [
        { name: "error", type: TYPE_OBJECT, schema: ERROR }
    ]
};

var schemas = /*#__PURE__*/Object.freeze({
    __proto__: null,
    ACCOUNT_STATE: ACCOUNT_STATE,
    APPLICATION_STATE: APPLICATION_STATE,
    APP_LEDGER_STATE: APP_LEDGER_STATE,
    ERROR: ERROR,
    MICROBLOCK_BODY: MICROBLOCK_BODY,
    MICROBLOCK_HEADER: MICROBLOCK_HEADER,
    MICROBLOCK_HEADER_BODY_HASH_OFFSET: MICROBLOCK_HEADER_BODY_HASH_OFFSET,
    MICROBLOCK_HEADER_PREVIOUS_HASH_OFFSET: MICROBLOCK_HEADER_PREVIOUS_HASH_OFFSET,
    MICROBLOCK_HEADER_SIZE: MICROBLOCK_HEADER_SIZE,
    MICROBLOCK_INFORMATION: MICROBLOCK_INFORMATION,
    MICROBLOCK_SECTION: MICROBLOCK_SECTION,
    MSG_ACTOR_KEY: MSG_ACTOR_KEY,
    MSG_ANS_ACTOR_KEY_REQUIRED: MSG_ANS_ACTOR_KEY_REQUIRED,
    MSG_ANS_APPROVAL_DATA: MSG_ANS_APPROVAL_DATA,
    MSG_ANS_APPROVAL_SIGNATURE: MSG_ANS_APPROVAL_SIGNATURE,
    MSG_ANS_ERROR: MSG_ANS_ERROR,
    MSG_APPROVAL_HANDSHAKE: MSG_APPROVAL_HANDSHAKE,
    MSG_APPROVAL_SIGNATURE: MSG_APPROVAL_SIGNATURE,
    MSG_GET_MICROBLOCK_BODYS: MSG_GET_MICROBLOCK_BODYS,
    MSG_GET_MICROBLOCK_INFORMATION: MSG_GET_MICROBLOCK_INFORMATION,
    MSG_GET_VIRTUAL_BLOCKCHAIN_UPDATE: MSG_GET_VIRTUAL_BLOCKCHAIN_UPDATE,
    MSG_MICROBLOCK_BODYS: MSG_MICROBLOCK_BODYS,
    MSG_MICROBLOCK_INFORMATION: MSG_MICROBLOCK_INFORMATION,
    MSG_VIRTUAL_BLOCKCHAIN_UPDATE: MSG_VIRTUAL_BLOCKCHAIN_UPDATE,
    NODE_MESSAGES: NODE_MESSAGES,
    NODE_MESSAGE_NAMES: NODE_MESSAGE_NAMES,
    ORGANIZATION_STATE: ORGANIZATION_STATE,
    RECORD_DESCRIPTION: RECORD_DESCRIPTION,
    STATES: STATES,
    VALIDATOR_NODE_STATE: VALIDATOR_NODE_STATE,
    VIRTUAL_BLOCKCHAIN_STATE: VIRTUAL_BLOCKCHAIN_STATE,
    WALLET_OP_MESSAGES: WALLET_OP_MESSAGES,
    WIMSG_ANSWER: WIMSG_ANSWER,
    WIMSG_CONNECTION_ACCEPTED: WIMSG_CONNECTION_ACCEPTED,
    WIMSG_CONNECTION_INFO: WIMSG_CONNECTION_INFO,
    WIMSG_CONNECTION_TOKEN: WIMSG_CONNECTION_TOKEN,
    WIMSG_FORWARDED_ANSWER: WIMSG_FORWARDED_ANSWER,
    WIMSG_FORWARDED_REQUEST: WIMSG_FORWARDED_REQUEST,
    WIMSG_GET_CONNECTION_INFO: WIMSG_GET_CONNECTION_INFO,
    WIMSG_REQUEST: WIMSG_REQUEST,
    WIMSG_UPDATE_QR: WIMSG_UPDATE_QR,
    WIRQ_AUTH_BY_PUBLIC_KEY: WIRQ_AUTH_BY_PUBLIC_KEY,
    WIRQ_DATA_APPROVAL: WIRQ_DATA_APPROVAL,
    WIRQ_GET_EMAIL: WIRQ_GET_EMAIL,
    WIRQ_GET_USER_DATA: WIRQ_GET_USER_DATA,
    WI_ANSWERS: WI_ANSWERS,
    WI_MAX_SERVER_URL_LENGTH: WI_MAX_SERVER_URL_LENGTH,
    WI_MESSAGES: WI_MESSAGES,
    WI_QR_CODE: WI_QR_CODE,
    WI_REQUESTS: WI_REQUESTS
});

// tokens
const TOKEN_NAME = "CMTS";
const TOKEN = 100000;
const CENTITOKEN = 1000;
const MILLITOKEN = 100;
const INITIAL_OFFER = 1000000000 * TOKEN;
// gas
const MINIMUM_GAS_PRICE = 1;
const MAXIMUM_GAS_PRICE = Math.pow(2, 29) - 1;
const FIXED_GAS_FEE = 1000;
const GAS_PER_BYTE = 1;
// bookkeeping operations
const BK_PLUS = 0x1;
const BK_PAID_FEES = 0x0;
const BK_SENT_ISSUANCE = 0x2;
const BK_SALE = 0x4;
const BK_SENT_PAYMENT = 0x6;
const BK_EARNED_FEES = BK_PLUS | BK_PAID_FEES;
const BK_RECEIVED_ISSUANCE = BK_PLUS | BK_SENT_ISSUANCE;
const BK_PURCHASE = BK_PLUS | BK_SALE;
const BK_RECEIVED_PAYMENT = BK_PLUS | BK_SENT_PAYMENT;
const BK_REF_BLOCK = 0;
const BK_REF_MICROBLOCK = 1;
const BK_REF_SECTION = 2;
const BK_REFERENCES = [
    /* BK_PAID_FEES         */ BK_REF_MICROBLOCK,
    /* BK_EARNED_FEES       */ BK_REF_BLOCK,
    /* BK_SENT_ISSUANCE     */ BK_REF_SECTION,
    /* BK_RECEIVED_ISSUANCE */ BK_REF_SECTION,
    /* BK_SALE              */ BK_REF_SECTION,
    /* BK_PURCHASE          */ BK_REF_SECTION,
    /* BK_SENT_PAYMENT      */ BK_REF_SECTION,
    /* BK_RECEIVED_PAYMENT  */ BK_REF_SECTION
];
const BK_NAMES = [
    /* BK_PAID_FEES         */ "Paid fees",
    /* BK_EARNED_FEES       */ "Earned fees",
    /* BK_SENT_ISSUANCE     */ "Initial token issuance",
    /* BK_RECEIVED_ISSUANCE */ "Initial token issuance",
    /* BK_SALE              */ "Sale",
    /* BK_PURCHASE          */ "Purchase",
    /* BK_SENT_PAYMENT      */ "Sent payment",
    /* BK_RECEIVED_PAYMENT  */ "Received payment"
];
// special accounts
const ACCOUNT_BURNT_TOKENS = 0x00;
const ACCOUNT_LOCKED_TOKENS = 0x01;
const ACCOUNT_BLOCK_FEES = 0x02;
const SPECIAL_ACCOUNT_NAMES = [
    "Burnt tokens",
    "Locked tokens",
    "Block fees"
];

var economics = /*#__PURE__*/Object.freeze({
    __proto__: null,
    ACCOUNT_BLOCK_FEES: ACCOUNT_BLOCK_FEES,
    ACCOUNT_BURNT_TOKENS: ACCOUNT_BURNT_TOKENS,
    ACCOUNT_LOCKED_TOKENS: ACCOUNT_LOCKED_TOKENS,
    BK_EARNED_FEES: BK_EARNED_FEES,
    BK_NAMES: BK_NAMES,
    BK_PAID_FEES: BK_PAID_FEES,
    BK_PLUS: BK_PLUS,
    BK_PURCHASE: BK_PURCHASE,
    BK_RECEIVED_ISSUANCE: BK_RECEIVED_ISSUANCE,
    BK_RECEIVED_PAYMENT: BK_RECEIVED_PAYMENT,
    BK_REFERENCES: BK_REFERENCES,
    BK_REF_BLOCK: BK_REF_BLOCK,
    BK_REF_MICROBLOCK: BK_REF_MICROBLOCK,
    BK_REF_SECTION: BK_REF_SECTION,
    BK_SALE: BK_SALE,
    BK_SENT_ISSUANCE: BK_SENT_ISSUANCE,
    BK_SENT_PAYMENT: BK_SENT_PAYMENT,
    CENTITOKEN: CENTITOKEN,
    FIXED_GAS_FEE: FIXED_GAS_FEE,
    GAS_PER_BYTE: GAS_PER_BYTE,
    INITIAL_OFFER: INITIAL_OFFER,
    MAXIMUM_GAS_PRICE: MAXIMUM_GAS_PRICE,
    MILLITOKEN: MILLITOKEN,
    MINIMUM_GAS_PRICE: MINIMUM_GAS_PRICE,
    SPECIAL_ACCOUNT_NAMES: SPECIAL_ACCOUNT_NAMES,
    TOKEN: TOKEN,
    TOKEN_NAME: TOKEN_NAME
});

// ============================================================================================================================ //
//  Constraints                                                                                                                 //
// ============================================================================================================================ //
const ZERO = 0;
const ONE = 1;
const AT_LEAST_ONE = 2;
const AT_MOST_ONE = 3;
const ANY = 4;
const CONSTRAINT_NAMES = [
    "no sections",
    "exactly one section",
    "at least one section",
    "at most one section",
    "any number of sections"
];
// ============================================================================================================================ //
//  Account                                                                                                                     //
// ============================================================================================================================ //
const ACCOUNT_SIG_ALGORITHM = 0;
const ACCOUNT_PUBLIC_KEY = 1;
const ACCOUNT_TOKEN_ISSUANCE = 2;
const ACCOUNT_CREATION = 3;
const ACCOUNT_TRANSFER = 4;
const ACCOUNT_SIGNATURE = 5;
const ACCOUNT = {
    [ACCOUNT_SIG_ALGORITHM]: {
        label: "ACCOUNT_SIG_ALGORITHM",
        schema: [
            { name: "algorithmId", type: TYPE_UINT8 }
        ]
    },
    [ACCOUNT_PUBLIC_KEY]: {
        label: "ACCOUNT_PUBLIC_KEY",
        schema: [
            { name: "publicKey", type: TYPE_BINARY }
        ]
    },
    [ACCOUNT_TOKEN_ISSUANCE]: {
        label: "ACCOUNT_TOKEN_ISSUANCE",
        schema: [
            { name: "amount", type: TYPE_UINT48 }
        ]
    },
    [ACCOUNT_CREATION]: {
        label: "ACCOUNT_CREATION",
        schema: [
            { name: "sellerAccount", type: TYPE_BIN256 },
            { name: "amount", type: TYPE_UINT48 }
        ]
    },
    [ACCOUNT_TRANSFER]: {
        label: "ACCOUNT_TRANSFER",
        schema: [
            { name: "account", type: TYPE_BIN256 },
            { name: "amount", type: TYPE_UINT48 },
            { name: "publicReference", type: TYPE_STRING },
            { name: "privateReference", type: TYPE_STRING }
        ]
    },
    [ACCOUNT_SIGNATURE]: {
        label: "ACCOUNT_SIGNATURE",
        schema: [
            { name: "signature", type: TYPE_BINARY }
        ]
    }
};
// ============================================================================================================================ //
//  Validator node                                                                                                              //
// ============================================================================================================================ //
const VALIDATOR_NODE = {};
// ============================================================================================================================ //
//  Organization                                                                                                                //
// ============================================================================================================================ //
const ORG_SIG_ALGORITHM = 0;
const ORG_PUBLIC_KEY = 1;
const ORG_DESCRIPTION = 2;
const ORG_SERVER = 3;
const ORG_SIGNATURE = 4;
const ORGANIZATION = {
    [ORG_SIG_ALGORITHM]: {
        label: "ORG_SIG_ALGORITHM",
        schema: [
            { name: "algorithmId", type: TYPE_UINT8 }
        ]
    },
    [ORG_PUBLIC_KEY]: {
        label: "ORG_PUBLIC_KEY",
        schema: [
            { name: "publicKey", type: TYPE_BINARY }
        ]
    },
    [ORG_DESCRIPTION]: {
        label: "ORG_DESCRIPTION",
        schema: [
            { name: "name", type: TYPE_STRING },
            { name: "city", type: TYPE_STRING },
            { name: "countryCode", type: TYPE_STRING, size: 2 },
            { name: "website", type: TYPE_STRING }
        ]
    },
    [ORG_SERVER]: {
        label: "ORG_SERVER",
        schema: [
            { name: "endpoint", type: TYPE_STRING }
        ]
    },
    [ORG_SIGNATURE]: {
        label: "ORG_SIGNATURE",
        schema: [
            { name: "signature", type: TYPE_BINARY }
        ]
    }
};
// ============================================================================================================================ //
//  Application                                                                                                                 //
// ============================================================================================================================ //
const APP_SIG_ALGORITHM = 0;
const APP_DECLARATION = 1;
const APP_DESCRIPTION = 2;
const APP_SIGNATURE = 2;
const APPLICATION = {
    [APP_SIG_ALGORITHM]: {
        label: "APP_SIG_ALGORITHM",
        schema: [
            { name: "algorithmId", type: TYPE_UINT8 }
        ]
    },
    [APP_DECLARATION]: {
        label: "APP_DECLARATION",
        schema: [
            { name: "organizationId", type: TYPE_BIN256 }
        ]
    },
    [APP_DESCRIPTION]: {
        label: "APP_DESCRIPTION",
        schema: [
            { name: "name", type: TYPE_STRING },
            { name: "logoUrl", type: TYPE_STRING },
            { name: "homepageUrl", type: TYPE_STRING },
            { name: "description", type: TYPE_STRING }
        ]
    },
    [APP_SIGNATURE]: {
        label: "APP_SIGNATURE",
        schema: [
            { name: "signature", type: TYPE_BINARY }
        ]
    }
};
// ============================================================================================================================ //
//  Application ledger                                                                                                          //
// ============================================================================================================================ //
const APP_LEDGER_SIG_ALGORITHM = 0;
const APP_LEDGER_DECLARATION = 1;
const APP_LEDGER_ACTOR_CREATION = 2;
const APP_LEDGER_CHANNEL_CREATION = 3;
const APP_LEDGER_SHARED_SECRET = 4;
const APP_LEDGER_CHANNEL_INVITATION = 5;
const APP_LEDGER_ACTOR_SUBSCRIPTION = 6;
const APP_LEDGER_PUBLIC_CHANNEL_DATA = 7;
const APP_LEDGER_PRIVATE_CHANNEL_DATA = 8;
const APP_LEDGER_AUTHOR = 9;
const APP_LEDGER_ENDORSER = 10;
const APP_LEDGER_ENDORSER_SIGNATURE = 11;
const APP_LEDGER_AUTHOR_SIGNATURE = 12;
const APP_LEDGER = {
    [APP_LEDGER_SIG_ALGORITHM]: {
        label: "APP_LEDGER_SIG_ALGORITHM",
        schema: [
            { name: "algorithmId", type: TYPE_UINT8 }
        ]
    },
    [APP_LEDGER_DECLARATION]: {
        label: "APP_LEDGER_DECLARATION",
        schema: [
            { name: "applicationId", type: TYPE_BIN256 }
        ]
    },
    [APP_LEDGER_ACTOR_CREATION]: {
        label: "APP_LEDGER_ACTOR_CREATION",
        schema: [
            { name: "id", type: TYPE_UINT8 },
            { name: "type", type: TYPE_UINT8 },
            { name: "name", type: TYPE_STRING }
        ]
    },
    [APP_LEDGER_CHANNEL_CREATION]: {
        label: "APP_LEDGER_CHANNEL_CREATION",
        schema: [
            { name: "id", type: TYPE_UINT8 },
            { name: "isPrivate", type: TYPE_BOOLEAN },
            { name: "keyOwnerId", type: TYPE_UINT8 },
            { name: "name", type: TYPE_STRING }
        ]
    },
    [APP_LEDGER_SHARED_SECRET]: {
        label: "APP_LEDGER_SHARED_SECRET",
        schema: [
            { name: "hostId", type: TYPE_UINT8 },
            { name: "guestId", type: TYPE_UINT8 },
            { name: "encapsulation", type: TYPE_BINARY }
        ]
    },
    [APP_LEDGER_CHANNEL_INVITATION]: {
        label: "APP_LEDGER_CHANNEL_INVITATION",
        schema: [
            { name: "channelId", type: TYPE_UINT8 },
            { name: "hostId", type: TYPE_UINT8 },
            { name: "guestId", type: TYPE_UINT8 },
            { name: "channelKey", type: TYPE_BINARY }
        ]
    },
    [APP_LEDGER_ACTOR_SUBSCRIPTION]: {
        label: "APP_LEDGER_ACTOR_SUBSCRIPTION",
        schema: [
            { name: "actorId", type: TYPE_UINT8 },
            { name: "actorType", type: TYPE_UINT8 },
            { name: "organizationId", type: TYPE_BIN256 },
            { name: "kemPublicKey", type: TYPE_BINARY },
            { name: "signaturePublicKey", type: TYPE_BINARY }
        ]
    },
    [APP_LEDGER_PUBLIC_CHANNEL_DATA]: {
        label: "APP_LEDGER_PUBLIC_CHANNEL_DATA",
        schema: [
            { name: "channelId", type: TYPE_UINT8 },
            { name: "data", type: TYPE_BINARY }
        ]
    },
    [APP_LEDGER_PRIVATE_CHANNEL_DATA]: {
        label: "APP_LEDGER_PRIVATE_CHANNEL_DATA",
        schema: [
            { name: "channelId", type: TYPE_UINT8 },
            { name: "merkleRootHash", type: TYPE_BIN256 },
            { name: "encryptedData", type: TYPE_BINARY }
        ]
    },
    [APP_LEDGER_AUTHOR]: {
        label: "APP_LEDGER_AUTHOR",
        schema: [
            { name: "authorId", type: TYPE_UINT8 }
        ]
    },
    [APP_LEDGER_ENDORSER]: {
        label: "APP_LEDGER_ENDORSER",
        schema: [
            { name: "endorserId", type: TYPE_UINT8 },
            { name: "messageId", type: TYPE_UINT16 }
        ]
    },
    [APP_LEDGER_ENDORSER_SIGNATURE]: {
        label: "APP_LEDGER_ENDORSER_SIGNATURE",
        schema: [
            { name: "signature", type: TYPE_BINARY }
        ]
    },
    [APP_LEDGER_AUTHOR_SIGNATURE]: {
        label: "APP_LEDGER_AUTHOR_SIGNATURE",
        schema: [
            { name: "signature", type: TYPE_BINARY }
        ]
    }
};
// ============================================================================================================================ //
//  All sections                                                                                                                //
// ============================================================================================================================ //
const DEF = {
    [VB_ACCOUNT]: ACCOUNT,
    [VB_VALIDATOR_NODE]: VALIDATOR_NODE,
    [VB_ORGANIZATION]: ORGANIZATION,
    [VB_APPLICATION]: APPLICATION,
    [VB_APP_LEDGER]: APP_LEDGER
};

var sections = /*#__PURE__*/Object.freeze({
    __proto__: null,
    ACCOUNT_CREATION: ACCOUNT_CREATION,
    ACCOUNT_PUBLIC_KEY: ACCOUNT_PUBLIC_KEY,
    ACCOUNT_SIGNATURE: ACCOUNT_SIGNATURE,
    ACCOUNT_SIG_ALGORITHM: ACCOUNT_SIG_ALGORITHM,
    ACCOUNT_TOKEN_ISSUANCE: ACCOUNT_TOKEN_ISSUANCE,
    ACCOUNT_TRANSFER: ACCOUNT_TRANSFER,
    ANY: ANY,
    APP_DECLARATION: APP_DECLARATION,
    APP_DESCRIPTION: APP_DESCRIPTION,
    APP_LEDGER_ACTOR_CREATION: APP_LEDGER_ACTOR_CREATION,
    APP_LEDGER_ACTOR_SUBSCRIPTION: APP_LEDGER_ACTOR_SUBSCRIPTION,
    APP_LEDGER_AUTHOR: APP_LEDGER_AUTHOR,
    APP_LEDGER_AUTHOR_SIGNATURE: APP_LEDGER_AUTHOR_SIGNATURE,
    APP_LEDGER_CHANNEL_CREATION: APP_LEDGER_CHANNEL_CREATION,
    APP_LEDGER_CHANNEL_INVITATION: APP_LEDGER_CHANNEL_INVITATION,
    APP_LEDGER_DECLARATION: APP_LEDGER_DECLARATION,
    APP_LEDGER_ENDORSER: APP_LEDGER_ENDORSER,
    APP_LEDGER_ENDORSER_SIGNATURE: APP_LEDGER_ENDORSER_SIGNATURE,
    APP_LEDGER_PRIVATE_CHANNEL_DATA: APP_LEDGER_PRIVATE_CHANNEL_DATA,
    APP_LEDGER_PUBLIC_CHANNEL_DATA: APP_LEDGER_PUBLIC_CHANNEL_DATA,
    APP_LEDGER_SHARED_SECRET: APP_LEDGER_SHARED_SECRET,
    APP_LEDGER_SIG_ALGORITHM: APP_LEDGER_SIG_ALGORITHM,
    APP_SIGNATURE: APP_SIGNATURE,
    APP_SIG_ALGORITHM: APP_SIG_ALGORITHM,
    AT_LEAST_ONE: AT_LEAST_ONE,
    AT_MOST_ONE: AT_MOST_ONE,
    CONSTRAINT_NAMES: CONSTRAINT_NAMES,
    DEF: DEF,
    ONE: ONE,
    ORG_DESCRIPTION: ORG_DESCRIPTION,
    ORG_PUBLIC_KEY: ORG_PUBLIC_KEY,
    ORG_SERVER: ORG_SERVER,
    ORG_SIGNATURE: ORG_SIGNATURE,
    ORG_SIG_ALGORITHM: ORG_SIG_ALGORITHM,
    ZERO: ZERO
});

// WALLET INTERFACE
const WI_INVALID_SIGNATURE = 0x00;

var errors = /*#__PURE__*/Object.freeze({
    __proto__: null,
    WI_INVALID_SIGNATURE: WI_INVALID_SIGNATURE
});

var constants = /*#__PURE__*/Object.freeze({
    __proto__: null,
    CHAIN: chain,
    DATA: data,
    ECO: economics,
    ERRORS: errors,
    SCHEMAS: schemas,
    SECTIONS: sections
});

const encoder$1 = new TextEncoder();
const decoder = new TextDecoder();
const Utf8Encoder = {
    encode,
    decode
};
function encode(str) {
    return encoder$1.encode(str);
}
function decode(array) {
    return decoder.decode(array);
}

const JSON_TYPES = 1 << TYPE_ARRAY |
    1 << TYPE_OBJECT |
    1 << TYPE_STRING |
    1 << TYPE_NUMBER |
    1 << TYPE_BOOLEAN |
    1 << TYPE_NULL;
class TypeManager {
    static getType(value) {
        switch (typeof value) {
            case "string": {
                return TYPE_STRING;
            }
            case "number": {
                return TYPE_NUMBER;
            }
            case "boolean": {
                return TYPE_BOOLEAN;
            }
            case "object": {
                if (value === null) {
                    return TYPE_NULL;
                }
                if (Array.isArray(value)) {
                    return TYPE_ARRAY;
                }
                if (value instanceof Uint8Array) {
                    return TYPE_BINARY;
                }
                if (Object.getPrototypeOf(value).isPrototypeOf(Object)) {
                    return TYPE_OBJECT;
                }
            }
        }
        return TYPE_UNKNOWN;
    }
    static isJsonType(type) {
        return JSON_TYPES >> type & 1;
    }
}
class TypeChecker {
    constructor(definition, value) {
        this.definition = definition;
        this.value = value;
        this.basicType = TypeManager.getType(value);
    }
    /**
      Tests whether this.value conforms to this.definition.
    */
    check() {
        const mainType = this.definition.type & TYPE_MAIN;
        switch (mainType) {
            case TYPE_STRING: {
                this.isString();
                break;
            }
            case TYPE_NUMBER: {
                this.isNumber();
                break;
            }
            case TYPE_BOOLEAN: {
                this.isBoolean();
                break;
            }
            case TYPE_UINT8: {
                this.isUnsignedInteger(8);
                break;
            }
            case TYPE_UINT16: {
                this.isUnsignedInteger(16);
                break;
            }
            case TYPE_UINT24: {
                this.isUnsignedInteger(24);
                break;
            }
            case TYPE_UINT32: {
                this.isUnsignedInteger(32);
                break;
            }
            case TYPE_UINT48: {
                this.isUnsignedInteger(48);
                break;
            }
            case TYPE_BINARY: {
                this.isBinary();
                break;
            }
            case TYPE_BIN256: {
                this.isBinary(32);
                break;
            }
            case TYPE_HASH_STR: {
                this.isHashString();
                break;
            }
            default: {
                throw `unexpected definition type ${mainType}`;
            }
        }
    }
    isString() {
        if (this.basicType != TYPE_STRING) {
            throw `string expected`;
        }
        if (this.definition.size) {
            const utf8 = Utf8Encoder.encode(this.value);
            this.checkSize(utf8.length, this.definition.size);
        }
    }
    isNumber() {
        if (this.basicType != TYPE_NUMBER) {
            throw `number expected`;
        }
    }
    isBoolean() {
        if (this.basicType != TYPE_BOOLEAN) {
            throw `Boolean value expected`;
        }
    }
    isInteger() {
        this.isNumber();
        if (this.value % 1) {
            throw `integer expected`;
        }
        if (this.value < Number.MIN_SAFE_INTEGER || this.value > Number.MAX_SAFE_INTEGER) {
            throw `value is outside the safe integer range`;
        }
    }
    isUnsignedInteger(nBits) {
        this.isInteger();
        if (this.value < 0) {
            throw `non-negative value expected`;
        }
        if (this.value >= Math.pow(2, nBits)) {
            throw `value is too big (${nBits}-bit value expected)`;
        }
    }
    isBinary(size) {
        if (this.basicType != TYPE_BINARY) {
            throw `Uint8Array expected`;
        }
        this.checkSize(this.value.length, size || this.definition.size);
    }
    isHashString() {
        this.isString();
        this.checkSize(this.value.length, 64);
        if (/[^\da-f]/i.test(this.value)) {
            throw `hexadecimal string expected`;
        }
    }
    checkSize(actualSize, expectedSize) {
        if (expectedSize !== undefined && actualSize != expectedSize) {
            throw `invalid size (expecting ${expectedSize}, got ${actualSize})`;
        }
    }
}

const Utils = {
    numberToHexa,
    truncateString,
    getNullHash,
    getTimestampInSeconds,
    binaryToHexa,
    binaryFromHexa,
    binaryFrom,
    binaryIsEqual,
    binaryCompare,
    intToByteArray
};
function numberToHexa(value, size) {
    return value.toString(16).toUpperCase().padStart(size || 1, "0");
}
function truncateString(str, size) {
    return str.slice(0, size) + (str.length > size ? "(...)" : "");
}
function getNullHash() {
    return new Uint8Array(32);
}
function getTimestampInSeconds() {
    return Math.floor(Date.now() / 1000);
}
function binaryToHexa(array) {
    if (!(array instanceof Uint8Array)) {
        return "";
    }
    return [...array].map((n) => n.toString(16).toUpperCase().padStart(2, "0")).join("");
}
function binaryFromHexa(str) {
    return new Uint8Array(typeof str == "string" && str.match(/^([\da-f]{2})*$/gi) ?
        str.match(/../g).map((s) => parseInt(s, 16))
        :
            []);
}
function binaryFrom(...arg) {
    const list = Array(arg.length);
    let ndx = 0;
    arg.forEach((data$1, i) => {
        const t = TypeManager.getType(data$1);
        switch (t) {
            case TYPE_NUMBER: {
                arg[i] = this.intToByteArray(data$1);
                break;
            }
            case TYPE_STRING: {
                arg[i] = encoder.encode(data$1);
                break;
            }
            case TYPE_BINARY: {
                break;
            }
            default: {
                throw `unsupported type '${TYPE_NAMES[t]}' for Utils.binaryFrom()`;
            }
        }
        list[i] = ndx;
        ndx += arg[i].length;
    });
    const arr = new Uint8Array(ndx);
    list.forEach((ndx, i) => {
        arr.set(arg[i], ndx);
    });
    return arr;
}
function binaryIsEqual(a, b) {
    if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length != b.length) {
        return false;
    }
    for (const i in a) {
        if (a[i] != b[i]) {
            return false;
        }
    }
    return true;
}
function binaryCompare(a, b) {
    if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length != b.length) {
        throw "cannot compare";
    }
    for (const i in a) {
        if (a[i] < b[i]) {
            return -1;
        }
        else if (a[i] > b[i]) {
            return 1;
        }
    }
    return 0;
}
function intToByteArray(n, size = 1) {
    const arr = [];
    while (n || size) {
        arr.push(n % 0x100);
        n = Math.floor(n / 0x100);
        size -= !!size;
    }
    return arr.reverse();
}

var utils = /*#__PURE__*/Object.freeze({
    __proto__: null,
    Utils: Utils
});

const crypto$1 = typeof globalThis === 'object' && 'crypto' in globalThis ? globalThis.crypto : undefined;

/**
 * Utilities for hex, bytes, CSPRNG.
 * @module
 */
/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
// We use WebCrypto aka globalThis.crypto, which exists in browsers and node.js 16+.
// node.js versions earlier than v19 don't declare it in global scope.
// For node.js, package.json#exports field mapping rewrites import
// from `crypto` to `cryptoNode`, which imports native module.
// Makes the utils un-importable in browsers without a bundler.
// Once node.js 18 is deprecated (2025-04-30), we can just drop the import.
/** Checks if something is Uint8Array. Be careful: nodejs Buffer will return true. */
function isBytes$1(a) {
    return a instanceof Uint8Array || (ArrayBuffer.isView(a) && a.constructor.name === 'Uint8Array');
}
/** Asserts something is positive integer. */
function anumber(n) {
    if (!Number.isSafeInteger(n) || n < 0)
        throw new Error('positive integer expected, got ' + n);
}
/** Asserts something is Uint8Array. */
function abytes$1(b, ...lengths) {
    if (!isBytes$1(b))
        throw new Error('Uint8Array expected');
    if (lengths.length > 0 && !lengths.includes(b.length))
        throw new Error('Uint8Array expected of length ' + lengths + ', got length=' + b.length);
}
/** Asserts something is hash */
function ahash(h) {
    if (typeof h !== 'function' || typeof h.create !== 'function')
        throw new Error('Hash should be wrapped by utils.createHasher');
    anumber(h.outputLen);
    anumber(h.blockLen);
}
/** Asserts a hash instance has not been destroyed / finished */
function aexists$1(instance, checkFinished = true) {
    if (instance.destroyed)
        throw new Error('Hash instance has been destroyed');
    if (checkFinished && instance.finished)
        throw new Error('Hash#digest() has already been called');
}
/** Asserts output is properly-sized byte array */
function aoutput$1(out, instance) {
    abytes$1(out);
    const min = instance.outputLen;
    if (out.length < min) {
        throw new Error('digestInto() expects output buffer of length at least ' + min);
    }
}
/** Cast u8 / u16 / u32 to u32. */
function u32$1(arr) {
    return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
}
/** Zeroize a byte array. Warning: JS provides no guarantees. */
function clean$1(...arrays) {
    for (let i = 0; i < arrays.length; i++) {
        arrays[i].fill(0);
    }
}
/** Create DataView of an array for easy byte-level manipulation. */
function createView$1(arr) {
    return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
/** The rotate right (circular right shift) operation for uint32 */
function rotr(word, shift) {
    return (word << (32 - shift)) | (word >>> shift);
}
/** Is current platform little-endian? Most are. Big-Endian platform: IBM */
const isLE$1 = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44)();
/** The byte swap operation for uint32 */
function byteSwap(word) {
    return (((word << 24) & 0xff000000) |
        ((word << 8) & 0xff0000) |
        ((word >>> 8) & 0xff00) |
        ((word >>> 24) & 0xff));
}
/** In place byte swap for Uint32Array */
function byteSwap32(arr) {
    for (let i = 0; i < arr.length; i++) {
        arr[i] = byteSwap(arr[i]);
    }
    return arr;
}
const swap32IfBE = isLE$1
    ? (u) => u
    : byteSwap32;
// Built-in hex conversion https://caniuse.com/mdn-javascript_builtins_uint8array_fromhex
const hasHexBuiltin$1 = /* @__PURE__ */ (() =>
// @ts-ignore
typeof Uint8Array.from([]).toHex === 'function' && typeof Uint8Array.fromHex === 'function')();
// We use optimized technique to convert hex string to byte array
const asciis$1 = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function asciiToBase16$1(ch) {
    if (ch >= asciis$1._0 && ch <= asciis$1._9)
        return ch - asciis$1._0; // '2' => 50-48
    if (ch >= asciis$1.A && ch <= asciis$1.F)
        return ch - (asciis$1.A - 10); // 'B' => 66-(65-10)
    if (ch >= asciis$1.a && ch <= asciis$1.f)
        return ch - (asciis$1.a - 10); // 'b' => 98-(97-10)
    return;
}
/**
 * Convert hex string to byte array. Uses built-in function, when available.
 * @example hexToBytes('cafe0123') // Uint8Array.from([0xca, 0xfe, 0x01, 0x23])
 */
function hexToBytes$1(hex) {
    if (typeof hex !== 'string')
        throw new Error('hex string expected, got ' + typeof hex);
    // @ts-ignore
    if (hasHexBuiltin$1)
        return Uint8Array.fromHex(hex);
    const hl = hex.length;
    const al = hl / 2;
    if (hl % 2)
        throw new Error('hex string expected, got unpadded hex of length ' + hl);
    const array = new Uint8Array(al);
    for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
        const n1 = asciiToBase16$1(hex.charCodeAt(hi));
        const n2 = asciiToBase16$1(hex.charCodeAt(hi + 1));
        if (n1 === undefined || n2 === undefined) {
            const char = hex[hi] + hex[hi + 1];
            throw new Error('hex string expected, got non-hex character "' + char + '" at index ' + hi);
        }
        array[ai] = n1 * 16 + n2; // multiply first octet, e.g. 'a3' => 10*16+3 => 160 + 3 => 163
    }
    return array;
}
/**
 * Converts string to bytes using UTF8 encoding.
 * @example utf8ToBytes('abc') // Uint8Array.from([97, 98, 99])
 */
function utf8ToBytes$1(str) {
    if (typeof str !== 'string')
        throw new Error('string expected');
    return new Uint8Array(new TextEncoder().encode(str)); // https://bugzil.la/1681809
}
/**
 * Normalizes (non-hex) string or Uint8Array to Uint8Array.
 * Warning: when Uint8Array is passed, it would NOT get copied.
 * Keep in mind for future mutable operations.
 */
function toBytes$1(data) {
    if (typeof data === 'string')
        data = utf8ToBytes$1(data);
    abytes$1(data);
    return data;
}
/** Copies several Uint8Arrays into one. */
function concatBytes(...arrays) {
    let sum = 0;
    for (let i = 0; i < arrays.length; i++) {
        const a = arrays[i];
        abytes$1(a);
        sum += a.length;
    }
    const res = new Uint8Array(sum);
    for (let i = 0, pad = 0; i < arrays.length; i++) {
        const a = arrays[i];
        res.set(a, pad);
        pad += a.length;
    }
    return res;
}
/** For runtime check if class implements interface */
class Hash {
}
/** Wraps hash function, creating an interface on top of it */
function createHasher(hashCons) {
    const hashC = (msg) => hashCons().update(toBytes$1(msg)).digest();
    const tmp = hashCons();
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.create = () => hashCons();
    return hashC;
}
function createXOFer(hashCons) {
    const hashC = (msg, opts) => hashCons(opts).update(toBytes$1(msg)).digest();
    const tmp = hashCons({});
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.create = (opts) => hashCons(opts);
    return hashC;
}
/** Cryptographically secure PRNG. Uses internal OS-level `crypto.getRandomValues`. */
function randomBytes$1(bytesLength = 32) {
    if (crypto$1 && typeof crypto$1.getRandomValues === 'function') {
        return crypto$1.getRandomValues(new Uint8Array(bytesLength));
    }
    // Legacy Node.js compatibility
    if (crypto$1 && typeof crypto$1.randomBytes === 'function') {
        return Uint8Array.from(crypto$1.randomBytes(bytesLength));
    }
    throw new Error('crypto.getRandomValues must be defined');
}

const Random = {
    getBytes,
    getInteger,
    getKey256
};
function getBytes(n) {
    return randomBytes$1(n);
}
function getInteger(max) {
    const rand = getBytes(6);
    let v = 0;
    for (let i = 0; i < 6; i++) {
        v = v * 256 + rand[i];
    }
    return Math.floor(v / Math.pow(2, 48) * max);
}
function getKey256() {
    const key = getBytes(32);
    return Utils.binaryToHexa(key);
}

/**
 * Internal Merkle-Damgard hash utils.
 * @module
 */
/** Polyfill for Safari 14. https://caniuse.com/mdn-javascript_builtins_dataview_setbiguint64 */
function setBigUint64$1(view, byteOffset, value, isLE) {
    if (typeof view.setBigUint64 === 'function')
        return view.setBigUint64(byteOffset, value, isLE);
    const _32n = BigInt(32);
    const _u32_max = BigInt(0xffffffff);
    const wh = Number((value >> _32n) & _u32_max);
    const wl = Number(value & _u32_max);
    const h = isLE ? 4 : 0;
    const l = isLE ? 0 : 4;
    view.setUint32(byteOffset + h, wh, isLE);
    view.setUint32(byteOffset + l, wl, isLE);
}
/** Choice: a ? b : c */
function Chi(a, b, c) {
    return (a & b) ^ (~a & c);
}
/** Majority function, true if any two inputs is true. */
function Maj(a, b, c) {
    return (a & b) ^ (a & c) ^ (b & c);
}
/**
 * Merkle-Damgard hash construction base class.
 * Could be used to create MD5, RIPEMD, SHA1, SHA2.
 */
class HashMD extends Hash {
    constructor(blockLen, outputLen, padOffset, isLE) {
        super();
        this.finished = false;
        this.length = 0;
        this.pos = 0;
        this.destroyed = false;
        this.blockLen = blockLen;
        this.outputLen = outputLen;
        this.padOffset = padOffset;
        this.isLE = isLE;
        this.buffer = new Uint8Array(blockLen);
        this.view = createView$1(this.buffer);
    }
    update(data) {
        aexists$1(this);
        data = toBytes$1(data);
        abytes$1(data);
        const { view, buffer, blockLen } = this;
        const len = data.length;
        for (let pos = 0; pos < len;) {
            const take = Math.min(blockLen - this.pos, len - pos);
            // Fast path: we have at least one block in input, cast it to view and process
            if (take === blockLen) {
                const dataView = createView$1(data);
                for (; blockLen <= len - pos; pos += blockLen)
                    this.process(dataView, pos);
                continue;
            }
            buffer.set(data.subarray(pos, pos + take), this.pos);
            this.pos += take;
            pos += take;
            if (this.pos === blockLen) {
                this.process(view, 0);
                this.pos = 0;
            }
        }
        this.length += data.length;
        this.roundClean();
        return this;
    }
    digestInto(out) {
        aexists$1(this);
        aoutput$1(out, this);
        this.finished = true;
        // Padding
        // We can avoid allocation of buffer for padding completely if it
        // was previously not allocated here. But it won't change performance.
        const { buffer, view, blockLen, isLE } = this;
        let { pos } = this;
        // append the bit '1' to the message
        buffer[pos++] = 0b10000000;
        clean$1(this.buffer.subarray(pos));
        // we have less than padOffset left in buffer, so we cannot put length in
        // current block, need process it and pad again
        if (this.padOffset > blockLen - pos) {
            this.process(view, 0);
            pos = 0;
        }
        // Pad until full block byte with zeros
        for (let i = pos; i < blockLen; i++)
            buffer[i] = 0;
        // Note: sha512 requires length to be 128bit integer, but length in JS will overflow before that
        // You need to write around 2 exabytes (u64_max / 8 / (1024**6)) for this to happen.
        // So we just write lowest 64 bits of that value.
        setBigUint64$1(view, blockLen - 8, BigInt(this.length * 8), isLE);
        this.process(view, 0);
        const oview = createView$1(out);
        const len = this.outputLen;
        // NOTE: we do division by 4 later, which should be fused in single op with modulo by JIT
        if (len % 4)
            throw new Error('_sha2: outputLen should be aligned to 32bit');
        const outLen = len / 4;
        const state = this.get();
        if (outLen > state.length)
            throw new Error('_sha2: outputLen bigger than state');
        for (let i = 0; i < outLen; i++)
            oview.setUint32(4 * i, state[i], isLE);
    }
    digest() {
        const { buffer, outputLen } = this;
        this.digestInto(buffer);
        const res = buffer.slice(0, outputLen);
        this.destroy();
        return res;
    }
    _cloneInto(to) {
        to || (to = new this.constructor());
        to.set(...this.get());
        const { blockLen, buffer, length, finished, destroyed, pos } = this;
        to.destroyed = destroyed;
        to.finished = finished;
        to.length = length;
        to.pos = pos;
        if (length % blockLen)
            to.buffer.set(buffer);
        return to;
    }
    clone() {
        return this._cloneInto();
    }
}
/**
 * Initial SHA-2 state: fractional parts of square roots of first 16 primes 2..53.
 * Check out `test/misc/sha2-gen-iv.js` for recomputation guide.
 */
/** Initial SHA256 state. Bits 0..32 of frac part of sqrt of primes 2..19 */
const SHA256_IV = /* @__PURE__ */ Uint32Array.from([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);
/** Initial SHA224 state. Bits 32..64 of frac part of sqrt of primes 23..53 */
const SHA224_IV = /* @__PURE__ */ Uint32Array.from([
    0xc1059ed8, 0x367cd507, 0x3070dd17, 0xf70e5939, 0xffc00b31, 0x68581511, 0x64f98fa7, 0xbefa4fa4,
]);
/** Initial SHA384 state. Bits 0..64 of frac part of sqrt of primes 23..53 */
const SHA384_IV = /* @__PURE__ */ Uint32Array.from([
    0xcbbb9d5d, 0xc1059ed8, 0x629a292a, 0x367cd507, 0x9159015a, 0x3070dd17, 0x152fecd8, 0xf70e5939,
    0x67332667, 0xffc00b31, 0x8eb44a87, 0x68581511, 0xdb0c2e0d, 0x64f98fa7, 0x47b5481d, 0xbefa4fa4,
]);
/** Initial SHA512 state. Bits 0..64 of frac part of sqrt of primes 2..19 */
const SHA512_IV = /* @__PURE__ */ Uint32Array.from([
    0x6a09e667, 0xf3bcc908, 0xbb67ae85, 0x84caa73b, 0x3c6ef372, 0xfe94f82b, 0xa54ff53a, 0x5f1d36f1,
    0x510e527f, 0xade682d1, 0x9b05688c, 0x2b3e6c1f, 0x1f83d9ab, 0xfb41bd6b, 0x5be0cd19, 0x137e2179,
]);

/**
 * Internal helpers for u64. BigUint64Array is too slow as per 2025, so we implement it using Uint32Array.
 * @todo re-check https://issues.chromium.org/issues/42212588
 * @module
 */
const U32_MASK64 = /* @__PURE__ */ BigInt(2 ** 32 - 1);
const _32n = /* @__PURE__ */ BigInt(32);
function fromBig(n, le = false) {
    if (le)
        return { h: Number(n & U32_MASK64), l: Number((n >> _32n) & U32_MASK64) };
    return { h: Number((n >> _32n) & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
}
function split(lst, le = false) {
    const len = lst.length;
    let Ah = new Uint32Array(len);
    let Al = new Uint32Array(len);
    for (let i = 0; i < len; i++) {
        const { h, l } = fromBig(lst[i], le);
        [Ah[i], Al[i]] = [h, l];
    }
    return [Ah, Al];
}
// for Shift in [0, 32)
const shrSH = (h, _l, s) => h >>> s;
const shrSL = (h, l, s) => (h << (32 - s)) | (l >>> s);
// Right rotate for Shift in [1, 32)
const rotrSH = (h, l, s) => (h >>> s) | (l << (32 - s));
const rotrSL = (h, l, s) => (h << (32 - s)) | (l >>> s);
// Right rotate for Shift in (32, 64), NOTE: 32 is special case.
const rotrBH = (h, l, s) => (h << (64 - s)) | (l >>> (s - 32));
const rotrBL = (h, l, s) => (h >>> (s - 32)) | (l << (64 - s));
// Left rotate for Shift in [1, 32)
const rotlSH = (h, l, s) => (h << s) | (l >>> (32 - s));
const rotlSL = (h, l, s) => (l << s) | (h >>> (32 - s));
// Left rotate for Shift in (32, 64), NOTE: 32 is special case.
const rotlBH = (h, l, s) => (l << (s - 32)) | (h >>> (64 - s));
const rotlBL = (h, l, s) => (h << (s - 32)) | (l >>> (64 - s));
// JS uses 32-bit signed integers for bitwise operations which means we cannot
// simple take carry out of low bit sum by shift, we need to use division.
function add(Ah, Al, Bh, Bl) {
    const l = (Al >>> 0) + (Bl >>> 0);
    return { h: (Ah + Bh + ((l / 2 ** 32) | 0)) | 0, l: l | 0 };
}
// Addition with more than 2 elements
const add3L = (Al, Bl, Cl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0);
const add3H = (low, Ah, Bh, Ch) => (Ah + Bh + Ch + ((low / 2 ** 32) | 0)) | 0;
const add4L = (Al, Bl, Cl, Dl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0);
const add4H = (low, Ah, Bh, Ch, Dh) => (Ah + Bh + Ch + Dh + ((low / 2 ** 32) | 0)) | 0;
const add5L = (Al, Bl, Cl, Dl, El) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0) + (El >>> 0);
const add5H = (low, Ah, Bh, Ch, Dh, Eh) => (Ah + Bh + Ch + Dh + Eh + ((low / 2 ** 32) | 0)) | 0;

/**
 * SHA2 hash function. A.k.a. sha256, sha384, sha512, sha512_224, sha512_256.
 * SHA256 is the fastest hash implementable in JS, even faster than Blake3.
 * Check out [RFC 4634](https://datatracker.ietf.org/doc/html/rfc4634) and
 * [FIPS 180-4](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf).
 * @module
 */
/**
 * Round constants:
 * First 32 bits of fractional parts of the cube roots of the first 64 primes 2..311)
 */
// prettier-ignore
const SHA256_K = /* @__PURE__ */ Uint32Array.from([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);
/** Reusable temporary buffer. "W" comes straight from spec. */
const SHA256_W = /* @__PURE__ */ new Uint32Array(64);
class SHA256 extends HashMD {
    constructor(outputLen = 32) {
        super(64, outputLen, 8, false);
        // We cannot use array here since array allows indexing by variable
        // which means optimizer/compiler cannot use registers.
        this.A = SHA256_IV[0] | 0;
        this.B = SHA256_IV[1] | 0;
        this.C = SHA256_IV[2] | 0;
        this.D = SHA256_IV[3] | 0;
        this.E = SHA256_IV[4] | 0;
        this.F = SHA256_IV[5] | 0;
        this.G = SHA256_IV[6] | 0;
        this.H = SHA256_IV[7] | 0;
    }
    get() {
        const { A, B, C, D, E, F, G, H } = this;
        return [A, B, C, D, E, F, G, H];
    }
    // prettier-ignore
    set(A, B, C, D, E, F, G, H) {
        this.A = A | 0;
        this.B = B | 0;
        this.C = C | 0;
        this.D = D | 0;
        this.E = E | 0;
        this.F = F | 0;
        this.G = G | 0;
        this.H = H | 0;
    }
    process(view, offset) {
        // Extend the first 16 words into the remaining 48 words w[16..63] of the message schedule array
        for (let i = 0; i < 16; i++, offset += 4)
            SHA256_W[i] = view.getUint32(offset, false);
        for (let i = 16; i < 64; i++) {
            const W15 = SHA256_W[i - 15];
            const W2 = SHA256_W[i - 2];
            const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ (W15 >>> 3);
            const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ (W2 >>> 10);
            SHA256_W[i] = (s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16]) | 0;
        }
        // Compression function main loop, 64 rounds
        let { A, B, C, D, E, F, G, H } = this;
        for (let i = 0; i < 64; i++) {
            const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
            const T1 = (H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i]) | 0;
            const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
            const T2 = (sigma0 + Maj(A, B, C)) | 0;
            H = G;
            G = F;
            F = E;
            E = (D + T1) | 0;
            D = C;
            C = B;
            B = A;
            A = (T1 + T2) | 0;
        }
        // Add the compressed chunk to the current hash value
        A = (A + this.A) | 0;
        B = (B + this.B) | 0;
        C = (C + this.C) | 0;
        D = (D + this.D) | 0;
        E = (E + this.E) | 0;
        F = (F + this.F) | 0;
        G = (G + this.G) | 0;
        H = (H + this.H) | 0;
        this.set(A, B, C, D, E, F, G, H);
    }
    roundClean() {
        clean$1(SHA256_W);
    }
    destroy() {
        this.set(0, 0, 0, 0, 0, 0, 0, 0);
        clean$1(this.buffer);
    }
}
class SHA224 extends SHA256 {
    constructor() {
        super(28);
        this.A = SHA224_IV[0] | 0;
        this.B = SHA224_IV[1] | 0;
        this.C = SHA224_IV[2] | 0;
        this.D = SHA224_IV[3] | 0;
        this.E = SHA224_IV[4] | 0;
        this.F = SHA224_IV[5] | 0;
        this.G = SHA224_IV[6] | 0;
        this.H = SHA224_IV[7] | 0;
    }
}
// SHA2-512 is slower than sha256 in js because u64 operations are slow.
// Round contants
// First 32 bits of the fractional parts of the cube roots of the first 80 primes 2..409
// prettier-ignore
const K512 = /* @__PURE__ */ (() => split([
    '0x428a2f98d728ae22', '0x7137449123ef65cd', '0xb5c0fbcfec4d3b2f', '0xe9b5dba58189dbbc',
    '0x3956c25bf348b538', '0x59f111f1b605d019', '0x923f82a4af194f9b', '0xab1c5ed5da6d8118',
    '0xd807aa98a3030242', '0x12835b0145706fbe', '0x243185be4ee4b28c', '0x550c7dc3d5ffb4e2',
    '0x72be5d74f27b896f', '0x80deb1fe3b1696b1', '0x9bdc06a725c71235', '0xc19bf174cf692694',
    '0xe49b69c19ef14ad2', '0xefbe4786384f25e3', '0x0fc19dc68b8cd5b5', '0x240ca1cc77ac9c65',
    '0x2de92c6f592b0275', '0x4a7484aa6ea6e483', '0x5cb0a9dcbd41fbd4', '0x76f988da831153b5',
    '0x983e5152ee66dfab', '0xa831c66d2db43210', '0xb00327c898fb213f', '0xbf597fc7beef0ee4',
    '0xc6e00bf33da88fc2', '0xd5a79147930aa725', '0x06ca6351e003826f', '0x142929670a0e6e70',
    '0x27b70a8546d22ffc', '0x2e1b21385c26c926', '0x4d2c6dfc5ac42aed', '0x53380d139d95b3df',
    '0x650a73548baf63de', '0x766a0abb3c77b2a8', '0x81c2c92e47edaee6', '0x92722c851482353b',
    '0xa2bfe8a14cf10364', '0xa81a664bbc423001', '0xc24b8b70d0f89791', '0xc76c51a30654be30',
    '0xd192e819d6ef5218', '0xd69906245565a910', '0xf40e35855771202a', '0x106aa07032bbd1b8',
    '0x19a4c116b8d2d0c8', '0x1e376c085141ab53', '0x2748774cdf8eeb99', '0x34b0bcb5e19b48a8',
    '0x391c0cb3c5c95a63', '0x4ed8aa4ae3418acb', '0x5b9cca4f7763e373', '0x682e6ff3d6b2b8a3',
    '0x748f82ee5defb2fc', '0x78a5636f43172f60', '0x84c87814a1f0ab72', '0x8cc702081a6439ec',
    '0x90befffa23631e28', '0xa4506cebde82bde9', '0xbef9a3f7b2c67915', '0xc67178f2e372532b',
    '0xca273eceea26619c', '0xd186b8c721c0c207', '0xeada7dd6cde0eb1e', '0xf57d4f7fee6ed178',
    '0x06f067aa72176fba', '0x0a637dc5a2c898a6', '0x113f9804bef90dae', '0x1b710b35131c471b',
    '0x28db77f523047d84', '0x32caab7b40c72493', '0x3c9ebe0a15c9bebc', '0x431d67c49c100d4c',
    '0x4cc5d4becb3e42b6', '0x597f299cfc657e2a', '0x5fcb6fab3ad6faec', '0x6c44198c4a475817'
].map(n => BigInt(n))))();
const SHA512_Kh = /* @__PURE__ */ (() => K512[0])();
const SHA512_Kl = /* @__PURE__ */ (() => K512[1])();
// Reusable temporary buffers
const SHA512_W_H = /* @__PURE__ */ new Uint32Array(80);
const SHA512_W_L = /* @__PURE__ */ new Uint32Array(80);
class SHA512 extends HashMD {
    constructor(outputLen = 64) {
        super(128, outputLen, 16, false);
        // We cannot use array here since array allows indexing by variable
        // which means optimizer/compiler cannot use registers.
        // h -- high 32 bits, l -- low 32 bits
        this.Ah = SHA512_IV[0] | 0;
        this.Al = SHA512_IV[1] | 0;
        this.Bh = SHA512_IV[2] | 0;
        this.Bl = SHA512_IV[3] | 0;
        this.Ch = SHA512_IV[4] | 0;
        this.Cl = SHA512_IV[5] | 0;
        this.Dh = SHA512_IV[6] | 0;
        this.Dl = SHA512_IV[7] | 0;
        this.Eh = SHA512_IV[8] | 0;
        this.El = SHA512_IV[9] | 0;
        this.Fh = SHA512_IV[10] | 0;
        this.Fl = SHA512_IV[11] | 0;
        this.Gh = SHA512_IV[12] | 0;
        this.Gl = SHA512_IV[13] | 0;
        this.Hh = SHA512_IV[14] | 0;
        this.Hl = SHA512_IV[15] | 0;
    }
    // prettier-ignore
    get() {
        const { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
        return [Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl];
    }
    // prettier-ignore
    set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl) {
        this.Ah = Ah | 0;
        this.Al = Al | 0;
        this.Bh = Bh | 0;
        this.Bl = Bl | 0;
        this.Ch = Ch | 0;
        this.Cl = Cl | 0;
        this.Dh = Dh | 0;
        this.Dl = Dl | 0;
        this.Eh = Eh | 0;
        this.El = El | 0;
        this.Fh = Fh | 0;
        this.Fl = Fl | 0;
        this.Gh = Gh | 0;
        this.Gl = Gl | 0;
        this.Hh = Hh | 0;
        this.Hl = Hl | 0;
    }
    process(view, offset) {
        // Extend the first 16 words into the remaining 64 words w[16..79] of the message schedule array
        for (let i = 0; i < 16; i++, offset += 4) {
            SHA512_W_H[i] = view.getUint32(offset);
            SHA512_W_L[i] = view.getUint32((offset += 4));
        }
        for (let i = 16; i < 80; i++) {
            // s0 := (w[i-15] rightrotate 1) xor (w[i-15] rightrotate 8) xor (w[i-15] rightshift 7)
            const W15h = SHA512_W_H[i - 15] | 0;
            const W15l = SHA512_W_L[i - 15] | 0;
            const s0h = rotrSH(W15h, W15l, 1) ^ rotrSH(W15h, W15l, 8) ^ shrSH(W15h, W15l, 7);
            const s0l = rotrSL(W15h, W15l, 1) ^ rotrSL(W15h, W15l, 8) ^ shrSL(W15h, W15l, 7);
            // s1 := (w[i-2] rightrotate 19) xor (w[i-2] rightrotate 61) xor (w[i-2] rightshift 6)
            const W2h = SHA512_W_H[i - 2] | 0;
            const W2l = SHA512_W_L[i - 2] | 0;
            const s1h = rotrSH(W2h, W2l, 19) ^ rotrBH(W2h, W2l, 61) ^ shrSH(W2h, W2l, 6);
            const s1l = rotrSL(W2h, W2l, 19) ^ rotrBL(W2h, W2l, 61) ^ shrSL(W2h, W2l, 6);
            // SHA256_W[i] = s0 + s1 + SHA256_W[i - 7] + SHA256_W[i - 16];
            const SUMl = add4L(s0l, s1l, SHA512_W_L[i - 7], SHA512_W_L[i - 16]);
            const SUMh = add4H(SUMl, s0h, s1h, SHA512_W_H[i - 7], SHA512_W_H[i - 16]);
            SHA512_W_H[i] = SUMh | 0;
            SHA512_W_L[i] = SUMl | 0;
        }
        let { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
        // Compression function main loop, 80 rounds
        for (let i = 0; i < 80; i++) {
            // S1 := (e rightrotate 14) xor (e rightrotate 18) xor (e rightrotate 41)
            const sigma1h = rotrSH(Eh, El, 14) ^ rotrSH(Eh, El, 18) ^ rotrBH(Eh, El, 41);
            const sigma1l = rotrSL(Eh, El, 14) ^ rotrSL(Eh, El, 18) ^ rotrBL(Eh, El, 41);
            //const T1 = (H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i]) | 0;
            const CHIh = (Eh & Fh) ^ (~Eh & Gh);
            const CHIl = (El & Fl) ^ (~El & Gl);
            // T1 = H + sigma1 + Chi(E, F, G) + SHA512_K[i] + SHA512_W[i]
            // prettier-ignore
            const T1ll = add5L(Hl, sigma1l, CHIl, SHA512_Kl[i], SHA512_W_L[i]);
            const T1h = add5H(T1ll, Hh, sigma1h, CHIh, SHA512_Kh[i], SHA512_W_H[i]);
            const T1l = T1ll | 0;
            // S0 := (a rightrotate 28) xor (a rightrotate 34) xor (a rightrotate 39)
            const sigma0h = rotrSH(Ah, Al, 28) ^ rotrBH(Ah, Al, 34) ^ rotrBH(Ah, Al, 39);
            const sigma0l = rotrSL(Ah, Al, 28) ^ rotrBL(Ah, Al, 34) ^ rotrBL(Ah, Al, 39);
            const MAJh = (Ah & Bh) ^ (Ah & Ch) ^ (Bh & Ch);
            const MAJl = (Al & Bl) ^ (Al & Cl) ^ (Bl & Cl);
            Hh = Gh | 0;
            Hl = Gl | 0;
            Gh = Fh | 0;
            Gl = Fl | 0;
            Fh = Eh | 0;
            Fl = El | 0;
            ({ h: Eh, l: El } = add(Dh | 0, Dl | 0, T1h | 0, T1l | 0));
            Dh = Ch | 0;
            Dl = Cl | 0;
            Ch = Bh | 0;
            Cl = Bl | 0;
            Bh = Ah | 0;
            Bl = Al | 0;
            const All = add3L(T1l, sigma0l, MAJl);
            Ah = add3H(All, T1h, sigma0h, MAJh);
            Al = All | 0;
        }
        // Add the compressed chunk to the current hash value
        ({ h: Ah, l: Al } = add(this.Ah | 0, this.Al | 0, Ah | 0, Al | 0));
        ({ h: Bh, l: Bl } = add(this.Bh | 0, this.Bl | 0, Bh | 0, Bl | 0));
        ({ h: Ch, l: Cl } = add(this.Ch | 0, this.Cl | 0, Ch | 0, Cl | 0));
        ({ h: Dh, l: Dl } = add(this.Dh | 0, this.Dl | 0, Dh | 0, Dl | 0));
        ({ h: Eh, l: El } = add(this.Eh | 0, this.El | 0, Eh | 0, El | 0));
        ({ h: Fh, l: Fl } = add(this.Fh | 0, this.Fl | 0, Fh | 0, Fl | 0));
        ({ h: Gh, l: Gl } = add(this.Gh | 0, this.Gl | 0, Gh | 0, Gl | 0));
        ({ h: Hh, l: Hl } = add(this.Hh | 0, this.Hl | 0, Hh | 0, Hl | 0));
        this.set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl);
    }
    roundClean() {
        clean$1(SHA512_W_H, SHA512_W_L);
    }
    destroy() {
        clean$1(this.buffer);
        this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    }
}
class SHA384 extends SHA512 {
    constructor() {
        super(48);
        this.Ah = SHA384_IV[0] | 0;
        this.Al = SHA384_IV[1] | 0;
        this.Bh = SHA384_IV[2] | 0;
        this.Bl = SHA384_IV[3] | 0;
        this.Ch = SHA384_IV[4] | 0;
        this.Cl = SHA384_IV[5] | 0;
        this.Dh = SHA384_IV[6] | 0;
        this.Dl = SHA384_IV[7] | 0;
        this.Eh = SHA384_IV[8] | 0;
        this.El = SHA384_IV[9] | 0;
        this.Fh = SHA384_IV[10] | 0;
        this.Fl = SHA384_IV[11] | 0;
        this.Gh = SHA384_IV[12] | 0;
        this.Gl = SHA384_IV[13] | 0;
        this.Hh = SHA384_IV[14] | 0;
        this.Hl = SHA384_IV[15] | 0;
    }
}
/**
 * Truncated SHA512/256 and SHA512/224.
 * SHA512_IV is XORed with 0xa5a5a5a5a5a5a5a5, then used as "intermediary" IV of SHA512/t.
 * Then t hashes string to produce result IV.
 * See `test/misc/sha2-gen-iv.js`.
 */
/** SHA512/224 IV */
const T224_IV = /* @__PURE__ */ Uint32Array.from([
    0x8c3d37c8, 0x19544da2, 0x73e19966, 0x89dcd4d6, 0x1dfab7ae, 0x32ff9c82, 0x679dd514, 0x582f9fcf,
    0x0f6d2b69, 0x7bd44da8, 0x77e36f73, 0x04c48942, 0x3f9d85a8, 0x6a1d36c8, 0x1112e6ad, 0x91d692a1,
]);
/** SHA512/256 IV */
const T256_IV = /* @__PURE__ */ Uint32Array.from([
    0x22312194, 0xfc2bf72c, 0x9f555fa3, 0xc84c64c2, 0x2393b86b, 0x6f53b151, 0x96387719, 0x5940eabd,
    0x96283ee2, 0xa88effe3, 0xbe5e1e25, 0x53863992, 0x2b0199fc, 0x2c85b8aa, 0x0eb72ddc, 0x81c52ca2,
]);
class SHA512_224 extends SHA512 {
    constructor() {
        super(28);
        this.Ah = T224_IV[0] | 0;
        this.Al = T224_IV[1] | 0;
        this.Bh = T224_IV[2] | 0;
        this.Bl = T224_IV[3] | 0;
        this.Ch = T224_IV[4] | 0;
        this.Cl = T224_IV[5] | 0;
        this.Dh = T224_IV[6] | 0;
        this.Dl = T224_IV[7] | 0;
        this.Eh = T224_IV[8] | 0;
        this.El = T224_IV[9] | 0;
        this.Fh = T224_IV[10] | 0;
        this.Fl = T224_IV[11] | 0;
        this.Gh = T224_IV[12] | 0;
        this.Gl = T224_IV[13] | 0;
        this.Hh = T224_IV[14] | 0;
        this.Hl = T224_IV[15] | 0;
    }
}
class SHA512_256 extends SHA512 {
    constructor() {
        super(32);
        this.Ah = T256_IV[0] | 0;
        this.Al = T256_IV[1] | 0;
        this.Bh = T256_IV[2] | 0;
        this.Bl = T256_IV[3] | 0;
        this.Ch = T256_IV[4] | 0;
        this.Cl = T256_IV[5] | 0;
        this.Dh = T256_IV[6] | 0;
        this.Dl = T256_IV[7] | 0;
        this.Eh = T256_IV[8] | 0;
        this.El = T256_IV[9] | 0;
        this.Fh = T256_IV[10] | 0;
        this.Fl = T256_IV[11] | 0;
        this.Gh = T256_IV[12] | 0;
        this.Gl = T256_IV[13] | 0;
        this.Hh = T256_IV[14] | 0;
        this.Hl = T256_IV[15] | 0;
    }
}
/**
 * SHA2-256 hash function from RFC 4634.
 *
 * It is the fastest JS hash, even faster than Blake3.
 * To break sha256 using birthday attack, attackers need to try 2^128 hashes.
 * BTC network is doing 2^70 hashes/sec (2^95 hashes/year) as per 2025.
 */
const sha256$2 = /* @__PURE__ */ createHasher(() => new SHA256());
/** SHA2-224 hash function from RFC 4634 */
const sha224 = /* @__PURE__ */ createHasher(() => new SHA224());
/** SHA2-512 hash function from RFC 4634. */
const sha512$2 = /* @__PURE__ */ createHasher(() => new SHA512());
/** SHA2-384 hash function from RFC 4634. */
const sha384 = /* @__PURE__ */ createHasher(() => new SHA384());
/**
 * SHA2-512/256 "truncated" hash function, with improved resistance to length extension attacks.
 * See the paper on [truncated SHA512](https://eprint.iacr.org/2010/548.pdf).
 */
const sha512_256 = /* @__PURE__ */ createHasher(() => new SHA512_256());
/**
 * SHA2-512/224 "truncated" hash function, with improved resistance to length extension attacks.
 * See the paper on [truncated SHA512](https://eprint.iacr.org/2010/548.pdf).
 */
const sha512_224 = /* @__PURE__ */ createHasher(() => new SHA512_224());

/**
 * SHA2-256 a.k.a. sha256. In JS, it is the fastest hash, even faster than Blake3.
 *
 * To break sha256 using birthday attack, attackers need to try 2^128 hashes.
 * BTC network is doing 2^70 hashes/sec (2^95 hashes/year) as per 2025.
 *
 * Check out [FIPS 180-4](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf).
 * @module
 * @deprecated
 */
/** @deprecated Use import from `noble/hashes/sha2` module */
const sha256$1 = sha256$2;

/**
 * SHA2-512 a.k.a. sha512 and sha384. It is slower than sha256 in js because u64 operations are slow.
 *
 * Check out [RFC 4634](https://datatracker.ietf.org/doc/html/rfc4634) and
 * [the paper on truncated SHA512/256](https://eprint.iacr.org/2010/548.pdf).
 * @module
 * @deprecated
 */
/** @deprecated Use import from `noble/hashes/sha2` module */
const sha512$1 = sha512$2;

const Hashes = {
    sha256AsBinary,
    sha256,
    sha512AsBinary,
    sha512
};
function sha256AsBinary(data) {
    if (!(data instanceof Uint8Array)) {
        throw "Argument passed to compute sha256 is not an instance of Uint8Array";
    }
    return sha256$1(data);
}
function sha256(data) {
    return Utils.binaryToHexa(sha256AsBinary(data));
}
function sha512AsBinary(data) {
    if (!(data instanceof Uint8Array)) {
        throw "Argument passed to compute sha512 is not an instance of Uint8Array";
    }
    return sha512$1(data);
}
function sha512(data) {
    return Utils.binaryToHexa(sha512AsBinary(data));
}

/**
 * Utilities for hex, bytes, CSPRNG.
 * @module
 */
/*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) */
/** Checks if something is Uint8Array. Be careful: nodejs Buffer will return true. */
function isBytes(a) {
    return a instanceof Uint8Array || (ArrayBuffer.isView(a) && a.constructor.name === 'Uint8Array');
}
/** Asserts something is Uint8Array. */
function abytes(b, ...lengths) {
    if (!isBytes(b))
        throw new Error('Uint8Array expected');
    if (lengths.length > 0 && !lengths.includes(b.length))
        throw new Error('Uint8Array expected of length ' + lengths + ', got length=' + b.length);
}
/** Asserts a hash instance has not been destroyed / finished */
function aexists(instance, checkFinished = true) {
    if (instance.destroyed)
        throw new Error('Hash instance has been destroyed');
    if (checkFinished && instance.finished)
        throw new Error('Hash#digest() has already been called');
}
/** Asserts output is properly-sized byte array */
function aoutput(out, instance) {
    abytes(out);
    const min = instance.outputLen;
    if (out.length < min) {
        throw new Error('digestInto() expects output buffer of length at least ' + min);
    }
}
/** Cast u8 / u16 / u32 to u8. */
function u8(arr) {
    return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
}
/** Cast u8 / u16 / u32 to u32. */
function u32(arr) {
    return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
}
/** Zeroize a byte array. Warning: JS provides no guarantees. */
function clean(...arrays) {
    for (let i = 0; i < arrays.length; i++) {
        arrays[i].fill(0);
    }
}
/** Create DataView of an array for easy byte-level manipulation. */
function createView(arr) {
    return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
/** Is current platform little-endian? Most are. Big-Endian platform: IBM */
const isLE = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44)();
// Built-in hex conversion https://caniuse.com/mdn-javascript_builtins_uint8array_fromhex
const hasHexBuiltin = /* @__PURE__ */ (() =>
// @ts-ignore
typeof Uint8Array.from([]).toHex === 'function' && typeof Uint8Array.fromHex === 'function')();
// Array where index 0xf0 (240) is mapped to string 'f0'
const hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
/**
 * Convert byte array to hex string. Uses built-in function, when available.
 * @example bytesToHex(Uint8Array.from([0xca, 0xfe, 0x01, 0x23])) // 'cafe0123'
 */
function bytesToHex(bytes) {
    abytes(bytes);
    // @ts-ignore
    if (hasHexBuiltin)
        return bytes.toHex();
    // pre-caching improves the speed 6x
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
        hex += hexes[bytes[i]];
    }
    return hex;
}
// We use optimized technique to convert hex string to byte array
const asciis = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function asciiToBase16(ch) {
    if (ch >= asciis._0 && ch <= asciis._9)
        return ch - asciis._0; // '2' => 50-48
    if (ch >= asciis.A && ch <= asciis.F)
        return ch - (asciis.A - 10); // 'B' => 66-(65-10)
    if (ch >= asciis.a && ch <= asciis.f)
        return ch - (asciis.a - 10); // 'b' => 98-(97-10)
    return;
}
/**
 * Convert hex string to byte array. Uses built-in function, when available.
 * @example hexToBytes('cafe0123') // Uint8Array.from([0xca, 0xfe, 0x01, 0x23])
 */
function hexToBytes(hex) {
    if (typeof hex !== 'string')
        throw new Error('hex string expected, got ' + typeof hex);
    // @ts-ignore
    if (hasHexBuiltin)
        return Uint8Array.fromHex(hex);
    const hl = hex.length;
    const al = hl / 2;
    if (hl % 2)
        throw new Error('hex string expected, got unpadded hex of length ' + hl);
    const array = new Uint8Array(al);
    for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
        const n1 = asciiToBase16(hex.charCodeAt(hi));
        const n2 = asciiToBase16(hex.charCodeAt(hi + 1));
        if (n1 === undefined || n2 === undefined) {
            const char = hex[hi] + hex[hi + 1];
            throw new Error('hex string expected, got non-hex character "' + char + '" at index ' + hi);
        }
        array[ai] = n1 * 16 + n2; // multiply first octet, e.g. 'a3' => 10*16+3 => 160 + 3 => 163
    }
    return array;
}
/**
 * Converts string to bytes using UTF8 encoding.
 * @example utf8ToBytes('abc') // new Uint8Array([97, 98, 99])
 */
function utf8ToBytes(str) {
    if (typeof str !== 'string')
        throw new Error('string expected');
    return new Uint8Array(new TextEncoder().encode(str)); // https://bugzil.la/1681809
}
/**
 * Normalizes (non-hex) string or Uint8Array to Uint8Array.
 * Warning: when Uint8Array is passed, it would NOT get copied.
 * Keep in mind for future mutable operations.
 */
function toBytes(data) {
    if (typeof data === 'string')
        data = utf8ToBytes(data);
    else if (isBytes(data))
        data = copyBytes(data);
    else
        throw new Error('Uint8Array expected, got ' + typeof data);
    return data;
}
/** Compares 2 uint8array-s in kinda constant time. */
function equalBytes$1(a, b) {
    if (a.length !== b.length)
        return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++)
        diff |= a[i] ^ b[i];
    return diff === 0;
}
/**
 * Wraps a cipher: validates args, ensures encrypt() can only be called once.
 * @__NO_SIDE_EFFECTS__
 */
const wrapCipher = (params, constructor) => {
    function wrappedCipher(key, ...args) {
        // Validate key
        abytes(key);
        // Big-Endian hardware is rare. Just in case someone still decides to run ciphers:
        if (!isLE)
            throw new Error('Non little-endian hardware is not yet supported');
        // Validate nonce if nonceLength is present
        if (params.nonceLength !== undefined) {
            const nonce = args[0];
            if (!nonce)
                throw new Error('nonce / iv required');
            if (params.varSizeNonce)
                abytes(nonce);
            else
                abytes(nonce, params.nonceLength);
        }
        // Validate AAD if tagLength present
        const tagl = params.tagLength;
        if (tagl && args[1] !== undefined) {
            abytes(args[1]);
        }
        const cipher = constructor(key, ...args);
        const checkOutput = (fnLength, output) => {
            if (output !== undefined) {
                if (fnLength !== 2)
                    throw new Error('cipher output not supported');
                abytes(output);
            }
        };
        // Create wrapped cipher with validation and single-use encryption
        let called = false;
        const wrCipher = {
            encrypt(data, output) {
                if (called)
                    throw new Error('cannot encrypt() twice with same key + nonce');
                called = true;
                abytes(data);
                checkOutput(cipher.encrypt.length, output);
                return cipher.encrypt(data, output);
            },
            decrypt(data, output) {
                abytes(data);
                if (tagl && data.length < tagl)
                    throw new Error('invalid ciphertext length: smaller than tagLength=' + tagl);
                checkOutput(cipher.decrypt.length, output);
                return cipher.decrypt(data, output);
            },
        };
        return wrCipher;
    }
    Object.assign(wrappedCipher, params);
    return wrappedCipher;
};
/**
 * By default, returns u8a of length.
 * When out is available, it checks it for validity and uses it.
 */
function getOutput(expectedLength, out, onlyAligned = true) {
    if (out === undefined)
        return new Uint8Array(expectedLength);
    if (out.length !== expectedLength)
        throw new Error('invalid output length, expected ' + expectedLength + ', got: ' + out.length);
    if (onlyAligned && !isAligned32(out))
        throw new Error('invalid output, must be aligned');
    return out;
}
/** Polyfill for Safari 14. */
function setBigUint64(view, byteOffset, value, isLE) {
    if (typeof view.setBigUint64 === 'function')
        return view.setBigUint64(byteOffset, value, isLE);
    const _32n = BigInt(32);
    const _u32_max = BigInt(0xffffffff);
    const wh = Number((value >> _32n) & _u32_max);
    const wl = Number(value & _u32_max);
    const h = 0;
    const l = 4;
    view.setUint32(byteOffset + h, wh, isLE);
    view.setUint32(byteOffset + l, wl, isLE);
}
function u64Lengths(dataLength, aadLength, isLE) {
    const num = new Uint8Array(16);
    const view = createView(num);
    setBigUint64(view, 0, BigInt(aadLength), isLE);
    setBigUint64(view, 8, BigInt(dataLength), isLE);
    return num;
}
// Is byte array aligned to 4 byte offset (u32)?
function isAligned32(bytes) {
    return bytes.byteOffset % 4 === 0;
}
// copy bytes to new u8a (aligned). Because Buffer.slice is broken.
function copyBytes(bytes) {
    return Uint8Array.from(bytes);
}

/**
 * GHash from AES-GCM and its little-endian "mirror image" Polyval from AES-SIV.
 *
 * Implemented in terms of GHash with conversion function for keys
 * GCM GHASH from
 * [NIST SP800-38d](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf),
 * SIV from
 * [RFC 8452](https://datatracker.ietf.org/doc/html/rfc8452).
 *
 * GHASH   modulo: x^128 + x^7   + x^2   + x     + 1
 * POLYVAL modulo: x^128 + x^127 + x^126 + x^121 + 1
 *
 * @module
 */
// prettier-ignore
const BLOCK_SIZE$1 = 16;
// TODO: rewrite
// temporary padding buffer
const ZEROS16 = /* @__PURE__ */ new Uint8Array(16);
const ZEROS32 = u32(ZEROS16);
const POLY$1 = 0xe1; // v = 2*v % POLY
// v = 2*v % POLY
// NOTE: because x + x = 0 (add/sub is same), mul2(x) != x+x
// We can multiply any number using montgomery ladder and this function (works as double, add is simple xor)
const mul2$1 = (s0, s1, s2, s3) => {
    const hiBit = s3 & 1;
    return {
        s3: (s2 << 31) | (s3 >>> 1),
        s2: (s1 << 31) | (s2 >>> 1),
        s1: (s0 << 31) | (s1 >>> 1),
        s0: (s0 >>> 1) ^ ((POLY$1 << 24) & -(hiBit & 1)), // reduce % poly
    };
};
const swapLE = (n) => (((n >>> 0) & 0xff) << 24) |
    (((n >>> 8) & 0xff) << 16) |
    (((n >>> 16) & 0xff) << 8) |
    ((n >>> 24) & 0xff) |
    0;
/**
 * `mulX_POLYVAL(ByteReverse(H))` from spec
 * @param k mutated in place
 */
function _toGHASHKey(k) {
    k.reverse();
    const hiBit = k[15] & 1;
    // k >>= 1
    let carry = 0;
    for (let i = 0; i < k.length; i++) {
        const t = k[i];
        k[i] = (t >>> 1) | carry;
        carry = (t & 1) << 7;
    }
    k[0] ^= -hiBit & 0xe1; // if (hiBit) n ^= 0xe1000000000000000000000000000000;
    return k;
}
const estimateWindow = (bytes) => {
    if (bytes > 64 * 1024)
        return 8;
    if (bytes > 1024)
        return 4;
    return 2;
};
class GHASH {
    // We select bits per window adaptively based on expectedLength
    constructor(key, expectedLength) {
        this.blockLen = BLOCK_SIZE$1;
        this.outputLen = BLOCK_SIZE$1;
        this.s0 = 0;
        this.s1 = 0;
        this.s2 = 0;
        this.s3 = 0;
        this.finished = false;
        key = toBytes(key);
        abytes(key, 16);
        const kView = createView(key);
        let k0 = kView.getUint32(0, false);
        let k1 = kView.getUint32(4, false);
        let k2 = kView.getUint32(8, false);
        let k3 = kView.getUint32(12, false);
        // generate table of doubled keys (half of montgomery ladder)
        const doubles = [];
        for (let i = 0; i < 128; i++) {
            doubles.push({ s0: swapLE(k0), s1: swapLE(k1), s2: swapLE(k2), s3: swapLE(k3) });
            ({ s0: k0, s1: k1, s2: k2, s3: k3 } = mul2$1(k0, k1, k2, k3));
        }
        const W = estimateWindow(expectedLength || 1024);
        if (![1, 2, 4, 8].includes(W))
            throw new Error('ghash: invalid window size, expected 2, 4 or 8');
        this.W = W;
        const bits = 128; // always 128 bits;
        const windows = bits / W;
        const windowSize = (this.windowSize = 2 ** W);
        const items = [];
        // Create precompute table for window of W bits
        for (let w = 0; w < windows; w++) {
            // truth table: 00, 01, 10, 11
            for (let byte = 0; byte < windowSize; byte++) {
                // prettier-ignore
                let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
                for (let j = 0; j < W; j++) {
                    const bit = (byte >>> (W - j - 1)) & 1;
                    if (!bit)
                        continue;
                    const { s0: d0, s1: d1, s2: d2, s3: d3 } = doubles[W * w + j];
                    (s0 ^= d0), (s1 ^= d1), (s2 ^= d2), (s3 ^= d3);
                }
                items.push({ s0, s1, s2, s3 });
            }
        }
        this.t = items;
    }
    _updateBlock(s0, s1, s2, s3) {
        (s0 ^= this.s0), (s1 ^= this.s1), (s2 ^= this.s2), (s3 ^= this.s3);
        const { W, t, windowSize } = this;
        // prettier-ignore
        let o0 = 0, o1 = 0, o2 = 0, o3 = 0;
        const mask = (1 << W) - 1; // 2**W will kill performance.
        let w = 0;
        for (const num of [s0, s1, s2, s3]) {
            for (let bytePos = 0; bytePos < 4; bytePos++) {
                const byte = (num >>> (8 * bytePos)) & 0xff;
                for (let bitPos = 8 / W - 1; bitPos >= 0; bitPos--) {
                    const bit = (byte >>> (W * bitPos)) & mask;
                    const { s0: e0, s1: e1, s2: e2, s3: e3 } = t[w * windowSize + bit];
                    (o0 ^= e0), (o1 ^= e1), (o2 ^= e2), (o3 ^= e3);
                    w += 1;
                }
            }
        }
        this.s0 = o0;
        this.s1 = o1;
        this.s2 = o2;
        this.s3 = o3;
    }
    update(data) {
        aexists(this);
        data = toBytes(data);
        abytes(data);
        const b32 = u32(data);
        const blocks = Math.floor(data.length / BLOCK_SIZE$1);
        const left = data.length % BLOCK_SIZE$1;
        for (let i = 0; i < blocks; i++) {
            this._updateBlock(b32[i * 4 + 0], b32[i * 4 + 1], b32[i * 4 + 2], b32[i * 4 + 3]);
        }
        if (left) {
            ZEROS16.set(data.subarray(blocks * BLOCK_SIZE$1));
            this._updateBlock(ZEROS32[0], ZEROS32[1], ZEROS32[2], ZEROS32[3]);
            clean(ZEROS32); // clean tmp buffer
        }
        return this;
    }
    destroy() {
        const { t } = this;
        // clean precompute table
        for (const elm of t) {
            (elm.s0 = 0), (elm.s1 = 0), (elm.s2 = 0), (elm.s3 = 0);
        }
    }
    digestInto(out) {
        aexists(this);
        aoutput(out, this);
        this.finished = true;
        const { s0, s1, s2, s3 } = this;
        const o32 = u32(out);
        o32[0] = s0;
        o32[1] = s1;
        o32[2] = s2;
        o32[3] = s3;
        return out;
    }
    digest() {
        const res = new Uint8Array(BLOCK_SIZE$1);
        this.digestInto(res);
        this.destroy();
        return res;
    }
}
class Polyval extends GHASH {
    constructor(key, expectedLength) {
        key = toBytes(key);
        abytes(key);
        const ghKey = _toGHASHKey(copyBytes(key));
        super(ghKey, expectedLength);
        clean(ghKey);
    }
    update(data) {
        data = toBytes(data);
        aexists(this);
        const b32 = u32(data);
        const left = data.length % BLOCK_SIZE$1;
        const blocks = Math.floor(data.length / BLOCK_SIZE$1);
        for (let i = 0; i < blocks; i++) {
            this._updateBlock(swapLE(b32[i * 4 + 3]), swapLE(b32[i * 4 + 2]), swapLE(b32[i * 4 + 1]), swapLE(b32[i * 4 + 0]));
        }
        if (left) {
            ZEROS16.set(data.subarray(blocks * BLOCK_SIZE$1));
            this._updateBlock(swapLE(ZEROS32[3]), swapLE(ZEROS32[2]), swapLE(ZEROS32[1]), swapLE(ZEROS32[0]));
            clean(ZEROS32);
        }
        return this;
    }
    digestInto(out) {
        aexists(this);
        aoutput(out, this);
        this.finished = true;
        // tmp ugly hack
        const { s0, s1, s2, s3 } = this;
        const o32 = u32(out);
        o32[0] = s0;
        o32[1] = s1;
        o32[2] = s2;
        o32[3] = s3;
        return out.reverse();
    }
}
function wrapConstructorWithKey(hashCons) {
    const hashC = (msg, key) => hashCons(key, msg.length).update(toBytes(msg)).digest();
    const tmp = hashCons(new Uint8Array(16), 0);
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.create = (key, expectedLength) => hashCons(key, expectedLength);
    return hashC;
}
/** GHash MAC for AES-GCM. */
const ghash = wrapConstructorWithKey((key, expectedLength) => new GHASH(key, expectedLength));
/** Polyval MAC for AES-SIV. */
wrapConstructorWithKey((key, expectedLength) => new Polyval(key, expectedLength));

/**
 * [AES](https://en.wikipedia.org/wiki/Advanced_Encryption_Standard)
 * a.k.a. Advanced Encryption Standard
 * is a variant of Rijndael block cipher, standardized by NIST in 2001.
 * We provide the fastest available pure JS implementation.
 *
 * Data is split into 128-bit blocks. Encrypted in 10/12/14 rounds (128/192/256 bits). In every round:
 * 1. **S-box**, table substitution
 * 2. **Shift rows**, cyclic shift left of all rows of data array
 * 3. **Mix columns**, multiplying every column by fixed polynomial
 * 4. **Add round key**, round_key xor i-th column of array
 *
 * Check out [FIPS-197](https://csrc.nist.gov/files/pubs/fips/197/final/docs/fips-197.pdf)
 * and [original proposal](https://csrc.nist.gov/csrc/media/projects/cryptographic-standards-and-guidelines/documents/aes-development/rijndael-ammended.pdf)
 * @module
 */
const BLOCK_SIZE = 16;
const BLOCK_SIZE32 = 4;
const EMPTY_BLOCK = /* @__PURE__ */ new Uint8Array(BLOCK_SIZE);
const POLY = 0x11b; // 1 + x + x**3 + x**4 + x**8
// TODO: remove multiplication, binary ops only
function mul2(n) {
    return (n << 1) ^ (POLY & -(n >> 7));
}
function mul(a, b) {
    let res = 0;
    for (; b > 0; b >>= 1) {
        // Montgomery ladder
        res ^= a & -(b & 1); // if (b&1) res ^=a (but const-time).
        a = mul2(a); // a = 2*a
    }
    return res;
}
// AES S-box is generated using finite field inversion,
// an affine transform, and xor of a constant 0x63.
const sbox = /* @__PURE__ */ (() => {
    const t = new Uint8Array(256);
    for (let i = 0, x = 1; i < 256; i++, x ^= mul2(x))
        t[i] = x;
    const box = new Uint8Array(256);
    box[0] = 0x63; // first elm
    for (let i = 0; i < 255; i++) {
        let x = t[255 - i];
        x |= x << 8;
        box[t[i]] = (x ^ (x >> 4) ^ (x >> 5) ^ (x >> 6) ^ (x >> 7) ^ 0x63) & 0xff;
    }
    clean(t);
    return box;
})();
// Rotate u32 by 8
const rotr32_8 = (n) => (n << 24) | (n >>> 8);
const rotl32_8 = (n) => (n << 8) | (n >>> 24);
// T-table is optimization suggested in 5.2 of original proposal (missed from FIPS-197). Changes:
// - LE instead of BE
// - bigger tables: T0 and T1 are merged into T01 table and T2 & T3 into T23;
//   so index is u16, instead of u8. This speeds up things, unexpectedly
function genTtable(sbox, fn) {
    if (sbox.length !== 256)
        throw new Error('Wrong sbox length');
    const T0 = new Uint32Array(256).map((_, j) => fn(sbox[j]));
    const T1 = T0.map(rotl32_8);
    const T2 = T1.map(rotl32_8);
    const T3 = T2.map(rotl32_8);
    const T01 = new Uint32Array(256 * 256);
    const T23 = new Uint32Array(256 * 256);
    const sbox2 = new Uint16Array(256 * 256);
    for (let i = 0; i < 256; i++) {
        for (let j = 0; j < 256; j++) {
            const idx = i * 256 + j;
            T01[idx] = T0[i] ^ T1[j];
            T23[idx] = T2[i] ^ T3[j];
            sbox2[idx] = (sbox[i] << 8) | sbox[j];
        }
    }
    return { sbox, sbox2, T0, T1, T2, T3, T01, T23 };
}
const tableEncoding = /* @__PURE__ */ genTtable(sbox, (s) => (mul(s, 3) << 24) | (s << 16) | (s << 8) | mul(s, 2));
const xPowers = /* @__PURE__ */ (() => {
    const p = new Uint8Array(16);
    for (let i = 0, x = 1; i < 16; i++, x = mul2(x))
        p[i] = x;
    return p;
})();
/** Key expansion used in CTR. */
function expandKeyLE(key) {
    abytes(key);
    const len = key.length;
    if (![16, 24, 32].includes(len))
        throw new Error('aes: invalid key size, should be 16, 24 or 32, got ' + len);
    const { sbox2 } = tableEncoding;
    const toClean = [];
    if (!isAligned32(key))
        toClean.push((key = copyBytes(key)));
    const k32 = u32(key);
    const Nk = k32.length;
    const subByte = (n) => applySbox(sbox2, n, n, n, n);
    const xk = new Uint32Array(len + 28); // expanded key
    xk.set(k32);
    // 4.3.1 Key expansion
    for (let i = Nk; i < xk.length; i++) {
        let t = xk[i - 1];
        if (i % Nk === 0)
            t = subByte(rotr32_8(t)) ^ xPowers[i / Nk - 1];
        else if (Nk > 6 && i % Nk === 4)
            t = subByte(t);
        xk[i] = xk[i - Nk] ^ t;
    }
    clean(...toClean);
    return xk;
}
// Apply tables
function apply0123(T01, T23, s0, s1, s2, s3) {
    return (T01[((s0 << 8) & 0xff00) | ((s1 >>> 8) & 0xff)] ^
        T23[((s2 >>> 8) & 0xff00) | ((s3 >>> 24) & 0xff)]);
}
function applySbox(sbox2, s0, s1, s2, s3) {
    return (sbox2[(s0 & 0xff) | (s1 & 0xff00)] |
        (sbox2[((s2 >>> 16) & 0xff) | ((s3 >>> 16) & 0xff00)] << 16));
}
function encrypt(xk, s0, s1, s2, s3) {
    const { sbox2, T01, T23 } = tableEncoding;
    let k = 0;
    (s0 ^= xk[k++]), (s1 ^= xk[k++]), (s2 ^= xk[k++]), (s3 ^= xk[k++]);
    const rounds = xk.length / 4 - 2;
    for (let i = 0; i < rounds; i++) {
        const t0 = xk[k++] ^ apply0123(T01, T23, s0, s1, s2, s3);
        const t1 = xk[k++] ^ apply0123(T01, T23, s1, s2, s3, s0);
        const t2 = xk[k++] ^ apply0123(T01, T23, s2, s3, s0, s1);
        const t3 = xk[k++] ^ apply0123(T01, T23, s3, s0, s1, s2);
        (s0 = t0), (s1 = t1), (s2 = t2), (s3 = t3);
    }
    // last round (without mixcolumns, so using SBOX2 table)
    const t0 = xk[k++] ^ applySbox(sbox2, s0, s1, s2, s3);
    const t1 = xk[k++] ^ applySbox(sbox2, s1, s2, s3, s0);
    const t2 = xk[k++] ^ applySbox(sbox2, s2, s3, s0, s1);
    const t3 = xk[k++] ^ applySbox(sbox2, s3, s0, s1, s2);
    return { s0: t0, s1: t1, s2: t2, s3: t3 };
}
// AES CTR with overflowing 32 bit counter
// It's possible to do 32le significantly simpler (and probably faster) by using u32.
// But, we need both, and perf bottleneck is in ghash anyway.
function ctr32(xk, isLE, nonce, src, dst) {
    abytes(nonce, BLOCK_SIZE);
    abytes(src);
    dst = getOutput(src.length, dst);
    const ctr = nonce; // write new value to nonce, so it can be re-used
    const c32 = u32(ctr);
    const view = createView(ctr);
    const src32 = u32(src);
    const dst32 = u32(dst);
    const ctrPos = isLE ? 0 : 12;
    const srcLen = src.length;
    // Fill block (empty, ctr=0)
    let ctrNum = view.getUint32(ctrPos, isLE); // read current counter value
    let { s0, s1, s2, s3 } = encrypt(xk, c32[0], c32[1], c32[2], c32[3]);
    // process blocks
    for (let i = 0; i + 4 <= src32.length; i += 4) {
        dst32[i + 0] = src32[i + 0] ^ s0;
        dst32[i + 1] = src32[i + 1] ^ s1;
        dst32[i + 2] = src32[i + 2] ^ s2;
        dst32[i + 3] = src32[i + 3] ^ s3;
        ctrNum = (ctrNum + 1) >>> 0; // u32 wrap
        view.setUint32(ctrPos, ctrNum, isLE);
        ({ s0, s1, s2, s3 } = encrypt(xk, c32[0], c32[1], c32[2], c32[3]));
    }
    // leftovers (less than a block)
    const start = BLOCK_SIZE * Math.floor(src32.length / BLOCK_SIZE32);
    if (start < srcLen) {
        const b32 = new Uint32Array([s0, s1, s2, s3]);
        const buf = u8(b32);
        for (let i = start, pos = 0; i < srcLen; i++, pos++)
            dst[i] = src[i] ^ buf[pos];
        clean(b32);
    }
    return dst;
}
// TODO: merge with chacha, however gcm has bitLen while chacha has byteLen
function computeTag(fn, isLE, key, data, AAD) {
    const aadLength = AAD ? AAD.length : 0;
    const h = fn.create(key, data.length + aadLength);
    if (AAD)
        h.update(AAD);
    const num = u64Lengths(8 * data.length, 8 * aadLength, isLE);
    h.update(data);
    h.update(num);
    const res = h.digest();
    clean(num);
    return res;
}
/**
 * GCM: Galois/Counter Mode.
 * Modern, parallel version of CTR, with MAC.
 * Be careful: MACs can be forged.
 * Unsafe to use random nonces under the same key, due to collision chance.
 * As for nonce size, prefer 12-byte, instead of 8-byte.
 */
const gcm = /* @__PURE__ */ wrapCipher({ blockSize: 16, nonceLength: 12, tagLength: 16, varSizeNonce: true }, function aesgcm(key, nonce, AAD) {
    // NIST 800-38d doesn't enforce minimum nonce length.
    // We enforce 8 bytes for compat with openssl.
    // 12 bytes are recommended. More than 12 bytes would be converted into 12.
    if (nonce.length < 8)
        throw new Error('aes/gcm: invalid nonce length');
    const tagLength = 16;
    function _computeTag(authKey, tagMask, data) {
        const tag = computeTag(ghash, false, authKey, data, AAD);
        for (let i = 0; i < tagMask.length; i++)
            tag[i] ^= tagMask[i];
        return tag;
    }
    function deriveKeys() {
        const xk = expandKeyLE(key);
        const authKey = EMPTY_BLOCK.slice();
        const counter = EMPTY_BLOCK.slice();
        ctr32(xk, false, counter, counter, authKey);
        // NIST 800-38d, page 15: different behavior for 96-bit and non-96-bit nonces
        if (nonce.length === 12) {
            counter.set(nonce);
        }
        else {
            const nonceLen = EMPTY_BLOCK.slice();
            const view = createView(nonceLen);
            setBigUint64(view, 8, BigInt(nonce.length * 8), false);
            // ghash(nonce || u64be(0) || u64be(nonceLen*8))
            const g = ghash.create(authKey).update(nonce).update(nonceLen);
            g.digestInto(counter); // digestInto doesn't trigger '.destroy'
            g.destroy();
        }
        const tagMask = ctr32(xk, false, counter, EMPTY_BLOCK);
        return { xk, authKey, counter, tagMask };
    }
    return {
        encrypt(plaintext) {
            const { xk, authKey, counter, tagMask } = deriveKeys();
            const out = new Uint8Array(plaintext.length + tagLength);
            const toClean = [xk, authKey, counter, tagMask];
            if (!isAligned32(plaintext))
                toClean.push((plaintext = copyBytes(plaintext)));
            ctr32(xk, false, counter, plaintext, out.subarray(0, plaintext.length));
            const tag = _computeTag(authKey, tagMask, out.subarray(0, out.length - tagLength));
            toClean.push(tag);
            out.set(tag, plaintext.length);
            clean(...toClean);
            return out;
        },
        decrypt(ciphertext) {
            const { xk, authKey, counter, tagMask } = deriveKeys();
            const toClean = [xk, authKey, tagMask, counter];
            if (!isAligned32(ciphertext))
                toClean.push((ciphertext = copyBytes(ciphertext)));
            const data = ciphertext.subarray(0, -tagLength);
            const passedTag = ciphertext.subarray(-tagLength);
            const tag = _computeTag(authKey, tagMask, data);
            toClean.push(tag);
            if (!equalBytes$1(tag, passedTag))
                throw new Error('aes/gcm: invalid ghash tag');
            const out = ctr32(xk, false, counter, data);
            clean(...toClean);
            return out;
        },
    };
});

const Aes = {
    encryptGcm,
    decryptGcm
};
function encryptGcm(key, data, iv) {
    const stream = gcm(key, iv);
    const encrypted = stream.encrypt(data);
    return encrypted;
}
function decryptGcm(key, data, iv) {
    try {
        const stream = gcm(key, iv);
        const decrypted = stream.decrypt(data);
        return decrypted;
    }
    catch (e) {
        console.error(e);
    }
    return false;
}

/**
 * SHA3 (keccak) hash function, based on a new "Sponge function" design.
 * Different from older hashes, the internal state is bigger than output size.
 *
 * Check out [FIPS-202](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.202.pdf),
 * [Website](https://keccak.team/keccak.html),
 * [the differences between SHA-3 and Keccak](https://crypto.stackexchange.com/questions/15727/what-are-the-key-differences-between-the-draft-sha-3-standard-and-the-keccak-sub).
 *
 * Check out `sha3-addons` module for cSHAKE, k12, and others.
 * @module
 */
// No __PURE__ annotations in sha3 header:
// EVERYTHING is in fact used on every export.
// Various per round constants calculations
const _0n = BigInt(0);
const _1n = BigInt(1);
const _2n = BigInt(2);
const _7n = BigInt(7);
const _256n = BigInt(256);
const _0x71n = BigInt(0x71);
const SHA3_PI = [];
const SHA3_ROTL = [];
const _SHA3_IOTA = [];
for (let round = 0, R = _1n, x = 1, y = 0; round < 24; round++) {
    // Pi
    [x, y] = [y, (2 * x + 3 * y) % 5];
    SHA3_PI.push(2 * (5 * y + x));
    // Rotational
    SHA3_ROTL.push((((round + 1) * (round + 2)) / 2) % 64);
    // Iota
    let t = _0n;
    for (let j = 0; j < 7; j++) {
        R = ((R << _1n) ^ ((R >> _7n) * _0x71n)) % _256n;
        if (R & _2n)
            t ^= _1n << ((_1n << /* @__PURE__ */ BigInt(j)) - _1n);
    }
    _SHA3_IOTA.push(t);
}
const IOTAS = split(_SHA3_IOTA, true);
const SHA3_IOTA_H = IOTAS[0];
const SHA3_IOTA_L = IOTAS[1];
// Left rotation (without 0, 32, 64)
const rotlH = (h, l, s) => (s > 32 ? rotlBH(h, l, s) : rotlSH(h, l, s));
const rotlL = (h, l, s) => (s > 32 ? rotlBL(h, l, s) : rotlSL(h, l, s));
/** `keccakf1600` internal function, additionally allows to adjust round count. */
function keccakP(s, rounds = 24) {
    const B = new Uint32Array(5 * 2);
    // NOTE: all indices are x2 since we store state as u32 instead of u64 (bigints to slow in js)
    for (let round = 24 - rounds; round < 24; round++) {
        // Theta θ
        for (let x = 0; x < 10; x++)
            B[x] = s[x] ^ s[x + 10] ^ s[x + 20] ^ s[x + 30] ^ s[x + 40];
        for (let x = 0; x < 10; x += 2) {
            const idx1 = (x + 8) % 10;
            const idx0 = (x + 2) % 10;
            const B0 = B[idx0];
            const B1 = B[idx0 + 1];
            const Th = rotlH(B0, B1, 1) ^ B[idx1];
            const Tl = rotlL(B0, B1, 1) ^ B[idx1 + 1];
            for (let y = 0; y < 50; y += 10) {
                s[x + y] ^= Th;
                s[x + y + 1] ^= Tl;
            }
        }
        // Rho (ρ) and Pi (π)
        let curH = s[2];
        let curL = s[3];
        for (let t = 0; t < 24; t++) {
            const shift = SHA3_ROTL[t];
            const Th = rotlH(curH, curL, shift);
            const Tl = rotlL(curH, curL, shift);
            const PI = SHA3_PI[t];
            curH = s[PI];
            curL = s[PI + 1];
            s[PI] = Th;
            s[PI + 1] = Tl;
        }
        // Chi (χ)
        for (let y = 0; y < 50; y += 10) {
            for (let x = 0; x < 10; x++)
                B[x] = s[y + x];
            for (let x = 0; x < 10; x++)
                s[y + x] ^= ~B[(x + 2) % 10] & B[(x + 4) % 10];
        }
        // Iota (ι)
        s[0] ^= SHA3_IOTA_H[round];
        s[1] ^= SHA3_IOTA_L[round];
    }
    clean$1(B);
}
/** Keccak sponge function. */
class Keccak extends Hash {
    // NOTE: we accept arguments in bytes instead of bits here.
    constructor(blockLen, suffix, outputLen, enableXOF = false, rounds = 24) {
        super();
        this.pos = 0;
        this.posOut = 0;
        this.finished = false;
        this.destroyed = false;
        this.enableXOF = false;
        this.blockLen = blockLen;
        this.suffix = suffix;
        this.outputLen = outputLen;
        this.enableXOF = enableXOF;
        this.rounds = rounds;
        // Can be passed from user as dkLen
        anumber(outputLen);
        // 1600 = 5x5 matrix of 64bit.  1600 bits === 200 bytes
        // 0 < blockLen < 200
        if (!(0 < blockLen && blockLen < 200))
            throw new Error('only keccak-f1600 function is supported');
        this.state = new Uint8Array(200);
        this.state32 = u32$1(this.state);
    }
    clone() {
        return this._cloneInto();
    }
    keccak() {
        swap32IfBE(this.state32);
        keccakP(this.state32, this.rounds);
        swap32IfBE(this.state32);
        this.posOut = 0;
        this.pos = 0;
    }
    update(data) {
        aexists$1(this);
        data = toBytes$1(data);
        abytes$1(data);
        const { blockLen, state } = this;
        const len = data.length;
        for (let pos = 0; pos < len;) {
            const take = Math.min(blockLen - this.pos, len - pos);
            for (let i = 0; i < take; i++)
                state[this.pos++] ^= data[pos++];
            if (this.pos === blockLen)
                this.keccak();
        }
        return this;
    }
    finish() {
        if (this.finished)
            return;
        this.finished = true;
        const { state, suffix, pos, blockLen } = this;
        // Do the padding
        state[pos] ^= suffix;
        if ((suffix & 0x80) !== 0 && pos === blockLen - 1)
            this.keccak();
        state[blockLen - 1] ^= 0x80;
        this.keccak();
    }
    writeInto(out) {
        aexists$1(this, false);
        abytes$1(out);
        this.finish();
        const bufferOut = this.state;
        const { blockLen } = this;
        for (let pos = 0, len = out.length; pos < len;) {
            if (this.posOut >= blockLen)
                this.keccak();
            const take = Math.min(blockLen - this.posOut, len - pos);
            out.set(bufferOut.subarray(this.posOut, this.posOut + take), pos);
            this.posOut += take;
            pos += take;
        }
        return out;
    }
    xofInto(out) {
        // Sha3/Keccak usage with XOF is probably mistake, only SHAKE instances can do XOF
        if (!this.enableXOF)
            throw new Error('XOF is not possible for this instance');
        return this.writeInto(out);
    }
    xof(bytes) {
        anumber(bytes);
        return this.xofInto(new Uint8Array(bytes));
    }
    digestInto(out) {
        aoutput$1(out, this);
        if (this.finished)
            throw new Error('digest() was already called');
        this.writeInto(out);
        this.destroy();
        return out;
    }
    digest() {
        return this.digestInto(new Uint8Array(this.outputLen));
    }
    destroy() {
        this.destroyed = true;
        clean$1(this.state);
    }
    _cloneInto(to) {
        const { blockLen, suffix, outputLen, rounds, enableXOF } = this;
        to || (to = new Keccak(blockLen, suffix, outputLen, enableXOF, rounds));
        to.state32.set(this.state32);
        to.pos = this.pos;
        to.posOut = this.posOut;
        to.finished = this.finished;
        to.rounds = rounds;
        // Suffix can change in cSHAKE
        to.suffix = suffix;
        to.outputLen = outputLen;
        to.enableXOF = enableXOF;
        to.destroyed = this.destroyed;
        return to;
    }
}
const gen = (suffix, blockLen, outputLen) => createHasher(() => new Keccak(blockLen, suffix, outputLen));
/** SHA3-224 hash function. */
const sha3_224 = /* @__PURE__ */ (() => gen(0x06, 144, 224 / 8))();
/** SHA3-256 hash function. Different from keccak-256. */
const sha3_256 = /* @__PURE__ */ (() => gen(0x06, 136, 256 / 8))();
/** SHA3-384 hash function. */
const sha3_384 = /* @__PURE__ */ (() => gen(0x06, 104, 384 / 8))();
/** SHA3-512 hash function. */
const sha3_512 = /* @__PURE__ */ (() => gen(0x06, 72, 512 / 8))();
const genShake = (suffix, blockLen, outputLen) => createXOFer((opts = {}) => new Keccak(blockLen, suffix, opts.dkLen === undefined ? outputLen : opts.dkLen, true));
/** SHAKE128 XOF with 128-bit security. */
const shake128 = /* @__PURE__ */ (() => genShake(0x1f, 168, 128 / 8))();
/** SHAKE256 XOF with 256-bit security. */
const shake256 = /* @__PURE__ */ (() => genShake(0x1f, 136, 256 / 8))();

/**
 * Utilities for hex, bytearray and number handling.
 * @module
 */
/*! noble-post-quantum - MIT License (c) 2024 Paul Miller (paulmillr.com) */
const ensureBytes = abytes$1;
const randomBytes = randomBytes$1;
// Compares 2 u8a-s in kinda constant time
function equalBytes(a, b) {
    if (a.length !== b.length)
        return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++)
        diff |= a[i] ^ b[i];
    return diff === 0;
}
function splitCoder(...lengths) {
    const getLength = (c) => (typeof c === 'number' ? c : c.bytesLen);
    const bytesLen = lengths.reduce((sum, a) => sum + getLength(a), 0);
    return {
        bytesLen,
        encode: (bufs) => {
            const res = new Uint8Array(bytesLen);
            for (let i = 0, pos = 0; i < lengths.length; i++) {
                const c = lengths[i];
                const l = getLength(c);
                const b = typeof c === 'number' ? bufs[i] : c.encode(bufs[i]);
                ensureBytes(b, l);
                res.set(b, pos);
                if (typeof c !== 'number')
                    b.fill(0); // clean
                pos += l;
            }
            return res;
        },
        decode: (buf) => {
            ensureBytes(buf, bytesLen);
            const res = [];
            for (const c of lengths) {
                const l = getLength(c);
                const b = buf.subarray(0, l);
                res.push(typeof c === 'number' ? b : c.decode(b));
                buf = buf.subarray(l);
            }
            return res;
        },
    };
}
// nano-packed.array (fixed size)
function vecCoder(c, vecLen) {
    const bytesLen = vecLen * c.bytesLen;
    return {
        bytesLen,
        encode: (u) => {
            if (u.length !== vecLen)
                throw new Error(`vecCoder.encode: wrong length=${u.length}. Expected: ${vecLen}`);
            const res = new Uint8Array(bytesLen);
            for (let i = 0, pos = 0; i < u.length; i++) {
                const b = c.encode(u[i]);
                res.set(b, pos);
                b.fill(0); // clean
                pos += b.length;
            }
            return res;
        },
        decode: (a) => {
            ensureBytes(a, bytesLen);
            const r = [];
            for (let i = 0; i < a.length; i += c.bytesLen)
                r.push(c.decode(a.subarray(i, i + c.bytesLen)));
            return r;
        },
    };
}
// cleanBytes(new Uint8Array(), [new Uint16Array(), new Uint32Array()])
function cleanBytes(...list) {
    for (const t of list) {
        if (Array.isArray(t))
            for (const b of t)
                b.fill(0);
        else
            t.fill(0);
    }
}
function getMask(bits) {
    return (1 << bits) - 1; // 4 -> 0b1111
}
const EMPTY = new Uint8Array(0);
function getMessage(msg, ctx = EMPTY) {
    ensureBytes(msg);
    ensureBytes(ctx);
    if (ctx.length > 255)
        throw new Error('context should be less than 255 bytes');
    return concatBytes(new Uint8Array([0, ctx.length]), ctx, msg);
}
// OIDS from https://csrc.nist.gov/projects/computer-security-objects-register/algorithm-registration
// TODO: maybe add 'OID' property to hashes themselves to improve tree-shaking?
const HASHES = {
    'SHA2-256': { oid: hexToBytes$1('0609608648016503040201'), hash: sha256$2 },
    'SHA2-384': { oid: hexToBytes$1('0609608648016503040202'), hash: sha384 },
    'SHA2-512': { oid: hexToBytes$1('0609608648016503040203'), hash: sha512$2 },
    'SHA2-224': { oid: hexToBytes$1('0609608648016503040204'), hash: sha224 },
    'SHA2-512/224': { oid: hexToBytes$1('0609608648016503040205'), hash: sha512_224 },
    'SHA2-512/256': { oid: hexToBytes$1('0609608648016503040206'), hash: sha512_256 },
    'SHA3-224': { oid: hexToBytes$1('0609608648016503040207'), hash: sha3_224 },
    'SHA3-256': { oid: hexToBytes$1('0609608648016503040208'), hash: sha3_256 },
    'SHA3-384': { oid: hexToBytes$1('0609608648016503040209'), hash: sha3_384 },
    'SHA3-512': { oid: hexToBytes$1('060960864801650304020A'), hash: sha3_512 },
    'SHAKE-128': {
        oid: hexToBytes$1('060960864801650304020B'),
        hash: (msg) => shake128(msg, { dkLen: 32 }),
    },
    'SHAKE-256': {
        oid: hexToBytes$1('060960864801650304020C'),
        hash: (msg) => shake256(msg, { dkLen: 64 }),
    },
};
function getMessagePrehash(hashName, msg, ctx = EMPTY) {
    ensureBytes(msg);
    ensureBytes(ctx);
    if (ctx.length > 255)
        throw new Error('context should be less than 255 bytes');
    if (!HASHES[hashName])
        throw new Error('unknown hash: ' + hashName);
    const { oid, hash } = HASHES[hashName];
    const hashed = hash(msg);
    return concatBytes(new Uint8Array([1, ctx.length]), ctx, oid, hashed);
}

/**
 * Internal methods for lattice-based ML-KEM and ML-DSA.
 * @module
 */
/*! noble-post-quantum - MIT License (c) 2024 Paul Miller (paulmillr.com) */
// TODO: benchmark
function bitReversal(n, bits = 8) {
    const padded = n.toString(2).padStart(8, '0');
    const sliced = padded.slice(-bits).padStart(7, '0');
    const revrsd = sliced.split('').reverse().join('');
    return Number.parseInt(revrsd, 2);
}
const genCrystals = (opts) => {
    // isKyber: true means Kyber, false means Dilithium
    const { newPoly, N, Q, F, ROOT_OF_UNITY, brvBits, isKyber } = opts;
    const mod = (a, modulo = Q) => {
        const result = a % modulo | 0;
        return (result >= 0 ? result | 0 : (modulo + result) | 0) | 0;
    };
    // -(Q-1)/2 < a <= (Q-1)/2
    const smod = (a, modulo = Q) => {
        const r = mod(a, modulo) | 0;
        return (r > modulo >> 1 ? (r - modulo) | 0 : r) | 0;
    };
    // Generate zettas
    function getZettas() {
        const out = newPoly(N);
        for (let i = 0; i < N; i++) {
            const b = bitReversal(i, brvBits);
            const p = BigInt(ROOT_OF_UNITY) ** BigInt(b) % BigInt(Q);
            out[i] = Number(p) | 0;
        }
        return out;
    }
    const nttZetas = getZettas();
    // Number-Theoretic Transform
    // Explained: https://electricdusk.com/ntt.html
    // Kyber has slightly different params, since there is no 512th primitive root of unity mod q,
    // only 256th primitive root of unity mod. Which also complicates MultiplyNTT.
    // TODO: there should be less ugly way to define this.
    const LEN1 = isKyber ? 128 : N;
    const LEN2 = isKyber ? 1 : 0;
    const NTT = {
        encode: (r) => {
            for (let k = 1, len = 128; len > LEN2; len >>= 1) {
                for (let start = 0; start < N; start += 2 * len) {
                    const zeta = nttZetas[k++];
                    for (let j = start; j < start + len; j++) {
                        const t = mod(zeta * r[j + len]);
                        r[j + len] = mod(r[j] - t) | 0;
                        r[j] = mod(r[j] + t) | 0;
                    }
                }
            }
            return r;
        },
        decode: (r) => {
            for (let k = LEN1 - 1, len = 1 + LEN2; len < LEN1 + LEN2; len <<= 1) {
                for (let start = 0; start < N; start += 2 * len) {
                    const zeta = nttZetas[k--];
                    for (let j = start; j < start + len; j++) {
                        const t = r[j];
                        r[j] = mod(t + r[j + len]);
                        r[j + len] = mod(zeta * (r[j + len] - t));
                    }
                }
            }
            for (let i = 0; i < r.length; i++)
                r[i] = mod(F * r[i]);
            return r;
        },
    };
    // Encode polynominal as bits
    const bitsCoder = (d, c) => {
        const mask = getMask(d);
        const bytesLen = d * (N / 8);
        return {
            bytesLen,
            encode: (poly) => {
                const r = new Uint8Array(bytesLen);
                for (let i = 0, buf = 0, bufLen = 0, pos = 0; i < poly.length; i++) {
                    buf |= (c.encode(poly[i]) & mask) << bufLen;
                    bufLen += d;
                    for (; bufLen >= 8; bufLen -= 8, buf >>= 8)
                        r[pos++] = buf & getMask(bufLen);
                }
                return r;
            },
            decode: (bytes) => {
                const r = newPoly(N);
                for (let i = 0, buf = 0, bufLen = 0, pos = 0; i < bytes.length; i++) {
                    buf |= bytes[i] << bufLen;
                    bufLen += 8;
                    for (; bufLen >= d; bufLen -= d, buf >>= d)
                        r[pos++] = c.decode(buf & mask);
                }
                return r;
            },
        };
    };
    return { mod, smod, nttZetas, NTT, bitsCoder };
};
const createXofShake = (shake) => (seed, blockLen) => {
    if (!blockLen)
        blockLen = shake.blockLen;
    // Optimizations that won't mater:
    // - cached seed update (two .update(), on start and on the end)
    // - another cache which cloned into working copy
    // Faster than multiple updates, since seed less than blockLen
    const _seed = new Uint8Array(seed.length + 2);
    _seed.set(seed);
    const seedLen = seed.length;
    const buf = new Uint8Array(blockLen); // == shake128.blockLen
    let h = shake.create({});
    let calls = 0;
    let xofs = 0;
    return {
        stats: () => ({ calls, xofs }),
        get: (x, y) => {
            _seed[seedLen + 0] = x;
            _seed[seedLen + 1] = y;
            h.destroy();
            h = shake.create({}).update(_seed);
            calls++;
            return () => {
                xofs++;
                return h.xofInto(buf);
            };
        },
        clean: () => {
            h.destroy();
            buf.fill(0);
            _seed.fill(0);
        },
    };
};
const XOF128 = /* @__PURE__ */ createXofShake(shake128);
const XOF256 = /* @__PURE__ */ createXofShake(shake256);

/**
 * ML-DSA: Module Lattice-based Digital Signature Algorithm from
 * [FIPS-204](https://csrc.nist.gov/pubs/fips/204/ipd). A.k.a. CRYSTALS-Dilithium.
 *
 * Has similar internals to ML-KEM, but their keys and params are different.
 * Check out [official site](https://www.pq-crystals.org/dilithium/index.shtml),
 * [repo](https://github.com/pq-crystals/dilithium).
 * @module
 */
/*! noble-post-quantum - MIT License (c) 2024 Paul Miller (paulmillr.com) */
// Constants
const N$1 = 256;
// 2**23 − 2**13 + 1, 23 bits: multiply will be 46. We have enough precision in JS to avoid bigints
const Q$1 = 8380417;
const ROOT_OF_UNITY$1 = 1753;
// f = 256**−1 mod q, pow(256, -1, q) = 8347681 (python3)
const F$1 = 8347681;
const D = 13;
// Dilithium is kinda parametrized over GAMMA2, but everything will break with any other value.
const GAMMA2_1 = Math.floor((Q$1 - 1) / 88) | 0;
const GAMMA2_2 = Math.floor((Q$1 - 1) / 32) | 0;
/** Internal params for different versions of ML-DSA  */
// prettier-ignore
const PARAMS$1 = {
    3: { K: 6, L: 5, D, GAMMA1: 2 ** 19, GAMMA2: GAMMA2_2, TAU: 49, ETA: 4, OMEGA: 55 }};
const newPoly = (n) => new Int32Array(n);
const { mod: mod$1, smod, NTT: NTT$1, bitsCoder: bitsCoder$1 } = genCrystals({
    N: N$1,
    Q: Q$1,
    F: F$1,
    ROOT_OF_UNITY: ROOT_OF_UNITY$1,
    newPoly,
    isKyber: false,
    brvBits: 8,
});
const id = (n) => n;
const polyCoder$1 = (d, compress = id, verify = id) => bitsCoder$1(d, {
    encode: (i) => compress(verify(i)),
    decode: (i) => verify(compress(i)),
});
const polyAdd$1 = (a, b) => {
    for (let i = 0; i < a.length; i++)
        a[i] = mod$1(a[i] + b[i]);
    return a;
};
const polySub$1 = (a, b) => {
    for (let i = 0; i < a.length; i++)
        a[i] = mod$1(a[i] - b[i]);
    return a;
};
const polyShiftl = (p) => {
    for (let i = 0; i < N$1; i++)
        p[i] <<= D;
    return p;
};
const polyChknorm = (p, B) => {
    // Not very sure about this, but FIPS204 doesn't provide any function for that :(
    for (let i = 0; i < N$1; i++)
        if (Math.abs(smod(p[i])) >= B)
            return true;
    return false;
};
const MultiplyNTTs$1 = (a, b) => {
    // NOTE: we don't use montgomery reduction in code, since it requires 64 bit ints,
    // which is not available in JS. mod(a[i] * b[i]) is ok, since Q is 23 bit,
    // which means a[i] * b[i] is 46 bit, which is safe to use in JS. (number is 53 bits).
    // Barrett reduction is slower than mod :(
    const c = newPoly(N$1);
    for (let i = 0; i < a.length; i++)
        c[i] = mod$1(a[i] * b[i]);
    return c;
};
// Return poly in NTT representation
function RejNTTPoly(xof) {
    // Samples a polynomial ∈ Tq.
    const r = newPoly(N$1);
    // NOTE: we can represent 3xu24 as 4xu32, but it doesn't improve perf :(
    for (let j = 0; j < N$1;) {
        const b = xof();
        if (b.length % 3)
            throw new Error('RejNTTPoly: unaligned block');
        for (let i = 0; j < N$1 && i <= b.length - 3; i += 3) {
            const t = (b[i + 0] | (b[i + 1] << 8) | (b[i + 2] << 16)) & 0x7fffff; // 3 bytes
            if (t < Q$1)
                r[j++] = t;
        }
    }
    return r;
}
function getDilithium(opts) {
    const { K, L, GAMMA1, GAMMA2, TAU, ETA, OMEGA } = opts;
    const { CRH_BYTES, TR_BYTES, C_TILDE_BYTES, XOF128, XOF256 } = opts;
    if (![2, 4].includes(ETA))
        throw new Error('Wrong ETA');
    if (![1 << 17, 1 << 19].includes(GAMMA1))
        throw new Error('Wrong GAMMA1');
    if (![GAMMA2_1, GAMMA2_2].includes(GAMMA2))
        throw new Error('Wrong GAMMA2');
    const BETA = TAU * ETA;
    const decompose = (r) => {
        // Decomposes r into (r1, r0) such that r ≡ r1(2γ2) + r0 mod q.
        const rPlus = mod$1(r);
        const r0 = smod(rPlus, 2 * GAMMA2) | 0;
        if (rPlus - r0 === Q$1 - 1)
            return { r1: 0 | 0, r0: (r0 - 1) | 0 };
        const r1 = Math.floor((rPlus - r0) / (2 * GAMMA2)) | 0;
        return { r1, r0 }; // r1 = HighBits, r0 = LowBits
    };
    const HighBits = (r) => decompose(r).r1;
    const LowBits = (r) => decompose(r).r0;
    const MakeHint = (z, r) => {
        // Compute hint bit indicating whether adding z to r alters the high bits of r.
        // From dilithium code
        const res0 = z <= GAMMA2 || z > Q$1 - GAMMA2 || (z === Q$1 - GAMMA2 && r === 0) ? 0 : 1;
        // from FIPS204:
        // // const r1 = HighBits(r);
        // // const v1 = HighBits(r + z);
        // // const res1 = +(r1 !== v1);
        // But they return different results! However, decompose is same.
        // So, either there is a bug in Dilithium ref implementation or in FIPS204.
        // For now, lets use dilithium one, so test vectors can be passed.
        // See
        // https://github.com/GiacomoPope/dilithium-py?tab=readme-ov-file#optimising-decomposition-and-making-hints
        return res0;
    };
    const UseHint = (h, r) => {
        // Returns the high bits of r adjusted according to hint h
        const m = Math.floor((Q$1 - 1) / (2 * GAMMA2));
        const { r1, r0 } = decompose(r);
        // 3: if h = 1 and r0 > 0 return (r1 + 1) mod m
        // 4: if h = 1 and r0 ≤ 0 return (r1 − 1) mod m
        if (h === 1)
            return r0 > 0 ? mod$1(r1 + 1, m) | 0 : mod$1(r1 - 1, m) | 0;
        return r1 | 0;
    };
    const Power2Round = (r) => {
        // Decomposes r into (r1, r0) such that r ≡ r1*(2**d) + r0 mod q.
        const rPlus = mod$1(r);
        const r0 = smod(rPlus, 2 ** D) | 0;
        return { r1: Math.floor((rPlus - r0) / 2 ** D) | 0, r0 };
    };
    const hintCoder = {
        bytesLen: OMEGA + K,
        encode: (h) => {
            if (h === false)
                throw new Error('hint.encode: hint is false'); // should never happen
            const res = new Uint8Array(OMEGA + K);
            for (let i = 0, k = 0; i < K; i++) {
                for (let j = 0; j < N$1; j++)
                    if (h[i][j] !== 0)
                        res[k++] = j;
                res[OMEGA + i] = k;
            }
            return res;
        },
        decode: (buf) => {
            const h = [];
            let k = 0;
            for (let i = 0; i < K; i++) {
                const hi = newPoly(N$1);
                if (buf[OMEGA + i] < k || buf[OMEGA + i] > OMEGA)
                    return false;
                for (let j = k; j < buf[OMEGA + i]; j++) {
                    if (j > k && buf[j] <= buf[j - 1])
                        return false;
                    hi[buf[j]] = 1;
                }
                k = buf[OMEGA + i];
                h.push(hi);
            }
            for (let j = k; j < OMEGA; j++)
                if (buf[j] !== 0)
                    return false;
            return h;
        },
    };
    const ETACoder = polyCoder$1(ETA === 2 ? 3 : 4, (i) => ETA - i, (i) => {
        if (!(-ETA <= i && i <= ETA))
            throw new Error(`malformed key s1/s3 ${i} outside of ETA range [${-ETA}, ${ETA}]`);
        return i;
    });
    const T0Coder = polyCoder$1(13, (i) => (1 << (D - 1)) - i);
    const T1Coder = polyCoder$1(10);
    // Requires smod. Need to fix!
    const ZCoder = polyCoder$1(GAMMA1 === 1 << 17 ? 18 : 20, (i) => smod(GAMMA1 - i));
    const W1Coder = polyCoder$1(GAMMA2 === GAMMA2_1 ? 6 : 4);
    const W1Vec = vecCoder(W1Coder, K);
    // Main structures
    const publicCoder = splitCoder(32, vecCoder(T1Coder, K));
    const secretCoder = splitCoder(32, 32, TR_BYTES, vecCoder(ETACoder, L), vecCoder(ETACoder, K), vecCoder(T0Coder, K));
    const sigCoder = splitCoder(C_TILDE_BYTES, vecCoder(ZCoder, L), hintCoder);
    const CoefFromHalfByte = ETA === 2
        ? (n) => (n < 15 ? 2 - (n % 5) : false)
        : (n) => (n < 9 ? 4 - n : false);
    // Return poly in NTT representation
    function RejBoundedPoly(xof) {
        // Samples an element a ∈ Rq with coeffcients in [−η, η] computed via rejection sampling from ρ.
        const r = newPoly(N$1);
        for (let j = 0; j < N$1;) {
            const b = xof();
            for (let i = 0; j < N$1 && i < b.length; i += 1) {
                // half byte. Should be superfast with vector instructions. But very slow with js :(
                const d1 = CoefFromHalfByte(b[i] & 0x0f);
                const d2 = CoefFromHalfByte((b[i] >> 4) & 0x0f);
                if (d1 !== false)
                    r[j++] = d1;
                if (j < N$1 && d2 !== false)
                    r[j++] = d2;
            }
        }
        return r;
    }
    const SampleInBall = (seed) => {
        // Samples a polynomial c ∈ Rq with coeffcients from {−1, 0, 1} and Hamming weight τ
        const pre = newPoly(N$1);
        const s = shake256.create({}).update(seed);
        const buf = new Uint8Array(shake256.blockLen);
        s.xofInto(buf);
        const masks = buf.slice(0, 8);
        for (let i = N$1 - TAU, pos = 8, maskPos = 0, maskBit = 0; i < N$1; i++) {
            let b = i + 1;
            for (; b > i;) {
                b = buf[pos++];
                if (pos < shake256.blockLen)
                    continue;
                s.xofInto(buf);
                pos = 0;
            }
            pre[i] = pre[b];
            pre[b] = 1 - (((masks[maskPos] >> maskBit++) & 1) << 1);
            if (maskBit >= 8) {
                maskPos++;
                maskBit = 0;
            }
        }
        return pre;
    };
    const polyPowerRound = (p) => {
        const res0 = newPoly(N$1);
        const res1 = newPoly(N$1);
        for (let i = 0; i < p.length; i++) {
            const { r0, r1 } = Power2Round(p[i]);
            res0[i] = r0;
            res1[i] = r1;
        }
        return { r0: res0, r1: res1 };
    };
    const polyUseHint = (u, h) => {
        for (let i = 0; i < N$1; i++)
            u[i] = UseHint(h[i], u[i]);
        return u;
    };
    const polyMakeHint = (a, b) => {
        const v = newPoly(N$1);
        let cnt = 0;
        for (let i = 0; i < N$1; i++) {
            const h = MakeHint(a[i], b[i]);
            v[i] = h;
            cnt += h;
        }
        return { v, cnt };
    };
    const signRandBytes = 32;
    const seedCoder = splitCoder(32, 64, 32);
    // API & argument positions are exactly as in FIPS204.
    const internal = {
        signRandBytes,
        keygen: (seed) => {
            // H(𝜉||IntegerToBytes(𝑘, 1)||IntegerToBytes(ℓ, 1), 128) 2: ▷ expand seed
            const seedDst = new Uint8Array(32 + 2);
            const randSeed = seed === undefined;
            if (randSeed)
                seed = randomBytes(32);
            ensureBytes(seed, 32);
            seedDst.set(seed);
            if (randSeed)
                seed.fill(0);
            seedDst[32] = K;
            seedDst[33] = L;
            const [rho, rhoPrime, K_] = seedCoder.decode(shake256(seedDst, { dkLen: seedCoder.bytesLen }));
            const xofPrime = XOF256(rhoPrime);
            const s1 = [];
            for (let i = 0; i < L; i++)
                s1.push(RejBoundedPoly(xofPrime.get(i & 0xff, (i >> 8) & 0xff)));
            const s2 = [];
            for (let i = L; i < L + K; i++)
                s2.push(RejBoundedPoly(xofPrime.get(i & 0xff, (i >> 8) & 0xff)));
            const s1Hat = s1.map((i) => NTT$1.encode(i.slice()));
            const t0 = [];
            const t1 = [];
            const xof = XOF128(rho);
            const t = newPoly(N$1);
            for (let i = 0; i < K; i++) {
                // t ← NTT−1(A*NTT(s1)) + s2
                t.fill(0); // don't-reallocate
                for (let j = 0; j < L; j++) {
                    const aij = RejNTTPoly(xof.get(j, i)); // super slow!
                    polyAdd$1(t, MultiplyNTTs$1(aij, s1Hat[j]));
                }
                NTT$1.decode(t);
                const { r0, r1 } = polyPowerRound(polyAdd$1(t, s2[i])); // (t1, t0) ← Power2Round(t, d)
                t0.push(r0);
                t1.push(r1);
            }
            const publicKey = publicCoder.encode([rho, t1]); // pk ← pkEncode(ρ, t1)
            const tr = shake256(publicKey, { dkLen: TR_BYTES }); // tr ← H(BytesToBits(pk), 512)
            const secretKey = secretCoder.encode([rho, K_, tr, s1, s2, t0]); // sk ← skEncode(ρ, K,tr, s1, s2, t0)
            xof.clean();
            xofPrime.clean();
            // STATS
            // Kyber512:  { calls: 4, xofs: 12 }, Kyber768: { calls: 9, xofs: 27 }, Kyber1024: { calls: 16, xofs: 48 }
            // DSA44:    { calls: 24, xofs: 24 }, DSA65:    { calls: 41, xofs: 41 }, DSA87:    { calls: 71, xofs: 71 }
            cleanBytes(rho, rhoPrime, K_, s1, s2, s1Hat, t, t0, t1, tr, seedDst);
            return { publicKey, secretKey };
        },
        // NOTE: random is optional.
        sign: (secretKey, msg, random, externalMu = false) => {
            // This part can be pre-cached per secretKey, but there is only minor performance improvement,
            // since we re-use a lot of variables to computation.
            const [rho, _K, tr, s1, s2, t0] = secretCoder.decode(secretKey); // (ρ, K,tr, s1, s2, t0) ← skDecode(sk)
            // Cache matrix to avoid re-compute later
            const A = []; // A ← ExpandA(ρ)
            const xof = XOF128(rho);
            for (let i = 0; i < K; i++) {
                const pv = [];
                for (let j = 0; j < L; j++)
                    pv.push(RejNTTPoly(xof.get(j, i)));
                A.push(pv);
            }
            xof.clean();
            for (let i = 0; i < L; i++)
                NTT$1.encode(s1[i]); // sˆ1 ← NTT(s1)
            for (let i = 0; i < K; i++) {
                NTT$1.encode(s2[i]); // sˆ2 ← NTT(s2)
                NTT$1.encode(t0[i]); // tˆ0 ← NTT(t0)
            }
            // This part is per msg
            const mu = externalMu
                ? msg
                : shake256.create({ dkLen: CRH_BYTES }).update(tr).update(msg).digest(); // 6: µ ← H(tr||M, 512) ▷ Compute message representative µ
            // Compute private random seed
            const rnd = random ? random : new Uint8Array(32);
            ensureBytes(rnd);
            const rhoprime = shake256
                .create({ dkLen: CRH_BYTES })
                .update(_K)
                .update(rnd)
                .update(mu)
                .digest(); // ρ′← H(K||rnd||µ, 512)
            ensureBytes(rhoprime, CRH_BYTES);
            const x256 = XOF256(rhoprime, ZCoder.bytesLen);
            //  Rejection sampling loop
            main_loop: for (let kappa = 0;;) {
                const y = [];
                // y ← ExpandMask(ρ , κ)
                for (let i = 0; i < L; i++, kappa++)
                    y.push(ZCoder.decode(x256.get(kappa & 0xff, kappa >> 8)()));
                const z = y.map((i) => NTT$1.encode(i.slice()));
                const w = [];
                for (let i = 0; i < K; i++) {
                    // w ← NTT−1(A ◦ NTT(y))
                    const wi = newPoly(N$1);
                    for (let j = 0; j < L; j++)
                        polyAdd$1(wi, MultiplyNTTs$1(A[i][j], z[j]));
                    NTT$1.decode(wi);
                    w.push(wi);
                }
                const w1 = w.map((j) => j.map(HighBits)); // w1 ← HighBits(w)
                // Commitment hash: c˜ ∈{0, 1 2λ } ← H(µ||w1Encode(w1), 2λ)
                const cTilde = shake256
                    .create({ dkLen: C_TILDE_BYTES })
                    .update(mu)
                    .update(W1Vec.encode(w1))
                    .digest();
                // Verifer’s challenge
                const cHat = NTT$1.encode(SampleInBall(cTilde)); // c ← SampleInBall(c˜1); cˆ ← NTT(c)
                // ⟨⟨cs1⟩⟩ ← NTT−1(cˆ◦ sˆ1)
                const cs1 = s1.map((i) => MultiplyNTTs$1(i, cHat));
                for (let i = 0; i < L; i++) {
                    polyAdd$1(NTT$1.decode(cs1[i]), y[i]); // z ← y + ⟨⟨cs1⟩⟩
                    if (polyChknorm(cs1[i], GAMMA1 - BETA))
                        continue main_loop; // ||z||∞ ≥ γ1 − β
                }
                // cs1 is now z (▷ Signer’s response)
                let cnt = 0;
                const h = [];
                for (let i = 0; i < K; i++) {
                    const cs2 = NTT$1.decode(MultiplyNTTs$1(s2[i], cHat)); // ⟨⟨cs2⟩⟩ ← NTT−1(cˆ◦ sˆ2)
                    const r0 = polySub$1(w[i], cs2).map(LowBits); // r0 ← LowBits(w − ⟨⟨cs2⟩⟩)
                    if (polyChknorm(r0, GAMMA2 - BETA))
                        continue main_loop; // ||r0||∞ ≥ γ2 − β
                    const ct0 = NTT$1.decode(MultiplyNTTs$1(t0[i], cHat)); // ⟨⟨ct0⟩⟩ ← NTT−1(cˆ◦ tˆ0)
                    if (polyChknorm(ct0, GAMMA2))
                        continue main_loop;
                    polyAdd$1(r0, ct0);
                    // ▷ Signer’s hint
                    const hint = polyMakeHint(r0, w1[i]); // h ← MakeHint(−⟨⟨ct0⟩⟩, w− ⟨⟨cs2⟩⟩ + ⟨⟨ct0⟩⟩)
                    h.push(hint.v);
                    cnt += hint.cnt;
                }
                if (cnt > OMEGA)
                    continue; // the number of 1’s in h is greater than ω
                x256.clean();
                const res = sigCoder.encode([cTilde, cs1, h]); // σ ← sigEncode(c˜, z mod±q, h)
                // rho, _K, tr is subarray of secretKey, cannot clean.
                cleanBytes(cTilde, cs1, h, cHat, w1, w, z, y, rhoprime, mu, s1, s2, t0, ...A);
                return res;
            }
            // @ts-ignore
            throw new Error('Unreachable code path reached, report this error');
        },
        verify: (publicKey, msg, sig, externalMu = false) => {
            // ML-DSA.Verify(pk, M, σ): Verifes a signature σ for a message M.
            const [rho, t1] = publicCoder.decode(publicKey); // (ρ, t1) ← pkDecode(pk)
            const tr = shake256(publicKey, { dkLen: TR_BYTES }); // 6: tr ← H(BytesToBits(pk), 512)
            if (sig.length !== sigCoder.bytesLen)
                return false; // return false instead of exception
            const [cTilde, z, h] = sigCoder.decode(sig); // (c˜, z, h) ← sigDecode(σ), ▷ Signer’s commitment hash c ˜, response z and hint
            if (h === false)
                return false; // if h = ⊥ then return false
            for (let i = 0; i < L; i++)
                if (polyChknorm(z[i], GAMMA1 - BETA))
                    return false;
            const mu = externalMu
                ? msg
                : shake256.create({ dkLen: CRH_BYTES }).update(tr).update(msg).digest(); // 7: µ ← H(tr||M, 512)
            // Compute verifer’s challenge from c˜
            const c = NTT$1.encode(SampleInBall(cTilde)); // c ← SampleInBall(c˜1)
            const zNtt = z.map((i) => i.slice()); // zNtt = NTT(z)
            for (let i = 0; i < L; i++)
                NTT$1.encode(zNtt[i]);
            const wTick1 = [];
            const xof = XOF128(rho);
            for (let i = 0; i < K; i++) {
                const ct12d = MultiplyNTTs$1(NTT$1.encode(polyShiftl(t1[i])), c); //c * t1 * (2**d)
                const Az = newPoly(N$1); // // A * z
                for (let j = 0; j < L; j++) {
                    const aij = RejNTTPoly(xof.get(j, i)); // A[i][j] inplace
                    polyAdd$1(Az, MultiplyNTTs$1(aij, zNtt[j]));
                }
                // wApprox = A*z - c*t1 * (2**d)
                const wApprox = NTT$1.decode(polySub$1(Az, ct12d));
                // Reconstruction of signer’s commitment
                wTick1.push(polyUseHint(wApprox, h[i])); // w ′ ← UseHint(h, w'approx )
            }
            xof.clean();
            // c˜′← H (µ||w1Encode(w′1), 2λ),  Hash it; this should match c˜
            const c2 = shake256
                .create({ dkLen: C_TILDE_BYTES })
                .update(mu)
                .update(W1Vec.encode(wTick1))
                .digest();
            // Additional checks in FIPS-204:
            // [[ ||z||∞ < γ1 − β ]] and [[c ˜ = c˜′]] and [[number of 1’s in h is ≤ ω]]
            for (const t of h) {
                const sum = t.reduce((acc, i) => acc + i, 0);
                if (!(sum <= OMEGA))
                    return false;
            }
            for (const t of z)
                if (polyChknorm(t, GAMMA1 - BETA))
                    return false;
            return equalBytes(cTilde, c2);
        },
    };
    return {
        internal,
        keygen: internal.keygen,
        signRandBytes: internal.signRandBytes,
        sign: (secretKey, msg, ctx = EMPTY, random) => {
            const M = getMessage(msg, ctx);
            const res = internal.sign(secretKey, M, random);
            M.fill(0);
            return res;
        },
        verify: (publicKey, msg, sig, ctx = EMPTY) => {
            return internal.verify(publicKey, getMessage(msg, ctx), sig);
        },
        prehash: (hashName) => ({
            sign: (secretKey, msg, ctx = EMPTY, random) => {
                const M = getMessagePrehash(hashName, msg, ctx);
                const res = internal.sign(secretKey, M, random);
                M.fill(0);
                return res;
            },
            verify: (publicKey, msg, sig, ctx = EMPTY) => {
                return internal.verify(publicKey, getMessagePrehash(hashName, msg, ctx), sig);
            },
        }),
    };
}
/** ML-DSA-65 for 192-bit security level. Not recommended after 2030, as per ASD. */
const ml_dsa65 = /* @__PURE__ */ getDilithium({
    ...PARAMS$1[3],
    CRH_BYTES: 64,
    TR_BYTES: 64,
    C_TILDE_BYTES: 48,
    XOF128,
    XOF256,
});

const MLDsa = {
    generateKeyPair: generateKeyPair$1,
    sign: sign$1,
    verify: verify$1
};
function generateKeyPair$1(seed) {
    if (seed == undefined) {
        seed = randomBytes(32);
    }
    const keys = ml_dsa65.keygen(seed);
    return { publicKey: keys.publicKey, privateKey: keys.secretKey };
}
function sign$1(privateKey, data) {
    return ml_dsa65.sign(privateKey, data);
}
function verify$1(publicKey, data, signature) {
    return ml_dsa65.verify(publicKey, data, signature);
}

/**
 * ML-KEM: Module Lattice-based Key Encapsulation Mechanism from
 * [FIPS-203](https://csrc.nist.gov/pubs/fips/203/ipd). A.k.a. CRYSTALS-Kyber.
 *
 * Key encapsulation is similar to DH / ECDH (think X25519), with important differences:
 * * Unlike in ECDH, we can't verify if it was "Bob" who've sent the shared secret
 * * Unlike ECDH, it is probabalistic and relies on quality of randomness (CSPRNG).
 * * Decapsulation never throws an error, even when shared secret was
 *   encrypted by a different public key. It will just return a different shared secret.
 *
 * There are some concerns with regards to security: see
 * [djb blog](https://blog.cr.yp.to/20231003-countcorrectly.html) and
 * [mailing list](https://groups.google.com/a/list.nist.gov/g/pqc-forum/c/W2VOzy0wz_E).
 *
 * Has similar internals to ML-DSA, but their keys and params are different.
 *
 * Check out [official site](https://www.pq-crystals.org/kyber/resources.shtml),
 * [repo](https://github.com/pq-crystals/kyber),
 * [spec](https://datatracker.ietf.org/doc/draft-cfrg-schwabe-kyber/).
 * @module
 */
/*! noble-post-quantum - MIT License (c) 2024 Paul Miller (paulmillr.com) */
const N = 256; // Kyber (not FIPS-203) supports different lengths, but all std modes were using 256
const Q = 3329; // 13*(2**8)+1, modulo prime
const F = 3303; // 3303 ≡ 128**(−1) mod q (FIPS-203)
const ROOT_OF_UNITY = 17; // ζ = 17 ∈ Zq is a primitive 256-th root of unity modulo Q. ζ**128 ≡−1
const { mod, nttZetas, NTT, bitsCoder } = genCrystals({
    N,
    Q,
    F,
    ROOT_OF_UNITY,
    newPoly: (n) => new Uint16Array(n),
    brvBits: 7,
    isKyber: true,
});
/** Internal params of ML-KEM versions */
// prettier-ignore
const PARAMS = {
    768: { N, Q, K: 3, ETA1: 2, ETA2: 2, du: 10, dv: 4, RBGstrength: 192 }};
// FIPS-203: compress/decompress
const compress = (d) => {
    // Special case, no need to compress, pass as is, but strip high bytes on compression
    if (d >= 12)
        return { encode: (i) => i, decode: (i) => i };
    // NOTE: we don't use float arithmetic (forbidden by FIPS-203 and high chance of bugs).
    // Comments map to python implementation in RFC (draft-cfrg-schwabe-kyber)
    // const round = (i: number) => Math.floor(i + 0.5) | 0;
    const a = 2 ** (d - 1);
    return {
        // const compress = (i: number) => round((2 ** d / Q) * i) % 2 ** d;
        encode: (i) => ((i << d) + Q / 2) / Q,
        // const decompress = (i: number) => round((Q / 2 ** d) * i);
        decode: (i) => (i * Q + a) >>> d,
    };
};
// NOTE: we merge encoding and compress because it is faster, also both require same d param
// Converts between bytes and d-bits compressed representation. Kinda like convertRadix2 from @scure/base
// decode(encode(t)) == t, but there is loss of information on encode(decode(t))
const polyCoder = (d) => bitsCoder(d, compress(d));
function polyAdd(a, b) {
    for (let i = 0; i < N; i++)
        a[i] = mod(a[i] + b[i]); // a += b
}
function polySub(a, b) {
    for (let i = 0; i < N; i++)
        a[i] = mod(a[i] - b[i]); // a -= b
}
// FIPS-203: Computes the product of two degree-one polynomials with respect to a quadratic modulus
function BaseCaseMultiply(a0, a1, b0, b1, zeta) {
    const c0 = mod(a1 * b1 * zeta + a0 * b0);
    const c1 = mod(a0 * b1 + a1 * b0);
    return { c0, c1 };
}
// FIPS-203: Computes the product (in the ring Tq) of two NTT representations. NOTE: works inplace for f
// NOTE: since multiply defined only for NTT representation, we need to convert to NTT, multiply and convert back
function MultiplyNTTs(f, g) {
    for (let i = 0; i < N / 2; i++) {
        let z = nttZetas[64 + (i >> 1)];
        if (i & 1)
            z = -z;
        const { c0, c1 } = BaseCaseMultiply(f[2 * i + 0], f[2 * i + 1], g[2 * i + 0], g[2 * i + 1], z);
        f[2 * i + 0] = c0;
        f[2 * i + 1] = c1;
    }
    return f;
}
// Return poly in NTT representation
function SampleNTT(xof) {
    const r = new Uint16Array(N);
    for (let j = 0; j < N;) {
        const b = xof();
        if (b.length % 3)
            throw new Error('SampleNTT: unaligned block');
        for (let i = 0; j < N && i + 3 <= b.length; i += 3) {
            const d1 = ((b[i + 0] >> 0) | (b[i + 1] << 8)) & 0xfff;
            const d2 = ((b[i + 1] >> 4) | (b[i + 2] << 4)) & 0xfff;
            if (d1 < Q)
                r[j++] = d1;
            if (j < N && d2 < Q)
                r[j++] = d2;
        }
    }
    return r;
}
// Sampling from the centered binomial distribution
// Returns poly with small coefficients (noise/errors)
function sampleCBD(PRF, seed, nonce, eta) {
    const buf = PRF((eta * N) / 4, seed, nonce);
    const r = new Uint16Array(N);
    const b32 = u32$1(buf);
    let len = 0;
    for (let i = 0, p = 0, bb = 0, t0 = 0; i < b32.length; i++) {
        let b = b32[i];
        for (let j = 0; j < 32; j++) {
            bb += b & 1;
            b >>= 1;
            len += 1;
            if (len === eta) {
                t0 = bb;
                bb = 0;
            }
            else if (len === 2 * eta) {
                r[p++] = mod(t0 - bb);
                bb = 0;
                len = 0;
            }
        }
    }
    if (len)
        throw new Error(`sampleCBD: leftover bits: ${len}`);
    return r;
}
// K-PKE
// As per FIPS-203, it doesn't perform any input validation and can't be used in standalone fashion.
const genKPKE = (opts) => {
    const { K, PRF, XOF, HASH512, ETA1, ETA2, du, dv } = opts;
    const poly1 = polyCoder(1);
    const polyV = polyCoder(dv);
    const polyU = polyCoder(du);
    const publicCoder = splitCoder(vecCoder(polyCoder(12), K), 32);
    const secretCoder = vecCoder(polyCoder(12), K);
    const cipherCoder = splitCoder(vecCoder(polyU, K), polyV);
    const seedCoder = splitCoder(32, 32);
    return {
        secretCoder,
        secretKeyLen: secretCoder.bytesLen,
        publicKeyLen: publicCoder.bytesLen,
        cipherTextLen: cipherCoder.bytesLen,
        keygen: (seed) => {
            ensureBytes(seed, 32);
            const seedDst = new Uint8Array(33);
            seedDst.set(seed);
            seedDst[32] = K;
            const seedHash = HASH512(seedDst);
            const [rho, sigma] = seedCoder.decode(seedHash);
            const sHat = [];
            const tHat = [];
            for (let i = 0; i < K; i++)
                sHat.push(NTT.encode(sampleCBD(PRF, sigma, i, ETA1)));
            const x = XOF(rho);
            for (let i = 0; i < K; i++) {
                const e = NTT.encode(sampleCBD(PRF, sigma, K + i, ETA1));
                for (let j = 0; j < K; j++) {
                    const aji = SampleNTT(x.get(j, i)); // A[j][i], inplace
                    polyAdd(e, MultiplyNTTs(aji, sHat[j]));
                }
                tHat.push(e); // t ← A ◦ s + e
            }
            x.clean();
            const res = {
                publicKey: publicCoder.encode([tHat, rho]),
                secretKey: secretCoder.encode(sHat),
            };
            cleanBytes(rho, sigma, sHat, tHat, seedDst, seedHash);
            return res;
        },
        encrypt: (publicKey, msg, seed) => {
            const [tHat, rho] = publicCoder.decode(publicKey);
            const rHat = [];
            for (let i = 0; i < K; i++)
                rHat.push(NTT.encode(sampleCBD(PRF, seed, i, ETA1)));
            const x = XOF(rho);
            const tmp2 = new Uint16Array(N);
            const u = [];
            for (let i = 0; i < K; i++) {
                const e1 = sampleCBD(PRF, seed, K + i, ETA2);
                const tmp = new Uint16Array(N);
                for (let j = 0; j < K; j++) {
                    const aij = SampleNTT(x.get(i, j)); // A[i][j], inplace
                    polyAdd(tmp, MultiplyNTTs(aij, rHat[j])); // t += aij * rHat[j]
                }
                polyAdd(e1, NTT.decode(tmp)); // e1 += tmp
                u.push(e1);
                polyAdd(tmp2, MultiplyNTTs(tHat[i], rHat[i])); // t2 += tHat[i] * rHat[i]
                tmp.fill(0);
            }
            x.clean();
            const e2 = sampleCBD(PRF, seed, 2 * K, ETA2);
            polyAdd(e2, NTT.decode(tmp2)); // e2 += tmp2
            const v = poly1.decode(msg); // encode plaintext m into polynomial v
            polyAdd(v, e2); // v += e2
            cleanBytes(tHat, rHat, tmp2, e2);
            return cipherCoder.encode([u, v]);
        },
        decrypt: (cipherText, privateKey) => {
            const [u, v] = cipherCoder.decode(cipherText);
            const sk = secretCoder.decode(privateKey); // s  ← ByteDecode_12(dkPKE)
            const tmp = new Uint16Array(N);
            for (let i = 0; i < K; i++)
                polyAdd(tmp, MultiplyNTTs(sk[i], NTT.encode(u[i]))); // tmp += sk[i] * u[i]
            polySub(v, NTT.decode(tmp)); // v += tmp
            cleanBytes(tmp, sk, u);
            return poly1.encode(v);
        },
    };
};
function createKyber(opts) {
    const KPKE = genKPKE(opts);
    const { HASH256, HASH512, KDF } = opts;
    const { secretCoder: KPKESecretCoder, cipherTextLen } = KPKE;
    const publicKeyLen = KPKE.publicKeyLen; // 384*K+32
    const secretCoder = splitCoder(KPKE.secretKeyLen, KPKE.publicKeyLen, 32, 32);
    const secretKeyLen = secretCoder.bytesLen;
    const msgLen = 32;
    return {
        publicKeyLen,
        msgLen,
        keygen: (seed = randomBytes(64)) => {
            ensureBytes(seed, 64);
            const { publicKey, secretKey: sk } = KPKE.keygen(seed.subarray(0, 32));
            const publicKeyHash = HASH256(publicKey);
            // (dkPKE||ek||H(ek)||z)
            const secretKey = secretCoder.encode([sk, publicKey, publicKeyHash, seed.subarray(32)]);
            cleanBytes(sk, publicKeyHash);
            return { publicKey, secretKey };
        },
        encapsulate: (publicKey, msg = randomBytes(32)) => {
            ensureBytes(publicKey, publicKeyLen);
            ensureBytes(msg, msgLen);
            // FIPS-203 includes additional verification check for modulus
            const eke = publicKey.subarray(0, 384 * opts.K);
            const ek = KPKESecretCoder.encode(KPKESecretCoder.decode(eke.slice())); // Copy because of inplace encoding
            // (Modulus check.) Perform the computation ek ← ByteEncode12(ByteDecode12(eke)).
            // If ek = ̸ eke, the input is invalid. (See Section 4.2.1.)
            if (!equalBytes(ek, eke)) {
                cleanBytes(ek);
                throw new Error('ML-KEM.encapsulate: wrong publicKey modulus');
            }
            cleanBytes(ek);
            const kr = HASH512.create().update(msg).update(HASH256(publicKey)).digest(); // derive randomness
            const cipherText = KPKE.encrypt(publicKey, msg, kr.subarray(32, 64));
            kr.subarray(32).fill(0);
            return { cipherText, sharedSecret: kr.subarray(0, 32) };
        },
        decapsulate: (cipherText, secretKey) => {
            ensureBytes(secretKey, secretKeyLen); // 768*k + 96
            ensureBytes(cipherText, cipherTextLen); // 32(du*k + dv)
            const [sk, publicKey, publicKeyHash, z] = secretCoder.decode(secretKey);
            const msg = KPKE.decrypt(cipherText, sk);
            const kr = HASH512.create().update(msg).update(publicKeyHash).digest(); // derive randomness, Khat, rHat = G(mHat || h)
            const Khat = kr.subarray(0, 32);
            const cipherText2 = KPKE.encrypt(publicKey, msg, kr.subarray(32, 64)); // re-encrypt using the derived randomness
            const isValid = equalBytes(cipherText, cipherText2); // if ciphertexts do not match, “implicitly reject”
            const Kbar = KDF.create({ dkLen: 32 }).update(z).update(cipherText).digest();
            cleanBytes(msg, cipherText2, !isValid ? Khat : Kbar);
            return isValid ? Khat : Kbar;
        },
    };
}
function shakePRF(dkLen, key, nonce) {
    return shake256
        .create({ dkLen })
        .update(key)
        .update(new Uint8Array([nonce]))
        .digest();
}
const opts = {
    HASH256: sha3_256,
    HASH512: sha3_512,
    KDF: shake256,
    XOF: XOF128,
    PRF: shakePRF,
};
/** ML-KEM-768, for 192-bit security level. Not recommended after 2030, as per ASD. */
const ml_kem768 = /* @__PURE__ */ createKyber({
    ...opts,
    ...PARAMS[768],
});

const MLKem = {
    generateKeyPair,
    encapsulate,
    decapsulate
};
function generateKeyPair(seed) {
    if (seed == undefined) {
        seed = randomBytes(64);
    }
    const keys = ml_kem768.keygen(seed);
    return keys;
}
function encapsulate(publicKey) {
    return ml_kem768.encapsulate(publicKey);
}
function decapsulate(cipherText, privateKey) {
    return ml_kem768.decapsulate(cipherText, privateKey);
}

/**
 * HMAC: RFC2104 message authentication code.
 * @module
 */
class HMAC extends Hash {
    constructor(hash, _key) {
        super();
        this.finished = false;
        this.destroyed = false;
        ahash(hash);
        const key = toBytes$1(_key);
        this.iHash = hash.create();
        if (typeof this.iHash.update !== 'function')
            throw new Error('Expected instance of class which extends utils.Hash');
        this.blockLen = this.iHash.blockLen;
        this.outputLen = this.iHash.outputLen;
        const blockLen = this.blockLen;
        const pad = new Uint8Array(blockLen);
        // blockLen can be bigger than outputLen
        pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
        for (let i = 0; i < pad.length; i++)
            pad[i] ^= 0x36;
        this.iHash.update(pad);
        // By doing update (processing of first block) of outer hash here we can re-use it between multiple calls via clone
        this.oHash = hash.create();
        // Undo internal XOR && apply outer XOR
        for (let i = 0; i < pad.length; i++)
            pad[i] ^= 0x36 ^ 0x5c;
        this.oHash.update(pad);
        clean$1(pad);
    }
    update(buf) {
        aexists$1(this);
        this.iHash.update(buf);
        return this;
    }
    digestInto(out) {
        aexists$1(this);
        abytes$1(out, this.outputLen);
        this.finished = true;
        this.iHash.digestInto(out);
        this.oHash.update(out);
        this.oHash.digestInto(out);
        this.destroy();
    }
    digest() {
        const out = new Uint8Array(this.oHash.outputLen);
        this.digestInto(out);
        return out;
    }
    _cloneInto(to) {
        // Create new instance without calling constructor since key already in state and we don't know it.
        to || (to = Object.create(Object.getPrototypeOf(this), {}));
        const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
        to = to;
        to.finished = finished;
        to.destroyed = destroyed;
        to.blockLen = blockLen;
        to.outputLen = outputLen;
        to.oHash = oHash._cloneInto(to.oHash);
        to.iHash = iHash._cloneInto(to.iHash);
        return to;
    }
    clone() {
        return this._cloneInto();
    }
    destroy() {
        this.destroyed = true;
        this.oHash.destroy();
        this.iHash.destroy();
    }
}
/**
 * HMAC: RFC2104 message authentication code.
 * @param hash - function that would be used e.g. sha256
 * @param key - message key
 * @param message - message data
 * @example
 * import { hmac } from '@noble/hashes/hmac';
 * import { sha256 } from '@noble/hashes/sha2';
 * const mac1 = hmac(sha256, 'key', 'message');
 */
const hmac = (hash, key, message) => new HMAC(hash, key).update(message).digest();
hmac.create = (hash, key) => new HMAC(hash, key);

etc.hmacSha256Sync = (k, ...m) => hmac(sha256$1, k, etc.concatBytes(...m));
const Secp256k1 = {
    publicKeyFromPrivateKey,
    sign,
    verify
};
function publicKeyFromPrivateKey(privateKey) {
    return getPublicKey(privateKey);
}
function sign(privateKey, data) {
    let hash = sha256$1(data), signature = sign$2(hash, privateKey);
    return signature.toCompactRawBytes();
}
function verify(publicKey, data, signature) {
    let hash = sha256$1(data);
    return verify$2(signature, hash, publicKey);
}

const SIG_ALGORITHM_IDS = {
    SECP256K1: 0,
    ML_DSA: 1
};
const SIG_ALGORITHMS = [
    { name: "SECP256K1", signatureSectionSize: 65 },
    { name: "ML_DSA", signatureSectionSize: 3311 }
];
const KEM_ALGORITHM_IDS = {
    ML_KEM: 0
};
const KEM_ALGORITHMS = [
    { name: "ML-KEM" }
];
const Crypto = Object.assign(Object.assign(Object.assign(Object.assign({}, SIG_ALGORITHM_IDS), { SIG_ALGORITHMS }), KEM_ALGORITHM_IDS), { KEM_ALGORITHMS,
    Random,
    Hashes,
    Aes,
    MLDsa,
    MLKem,
    Secp256k1 });

var crypto = /*#__PURE__*/Object.freeze({
    __proto__: null,
    Crypto: Crypto
});

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise, SuppressedError, Symbol, Iterator */


function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

function __values(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
}

function __asyncValues(o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
}

typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

const NUM_SMALL = 0x80;
const NUM_TYPE = 0x60;
const NUM_FLOAT32 = 0x20;
const NUM_FLOAT64 = 0x40;
const NUM_SIZE = 0x07;
const NUM_SIGN = 0x08;
class WriteStream {
    constructor() {
        this.clear();
    }
    clear() {
        this.byteStream = [];
    }
    getByteStream() {
        return new Uint8Array(this.byteStream);
    }
    writeJsonValue(type, value) {
        switch (type) {
            case TYPE_STRING: {
                this.writeString(value);
                break;
            }
            case TYPE_NUMBER: {
                this.writeNumber(value);
                break;
            }
            case TYPE_BOOLEAN: {
                this.writeBoolean(value);
                break;
            }
            case TYPE_NULL: {
                break;
            }
            default: {
                throw `Type ${type} is not a JSON type`;
            }
        }
    }
    writeSchemaValue(type, value, size) {
        switch (type) {
            case TYPE_STRING: {
                this.writeString(value, size);
                break;
            }
            case TYPE_NUMBER: {
                this.writeNumber(value);
                break;
            }
            case TYPE_BOOLEAN: {
                this.writeBoolean(value);
                break;
            }
            case TYPE_NULL: {
                break;
            }
            case TYPE_UINT8: {
                this.writeUint8(value);
                break;
            }
            case TYPE_UINT16: {
                this.writeUint16(value);
                break;
            }
            case TYPE_UINT24: {
                this.writeUint24(value);
                break;
            }
            case TYPE_UINT32: {
                this.writeUint32(value);
                break;
            }
            case TYPE_UINT48: {
                this.writeUint48(value);
                break;
            }
            case TYPE_BINARY: {
                this.writeBinary(value, size);
                break;
            }
            case TYPE_BIN256: {
                this.writeByteArray(value);
                break;
            }
            case TYPE_HASH_STR: {
                this.writeHashString();
                break;
            }
            default: {
                throw `Unexpected type ${type}`;
            }
        }
    }
    writeByte(n) {
        this.byteStream.push(n & 0xFF);
    }
    writeUnsigned(n, nByte) {
        while (nByte--) {
            this.writeByte(n / Math.pow(2, (nByte * 8)));
        }
    }
    writeUint8(n) {
        this.writeUnsigned(n, 1);
    }
    writeUint16(n) {
        this.writeUnsigned(n, 2);
    }
    writeUint24(n) {
        this.writeUnsigned(n, 3);
    }
    writeUint32(n) {
        this.writeUnsigned(n, 4);
    }
    writeUint48(n) {
        this.writeUnsigned(n, 6);
    }
    writeBinary(arr, size) {
        if (size === undefined) {
            this.writeVarUint(arr.length);
        }
        this.writeByteArray(arr);
    }
    writeHashString(str) {
        this.writeByteArray(Utils.binaryFromHexa(str));
    }
    writeByteArray(arr) {
        for (const n of arr) {
            this.writeByte(n);
        }
    }
    writeString(str, size) {
        const bin = Utf8Encoder.encode(str);
        if (size === undefined) {
            this.writeVarUint(bin.length);
        }
        this.writeByteArray(bin);
    }
    writeVarUint(n) {
        if (n == 0) {
            this.writeByte(0);
        }
        else {
            if (n < 0 || n % 1 || n > Number.MAX_SAFE_INTEGER) {
                throw `Invalid varUint ${n}`;
            }
            while (n) {
                this.writeByte(n % 0x80 | (n > 0x7F) << 7);
                n = Math.floor(n / 0x80);
            }
        }
    }
    writeBoolean(n) {
        this.writeByte(n ? 0xFF : 0x00);
    }
    writeNumber(n) {
        const isInteger = !(n % 1);
        // if this is a small integer in [-64, 63], encode as a single byte
        if (isInteger && n >= -64 && n < 0x40) {
            this.writeByte(NUM_SMALL | n & 0x7F);
            return;
        }
        // attempt to encode as 1 prefix byte + 1 to 6 data bytes
        for (let size = 1, max = 0x100; size <= 6; size++, max *= 0x100) {
            // attempt to encode as a signed integer in big-endian format
            if (isInteger && n >= -max && n < max) {
                const sign = n < 0;
                this.writeByte(sign << 3 | size);
                this.writeUnsigned(sign ? -n - 1 : n, size);
                return;
            }
            // for size 4, test whether this number can be safely encoded as a Float32
            if (size == 4) {
                const f32 = new Float32Array([n]);
                const v32 = +f32[0].toPrecision(7);
                if (v32 === n) {
                    this.writeByte(NUM_FLOAT32);
                    this.writeByteArray(new Uint8Array(f32.buffer));
                    return;
                }
            }
        }
        // fallback for everything else: encode as Float64 (1 prefix byte + 8 bytes)
        this.writeByte(NUM_FLOAT64);
        this.writeByteArray(new Uint8Array(new Float64Array([n]).buffer));
    }
}
class ReadStream {
    constructor(stream) {
        this.byteStream = stream;
        this.pointer = 0;
    }
    readJsonValue(type) {
        this.lastPointer = this.pointer;
        switch (type) {
            case TYPE_STRING: {
                return this.readString();
            }
            case TYPE_NUMBER: {
                return this.readNumber();
            }
            case TYPE_BOOLEAN: {
                return this.readBoolean();
            }
            case TYPE_NULL: {
                return null;
            }
            default: {
                throw `Type ${type} is not a JSON type`;
            }
        }
    }
    readSchemaValue(type, size) {
        this.lastPointer = this.pointer;
        switch (type) {
            case TYPE_STRING: {
                return this.readString(size);
            }
            case TYPE_NUMBER: {
                return this.readNumber();
            }
            case TYPE_BOOLEAN: {
                return this.readBoolean();
            }
            case TYPE_NULL: {
                return null;
            }
            case TYPE_UINT8: {
                return this.readUint8();
            }
            case TYPE_UINT16: {
                return this.readUint16();
            }
            case TYPE_UINT24: {
                return this.readUint24();
            }
            case TYPE_UINT32: {
                return this.readUint32();
            }
            case TYPE_UINT48: {
                return this.readUint48();
            }
            case TYPE_BINARY: {
                return this.readBinary(size);
            }
            case TYPE_BIN256: {
                return this.readByteArray(32);
            }
            case TYPE_HASH_STR: {
                return this.readHashString();
            }
        }
    }
    getPointer() {
        return this.pointer;
    }
    extractFrom(ptr) {
        return this.byteStream.slice(ptr, this.pointer);
    }
    getLastField() {
        return this.byteStream.slice(this.lastPointer, this.pointer);
    }
    readByte() {
        return this.byteStream[this.pointer++];
    }
    readUnsigned(nByte) {
        let n = 0;
        while (nByte--) {
            n = n * 0x100 + this.readByte();
        }
        return n;
    }
    readUint8() {
        return this.readUnsigned(1);
    }
    readUint16() {
        return this.readUnsigned(2);
    }
    readUint24() {
        return this.readUnsigned(3);
    }
    readUint32() {
        return this.readUnsigned(4);
    }
    readUint48() {
        return this.readUnsigned(6);
    }
    readBinary(size) {
        if (size === undefined) {
            size = this.readVarUint();
        }
        return this.readByteArray(size);
    }
    readHashString() {
        return Utils.binaryToHexa(this.readByteArray(32));
    }
    readByteArray(size) {
        return this.byteStream.slice(this.pointer, this.pointer += size);
    }
    readString(size) {
        if (size === undefined) {
            size = this.readVarUint();
        }
        const array = this.readByteArray(size);
        return Utf8Encoder.decode(array);
    }
    readVarUint() {
        const parts = [];
        let b;
        do {
            b = this.readByte();
            parts.push(b & 0x7F);
        } while (b & 0x80);
        return parts.reduceRight((value, b) => value * 0x80 + b, 0);
    }
    readBoolean() {
        return !!this.readByte();
    }
    readNumber() {
        const leadingByte = this.readByte();
        if (leadingByte & NUM_SMALL) {
            return ((leadingByte & 0x7F) ^ 0x40) - 0x40;
        }
        switch (leadingByte & NUM_TYPE) {
            case NUM_FLOAT32: {
                return +new Float32Array(this.readByteArray(4).buffer)[0].toPrecision(7);
            }
            case NUM_FLOAT64: {
                return new Float64Array(this.readByteArray(8).buffer)[0];
            }
            default: {
                const n = this.readUnsigned(leadingByte & NUM_SIZE);
                return leadingByte & NUM_SIGN ? -n - 1 : n;
            }
        }
    }
}

class SchemaSerializer {
    /**
      Constructor
      @param {Array} schema - Top-level schema
    */
    constructor(schema) {
        this.schema = schema;
    }
    /**
      Serializes the given object.
      @param {object} object - The object to be serialized.
    */
    serialize(object) {
        this.stream = new WriteStream;
        this.serializeObject(this.schema, object);
        return this.stream.getByteStream();
    }
    /**
      Serializes any sub-object of the full structure.
      @param {Array} schema - The (sub)schema of the object.
      @param {object} object - The object to be serialized.
    */
    serializeObject(schema, object, path = "") {
        for (const definition of schema) {
            const fieldPath = path + (path && ".") + definition.name, value = object[definition.name];
            if (value === undefined) {
                throw `field '${fieldPath}' is missing`;
            }
            if (definition.type & TYPE_ARRAY_OF) {
                if (TypeManager.getType(value) != TYPE_ARRAY) {
                    throw `'${fieldPath}' is not an array`;
                }
                if (definition.size !== undefined) {
                    if (value.length != definition.size) {
                        throw `invalid size for '${fieldPath}' (expecting ${definition.size} entries, got ${value.length})`;
                    }
                }
                else {
                    this.stream.writeVarUint(value.length);
                }
                for (const index in value) {
                    this.serializeItem(definition, value[index], fieldPath + `[${index}]`);
                }
            }
            else {
                this.serializeItem(definition, value, fieldPath);
            }
        }
    }
    /**
      Serializes an item.
      @param {object} definition - The definition of the item.
      @param {} value - The value of the item.
    */
    serializeItem(definition, value, fieldPath) {
        const mainType = definition.type & TYPE_MAIN;
        if (mainType == TYPE_OBJECT) {
            if (TypeManager.getType(value) != TYPE_OBJECT) {
                throw `'${fieldPath}' is not an object`;
            }
            this.serializeObject(definition.schema, value, fieldPath);
        }
        else {
            const typeChecker = new TypeChecker(definition, value);
            try {
                typeChecker.check();
            }
            catch (error) {
                throw `Error on field '${fieldPath}': ${error}`;
            }
            this.stream.writeSchemaValue(mainType, value, definition.size);
        }
    }
}
class SchemaUnserializer {
    /**
      Constructor
      @param {Array} schema - Top-level schema
    */
    constructor(schema) {
        this.schema = schema;
    }
    /**
      Unserializes the given byte stream.
      @param {Uint8Array} stream - The serialized byte stream
    */
    unserialize(stream) {
        this.stream = new ReadStream(stream);
        const object = this.unserializeObject(this.schema), pointer = this.stream.getPointer(), size = stream.length;
        if (pointer != size) {
            throw `Invalid stream length (decoded ${pointer} bytes, actual length is ${size} bytes)`;
        }
        return object;
    }
    /**
      Unserializes any sub-object of the full structure.
      @param {Array} schema - The (sub)schema of the object.
    */
    unserializeObject(schema) {
        const object = {};
        for (const definition of schema) {
            let item;
            if (definition.type & TYPE_ARRAY_OF) {
                let size = definition.size !== undefined ? definition.size : this.stream.readVarUint();
                item = [];
                while (size--) {
                    item.push(this.unserializeItem(definition));
                }
            }
            else {
                item = this.unserializeItem(definition);
            }
            object[definition.name] = item;
        }
        return object;
    }
    /**
      Unserializes an item.
      @param {object} definition - The definition of the item.
    */
    unserializeItem(definition) {
        const mainType = definition.type & TYPE_MAIN;
        return (mainType == TYPE_OBJECT ?
            this.unserializeObject(definition.schema)
            :
                this.stream.readSchemaValue(mainType, definition.size));
    }
}

var schemaSerializer$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    SchemaSerializer: SchemaSerializer,
    SchemaUnserializer: SchemaUnserializer
});

const BlockchainUtils = {
    checkHeaderList,
    previousHashFromHeader,
    decodeMicroblockHeader,
    encodeMicroblockInformation,
    decodeMicroblockInformation,
    encodeVirtualBlockchainState,
    decodeVirtualBlockchainState
};
/**
  Takes a list of consecutive microblock headers in binary format and in anti-chronological order.
  Returns an object with a flag telling if the hash chain is valid and the list of microblock hashes (also in anti-chronological order).
*/
function checkHeaderList(headers) {
    const hashes = [];
    let expectedHash = null;
    for (const header of headers) {
        const hash = Crypto.Hashes.sha256AsBinary(header);
        if (expectedHash && !Utils.binaryIsEqual(hash, expectedHash)) {
            return {
                valid: false,
                hashes: []
            };
        }
        hashes.push(hash);
        expectedHash = previousHashFromHeader(header);
    }
    return {
        valid: true,
        hashes: hashes
    };
}
/**
  Extracts the 'previousHash' field from a microblock header in binary format.
*/
function previousHashFromHeader(header) {
    return header.slice(MICROBLOCK_HEADER_PREVIOUS_HASH_OFFSET, MICROBLOCK_HEADER_PREVIOUS_HASH_OFFSET + 32);
}
function decodeMicroblockHeader(data) {
    const unserializer = new SchemaUnserializer(MICROBLOCK_HEADER), object = unserializer.unserialize(data);
    return object;
}
function encodeMicroblockInformation(virtualBlockchainType, virtualBlockchainId, header) {
    const serializer = new SchemaSerializer(MICROBLOCK_INFORMATION), data = serializer.serialize({ virtualBlockchainType, virtualBlockchainId, header });
    return data;
}
function decodeMicroblockInformation(data) {
    const unserializer = new SchemaUnserializer(MICROBLOCK_INFORMATION), object = unserializer.unserialize(data);
    return object;
}
function encodeVirtualBlockchainState(type, height, lastMicroblockHash, customStateObject) {
    const customStateSerializer = new SchemaSerializer(STATES[type]), customState = customStateSerializer.serialize(customStateObject);
    const stateObject = {
        type,
        height,
        lastMicroblockHash,
        customState
    };
    const stateSerializer = new SchemaSerializer(VIRTUAL_BLOCKCHAIN_STATE), data = stateSerializer.serialize(stateObject);
    return data;
}
function decodeVirtualBlockchainState(data) {
    const stateUnserializer = new SchemaUnserializer(VIRTUAL_BLOCKCHAIN_STATE), stateObject = stateUnserializer.unserialize(data);
    const customStateUnserializer = new SchemaUnserializer(STATES[stateObject.type]), customStateObject = customStateUnserializer.unserialize(stateObject.customState);
    stateObject.customState = customStateObject;
    return stateObject;
}

class Provider {
    constructor(internalProvider, externalProvider) {
        this.internalProvider = internalProvider;
        this.externalProvider = externalProvider;
    }
    sendMicroblock(headerData, bodyData) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.externalProvider.sendMicroblock(headerData, bodyData);
        });
    }
    isKeyed() { return false; }
    storeMicroblock(hash, virtualBlockchainId, virtualBlockchainType, height, headerData, bodyData) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.internalProvider.setMicroblockInformation(hash, BlockchainUtils.encodeMicroblockInformation(virtualBlockchainType, virtualBlockchainId, headerData));
            yield this.internalProvider.setMicroblockBody(hash, bodyData);
        });
    }
    updateVirtualBlockchainState(virtualBlockchainId, type, height, lastMicroblockHash, customStateObject) {
        return __awaiter(this, void 0, void 0, function* () {
            const stateData = BlockchainUtils.encodeVirtualBlockchainState(type, height, lastMicroblockHash, customStateObject);
            yield this.internalProvider.setVirtualBlockchainState(virtualBlockchainId, stateData);
        });
    }
    getMicroblockInformation(hash) {
        return __awaiter(this, void 0, void 0, function* () {
            // FIXME: we should avoid the encoding/decoding passes when getting data from the external provider
            let data = yield this.internalProvider.getMicroblockInformation(hash);
            if (!data) {
                const info = yield this.externalProvider.getMicroblockInformation(hash);
                if (info) {
                    data = BlockchainUtils.encodeMicroblockInformation(info.virtualBlockchainType, info.virtualBlockchainId, info.header);
                    yield this.internalProvider.setMicroblockInformation(hash, data);
                }
            }
            return data && BlockchainUtils.decodeMicroblockInformation(data);
        });
    }
    getMicroblockBodys(hashes) {
        return __awaiter(this, void 0, void 0, function* () {
            // get as much data as possible from the internal provider
            const res = [];
            const missingHashes = [];
            for (const hash of hashes) {
                const body = yield this.internalProvider.getMicroblockBody(hash);
                if (body) {
                    res.push({ hash, body });
                }
                else {
                    missingHashes.push(hash);
                }
            }
            // if necessary, request missing data from the external provider
            if (missingHashes.length) {
                const externalData = yield this.externalProvider.getMicroblockBodys(missingHashes);
                // save missing data in the internal provider and update res[]
                for (const { hash, body } of externalData.list) {
                    yield this.internalProvider.setMicroblockBody(hash, body);
                    res.push({ hash, body });
                }
                // for convenience, we sort the list according to the original query order
                res.sort((a, b) => hashes.indexOf(a.hash) - hashes.indexOf(b.hash));
            }
            return res;
        });
    }
    getVirtualBlockchainInformation(virtualBlockchainId) {
        return __awaiter(this, void 0, void 0, function* () {
        });
    }
    getVirtualBlockchainStateInternal(virtualBlockchainId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.internalProvider.getVirtualBlockchainState(virtualBlockchainId);
        });
    }
    getVirtualBlockchainHeaders(virtualBlockchainId, knownHeight) {
        return __awaiter(this, void 0, void 0, function* () {
            const stateData = yield this.internalProvider.getVirtualBlockchainState(virtualBlockchainId);
            const state = BlockchainUtils.decodeVirtualBlockchainState(stateData);
            let height = state.height;
            let microblockHash = state.lastMicroblockHash;
            const headers = [];
            while (height > knownHeight) {
                const infoData = yield this.internalProvider.getMicroblockInformation(microblockHash);
                const info = BlockchainUtils.decodeMicroblockInformation(infoData);
                headers.push(info.header);
                microblockHash = BlockchainUtils.previousHashFromHeader(info.header);
                height--;
            }
            return headers;
        });
    }
    getVirtualBlockchainContent(virtualBlockchainId) {
        return __awaiter(this, void 0, void 0, function* () {
            let microblockHashes = [];
            let state;
            // get the state of this VB from our internal provider
            const stateData = yield this.internalProvider.getVirtualBlockchainState(virtualBlockchainId);
            // if found, make sure that we still have all the microblock headers up to the height associated to this state
            // and that they are consistent
            if (stateData) {
                state = BlockchainUtils.decodeVirtualBlockchainState(stateData);
                let height = state.height;
                let microblockHash = state.lastMicroblockHash;
                const headers = [];
                while (height) {
                    const infoData = yield this.internalProvider.getMicroblockInformation(microblockHash);
                    if (!infoData) {
                        break;
                    }
                    const info = BlockchainUtils.decodeMicroblockInformation(infoData);
                    headers.push(info.header);
                    microblockHash = BlockchainUtils.previousHashFromHeader(info.header);
                    height--;
                }
                if (height == 0) {
                    const check = BlockchainUtils.checkHeaderList(headers);
                    if (check.valid) {
                        check.hashes.reverse();
                        if (Utils.binaryIsEqual(check.hashes[0], virtualBlockchainId)) {
                            microblockHashes = check.hashes;
                        }
                        else {
                            console.error("WARNING - genesis microblock hash from internal storage does not match VB identifier");
                        }
                    }
                    else {
                        console.error("WARNING - inconsistent hash chain in internal storage");
                    }
                }
            }
            // query our external provider for state update and new headers, starting at the known height
            const knownHeight = microblockHashes.length;
            const vbUpdate = yield this.externalProvider.getVirtualBlockchainUpdate(virtualBlockchainId, knownHeight);
            if (!vbUpdate.exists) {
                return null;
            }
            if (vbUpdate.changed) {
                // check the consistency of the new headers
                const check = BlockchainUtils.checkHeaderList(vbUpdate.headers);
                if (!check.valid) {
                    throw `received headers are inconsistent`;
                }
                // make sure that the 'previous hash' field of the first new microblock matches the last known hash
                if (knownHeight) {
                    const firstNewHeader = vbUpdate.headers[vbUpdate.headers.length - 1];
                    const linkedHash = BlockchainUtils.previousHashFromHeader(firstNewHeader);
                    if (!Utils.binaryIsEqual(linkedHash, microblockHashes[knownHeight - 1])) {
                        throw `received headers do not link properly to the last known header`;
                    }
                }
                // update the VB state in our internal provider
                yield this.internalProvider.setVirtualBlockchainState(virtualBlockchainId, vbUpdate.stateData);
                state = BlockchainUtils.decodeVirtualBlockchainState(vbUpdate.stateData);
                // update the microblock information in our internal provider
                for (let n = 0; n < vbUpdate.headers.length; n++) {
                    yield this.internalProvider.setMicroblockInformation(check.hashes[n], BlockchainUtils.encodeMicroblockInformation(state.type, virtualBlockchainId, vbUpdate.headers[n]));
                }
                // add the new hashes to the hash list
                microblockHashes = [...microblockHashes, ...check.hashes.reverse()];
            }
            return { state, microblockHashes };
        });
    }
}

var provider = /*#__PURE__*/Object.freeze({
    __proto__: null,
    Provider: Provider
});

class Explorer {
    constructor({ provider }) {
        this.provider = provider;
    }
}

class Microblock {
    constructor(type) {
        this.type = type;
        this.sections = [];
        this.gasPrice = 0;
    }
    /**
      Creates a microblock at a given height.
      If the height is greater than 1, a 'previousHash' is expected.
    */
    create(height, previousHash) {
        if (height == 1) {
            const genesisSeed = Crypto.Random.getBytes(24);
            previousHash = Utils.getNullHash();
            previousHash[0] = this.type;
            previousHash.set(genesisSeed, 8);
        }
        else if (previousHash === undefined) {
            throw `previous hash not provided`;
        }
        this.header = {
            magicString: MAGIC_STRING,
            protocolVersion: PROTOCOL_VERSION,
            height: height,
            previousHash: previousHash,
            timestamp: Utils.getTimestampInSeconds(),
            gas: 0,
            gasPrice: 0,
            bodyHash: Utils.getNullHash()
        };
    }
    /**
      Updates the timestamp.
    */
    updateTimestamp() {
        this.header.timestamp = Utils.getTimestampInSeconds();
    }
    /**
      Loads a microblock from its header data and body data.
    */
    load(headerData, bodyData) {
        const headerUnserializer = new SchemaUnserializer(MICROBLOCK_HEADER);
        this.header = headerUnserializer.unserialize(headerData);
        const bodyHash = Crypto.Hashes.sha256AsBinary(bodyData);
        if (!Utils.binaryIsEqual(this.header.bodyHash, bodyHash)) {
            throw `inconsistent body hash`;
        }
        this.hash = Crypto.Hashes.sha256AsBinary(headerData);
        const bodyUnserializer = new SchemaUnserializer(MICROBLOCK_BODY), body = bodyUnserializer.unserialize(bodyData).body;
        for (const { type, data } of body) {
            const sectionDef = DEF[this.type][type];
            const unserializer = new SchemaUnserializer(sectionDef.schema);
            const object = unserializer.unserialize(data);
            this.storeSection(type, object, data);
        }
    }
    /**
      Adds a section of a given type and defined by a given object.
    */
    addSection(type, object) {
        const sectionDef = DEF[this.type][type];
        const serializer = new SchemaSerializer(sectionDef.schema);
        const data = serializer.serialize(object);
        return this.storeSection(type, object, data);
    }
    /**
      Stores a section, including its serialized data, hash and index.
    */
    storeSection(type, object, data) {
        const hash = Crypto.Hashes.sha256AsBinary(data);
        const index = this.sections.length;
        const section = { type, object, data, hash, index };
        this.sections.push(section);
        return section;
    }
    /**
      Returns the first section for which the given callback function returns true.
    */
    getSection(callback) {
        return this.sections.find((section) => callback(section));
    }
    /**
     *
     * @param {PrivateSignatureKey} privateKey
     * @param {boolean} includeGas
     * @returns {*}
     */
    createSignature(privateKey, includeGas) {
        const signatureSize = privateKey.getSignatureSize();
        const signedData = this.getSignedData(includeGas, this.sections.length, signatureSize);
        const signature = privateKey.sign(signedData);
        /*
        switch(algorithmId) {
          case Crypto.SECP256K1: {
            signature = Crypto.Secp256k1.sign(privateKey, signedData);
            break;
          }
          case Crypto.ML_DSA: {
            signature = Crypto.MLDsa.sign(privateKey, signedData);
            break;
          }
        }

         */
        return signature;
    }
    /**
     * Verifies the provided cryptographic signature using the specified algorithm.
     *
     *
     *
     * @param {PublicSignatureKey} publicKey - The public key used to verify the signature.
     * @param {string} signature - The signature to be verified.
     * @param {boolean} includeGas - Indicates whether to include gas-related data in the signed payload.
     * @param {number} sectionCount - The number of sections to include in the signed data.
     * @return {boolean} Returns true if the signature is successfully verified; otherwise, returns false.
     */
    verifySignature(publicKey, signature, includeGas, sectionCount) {
        const signedData = this.getSignedData(includeGas, sectionCount, 0);
        return publicKey.verify(signedData, signature);
        /*
        switch(algorithmId) {
          case Crypto.SECP256K1: {
            return Crypto.Secp256k1.verify(publicKey, signedData, signature);
          }
          case Crypto.ML_DSA: {
            return Crypto.MLDsa.verify(publicKey, signedData, signature);
          }
        }

         */
    }
    /**
      Generates the data to be signed:
        - the header with or without the gas data, and without the body hash
        - the list of section hashes
    */
    getSignedData(includeGas, sectionCount, extraBytes) {
        this.setGasData(includeGas, extraBytes);
        const serializer = new SchemaSerializer(MICROBLOCK_HEADER), headerData = serializer.serialize(this.header);
        const sections = this.sections.slice(0, sectionCount);
        return Utils.binaryFrom(headerData.slice(0, MICROBLOCK_HEADER_BODY_HASH_OFFSET), ...sections.map((section) => section.hash));
    }
    /**
      Sets the gas data to either 0 or to their actual values.
    */
    setGasData(includeGas, extraBytes = 0) {
        if (includeGas) {
            this.header.gas = this.computeGas(extraBytes);
            this.header.gasPrice = this.gasPrice;
        }
        else {
            this.header.gas = 0;
            this.header.gasPrice = 0;
        }
    }
    /**
      Serializes the microblock and returns an object with the microblock hash, the header data,
      the body hash and the body data.
    */
    serialize() {
        const body = {
            body: this.sections.map(({ type, data }) => ({ type, data }))
        };
        this.setGasData(true);
        const bodySerializer = new SchemaSerializer(MICROBLOCK_BODY), bodyData = bodySerializer.serialize(body), bodyHash = Crypto.Hashes.sha256AsBinary(bodyData);
        this.header.bodyHash = bodyHash;
        const headerSerializer = new SchemaSerializer(MICROBLOCK_HEADER), headerData = headerSerializer.serialize(this.header), microblockHash = Crypto.Hashes.sha256AsBinary(headerData);
        this.hash = microblockHash;
        return { microblockHash, headerData, bodyHash, bodyData };
    }
    computeGas(extraBytes = 0) {
        const totalSize = this.sections.reduce((total, { data }) => total + data.length, extraBytes);
        return FIXED_GAS_FEE + GAS_PER_BYTE * totalSize;
    }
}

class VirtualBlockchain {
    constructor({ provider, type }) {
        if (!VB_NAME[type]) {
            throw `Invalid virtual blockchain type '${type}'`;
        }
        this.provider = provider;
        this.sectionCallbacks = new Map;
        this.microblockHashes = [];
        this.currentMicroblock = null;
        this.state = {};
        this.type = type;
        this.height = 0;
    }
    /**
      Registers a callback for a given section type.
    */
    registerSectionCallback(sectionType, callback) {
        this.sectionCallbacks.set(sectionType, callback.bind(this));
    }
    /**
      Loads a VB from its identifier.
    */
    load(identifier) {
        return __awaiter(this, void 0, void 0, function* () {
            const content = yield this.provider.getVirtualBlockchainContent(identifier);
            if (!content) {
                throw `virtual blockchain not found`;
            }
            if (this.type != content.state.type) {
                throw `inconsistent virtual blockchain type`;
            }
            this.identifier = identifier;
            this.height = content.state.height;
            this.state = content.state.customState;
            this.microblockHashes = content.microblockHashes;
        });
    }
    /**
      Imports a microblock defined by its header data and body data.
    */
    importMicroblock(headerData, bodyData) {
        return __awaiter(this, void 0, void 0, function* () {
            this.currentMicroblock = new Microblock(this.type);
            this.currentMicroblock.load(headerData, bodyData);
            this.checkStructure(this.currentMicroblock);
            for (const section of this.currentMicroblock.sections) {
                yield this.processSectionCallback(this.currentMicroblock, section);
            }
            this.height++;
            if (this.currentMicroblock.header.height == 1) {
                this.identifier = this.currentMicroblock.hash;
            }
            return this.currentMicroblock.hash;
        });
    }
    /**
      Returns the microblock at the given height.
    */
    getMicroblock(height) {
        return __awaiter(this, void 0, void 0, function* () {
            if (height == this.microblockHashes.length + 1 && this.currentMicroblock) {
                return this.currentMicroblock;
            }
            const hash = this.microblockHashes[height - 1];
            if (!hash) {
                throw `cannot retrieve microblock at height ${height}`;
            }
            const info = yield this.provider.getMicroblockInformation(hash);
            const bodyList = yield this.provider.getMicroblockBodys([hash]);
            const microblock = new Microblock(this.type);
            microblock.load(info.header, bodyList[0].body);
            return microblock;
        });
    }
    /**
      Adds a section to the current microblock.
    */
    addSection(type, object) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.currentMicroblock) {
                this.currentMicroblock = new Microblock(this.type);
                const previousHash = this.height ? this.microblockHashes[this.height - 1] : null;
                this.height++;
                this.currentMicroblock.create(this.height, previousHash);
            }
            const section = this.currentMicroblock.addSection(type, object);
            yield this.processSectionCallback(this.currentMicroblock, section);
        });
    }
    /**
      Processes a section callback (if defined).
    */
    processSectionCallback(microblock, section) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.sectionCallbacks.has(section.type)) {
                const callback = this.sectionCallbacks.get(section.type);
                yield callback(microblock, section);
            }
        });
    }
    /**
     * Creates a signature for the current microblock.
     *
     * @param {PrivateSignatureKey} privateKey
     * @param {boolean} withGas
     * @returns {{signature: (*|{signature})}}
     */
    createSignature(privateKey, withGas = true) {
        const signature = this.currentMicroblock.createSignature(privateKey, withGas);
        return { signature };
    }
    /**
      Publishes the current microblock.
    */
    publish() {
        return __awaiter(this, void 0, void 0, function* () {
            //  console.log("publishing");
            //  console.log(this.currentMicroblock.header);
            //  console.log(this.currentMicroblock.sections);
            this.checkStructure(this.currentMicroblock);
            const { microblockHash, headerData, bodyHash, bodyData } = this.currentMicroblock.serialize();
            this.microblockHashes[this.height - 1] = microblockHash;
            if (this.height == 1) {
                this.identifier = microblockHash;
            }
            yield this.provider.sendMicroblock(headerData, bodyData);
            //  await this.provider.setMicroblockInformation(microblockHash, this.type, this.identifier, this.currentMicroblock.header.previousHash);
            //  await this.provider.setMicroblockHeader(microblockHash, headerData);
            //  await this.provider.setMicroblockBody(bodyHash, bodyData);
            //  await this.provider.setVirtualBlockchainState(this.identifier, this.type, this.height, microblockHash, this.state);
            return microblockHash;
        });
    }
}

class StructureChecker {
    constructor(microblock) {
        this.microblock = microblock;
        this.pointer = 0;
    }
    isFirstBlock() {
        return this.microblock.header.height == 1;
    }
    expects(constraint, type) {
        let count = 0;
        while (!this.endOfList() && this.currentSection().type == type) {
            count++;
            this.pointer++;
        }
        if (!this.checkConstraint(constraint, count)) {
            throw `expected ${CONSTRAINT_NAMES[constraint]} of type ${this.getTypeLabel(type)}, got ${count}`;
        }
    }
    group(groupConstraint, list) {
        const counts = new Map;
        let groupCount = 0;
        for (const [constraint, type] of list) {
            counts.set(type, 0);
        }
        while (!this.endOfList()) {
            const currentType = this.currentSection().type;
            if (!list.some(([count, type]) => type == currentType)) {
                break;
            }
            counts.set(currentType, counts.get(currentType) + 1);
            groupCount++;
            this.pointer++;
        }
        if (!this.checkConstraint(groupConstraint, groupCount)) {
            throw `expected ${CONSTRAINT_NAMES[groupConstraint]} in group, got ${groupCount}`;
        }
        for (const [constraint, type] of list) {
            const count = counts.get(type);
            if (!this.checkConstraint(constraint, count)) {
                throw `expected ${CONSTRAINT_NAMES[constraint]} of type ${this.getTypeLabel(type)}, got ${count}`;
            }
        }
    }
    endsHere() {
        if (!this.endOfList()) {
            throw `unexpected section ${this.getTypeLabel(this.currentSection())}`;
        }
    }
    currentSection() {
        return this.microblock.sections[this.pointer];
    }
    endOfList() {
        return !this.currentSection();
    }
    checkConstraint(constraint, count) {
        switch (constraint) {
            case ANY: {
                return true;
            }
            case ZERO: {
                return count == 0;
            }
            case ONE: {
                return count == 1;
            }
            case AT_LEAST_ONE: {
                return count >= 1;
            }
            case AT_MOST_ONE: {
                return count <= 1;
            }
        }
    }
    getTypeLabel(type) {
        const section = DEF[this.microblock.type][type];
        return section ? section.label : "unknown";
    }
}

class AccountVb extends VirtualBlockchain {
    constructor({ provider }) {
        super({ provider, type: VB_ACCOUNT });
        this.registerSectionCallback(ACCOUNT_SIG_ALGORITHM, this.signatureAlgorithmCallback);
        this.registerSectionCallback(ACCOUNT_PUBLIC_KEY, this.publicKeyCallback);
        this.registerSectionCallback(ACCOUNT_TOKEN_ISSUANCE, this.tokenIssuanceCallback);
        this.registerSectionCallback(ACCOUNT_CREATION, this.creationCallback);
        this.registerSectionCallback(ACCOUNT_TRANSFER, this.transferCallback);
        this.registerSectionCallback(ACCOUNT_SIGNATURE, this.signatureCallback);
    }
    /**
      Update methods
    */
    setSignatureAlgorithm(object) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.addSection(ACCOUNT_SIG_ALGORITHM, object);
        });
    }
    setPublicKey(object) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.addSection(ACCOUNT_PUBLIC_KEY, object);
        });
    }
    setTokenIssuance(object) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.addSection(ACCOUNT_TOKEN_ISSUANCE, object);
        });
    }
    setCreation(object) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.addSection(ACCOUNT_CREATION, object);
        });
    }
    setTransfer(object) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.addSection(ACCOUNT_TRANSFER, object);
        });
    }
    /**
     *
     * @param {PrivateSignatureKey} privateKey
     * @returns {Promise<void>}
     */
    setSignature(privateKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const object = this.createSignature(privateKey);
            yield this.addSection(ACCOUNT_SIGNATURE, object);
        });
    }
    /**
      Section callbacks
    */
    signatureAlgorithmCallback(microblock, section) {
        return __awaiter(this, void 0, void 0, function* () {
            this.state.signatureAlgorithmId = section.object.algorithmId;
        });
    }
    publicKeyCallback(microblock, section) {
        return __awaiter(this, void 0, void 0, function* () {
            this.state.publicKeyHeight = microblock.header.height;
        });
    }
    tokenIssuanceCallback(microblock, section) {
        return __awaiter(this, void 0, void 0, function* () {
            if (section.object.amount != INITIAL_OFFER) {
                throw `the amount of the initial token issuance is not the expected one`;
            }
        });
    }
    creationCallback(microblock, section) {
        return __awaiter(this, void 0, void 0, function* () {
        });
    }
    transferCallback(microblock, section) {
        return __awaiter(this, void 0, void 0, function* () {
            const payeeVb = new AccountVb({ provider: this.provider });
            yield payeeVb.load(section.object.account);
        });
    }
    signatureCallback(microblock, section) {
        return __awaiter(this, void 0, void 0, function* () {
        });
    }
    /**
      Structure check
    */
    checkStructure(microblock) {
        const checker = new StructureChecker(microblock);
        checker.expects(checker.isFirstBlock() ? ONE : ZERO, ACCOUNT_SIG_ALGORITHM);
        checker.expects(checker.isFirstBlock() ? ONE : AT_MOST_ONE, ACCOUNT_PUBLIC_KEY);
        if (checker.isFirstBlock()) {
            checker.group(ONE, [
                [AT_MOST_ONE, ACCOUNT_TOKEN_ISSUANCE],
                [AT_MOST_ONE, ACCOUNT_CREATION]
            ]);
        }
        else {
            checker.group(AT_LEAST_ONE, [
                [ANY, ACCOUNT_TRANSFER]
            ]);
        }
        checker.expects(ONE, ACCOUNT_SIGNATURE);
        checker.endsHere();
    }
}

class ValidatorNodeVb extends VirtualBlockchain {
    constructor({ provider }) {
        super({ provider, type: VB_VALIDATOR_NODE });
    }
    /**
      Update methods
    */
    /**
      Section callbacks
    */
    /**
      Structure check
    */
    checkStructure(microblock) {
    }
}

var SymmetricEncryptionAlgorithmId;
(function (SymmetricEncryptionAlgorithmId) {
    SymmetricEncryptionAlgorithmId[SymmetricEncryptionAlgorithmId["AES_256_GCM"] = 0] = "AES_256_GCM";
    SymmetricEncryptionAlgorithmId[SymmetricEncryptionAlgorithmId["INSECURE"] = 1] = "INSECURE";
})(SymmetricEncryptionAlgorithmId || (SymmetricEncryptionAlgorithmId = {}));
class InsecureSymmetricEncryptionKey {
    getEncryptionAlgorithmId() {
        return SymmetricEncryptionAlgorithmId.INSECURE;
    }
    decrypt(data) {
        return data;
    }
    encrypt(data) {
        return data;
    }
}
var KeyExchangeAlgorithmId;
(function (KeyExchangeAlgorithmId) {
    KeyExchangeAlgorithmId[KeyExchangeAlgorithmId["ML_KEM"] = 0] = "ML_KEM";
    KeyExchangeAlgorithmId[KeyExchangeAlgorithmId["INSECURE"] = 1] = "INSECURE";
})(KeyExchangeAlgorithmId || (KeyExchangeAlgorithmId = {}));
class InsecureKeyExchangeScheme {
    getEncapsulationKey() {
        return this;
    }
    encapsulate() {
        return {
            key: new InsecureSymmetricEncryptionKey(),
            ct: ""
        };
    }
    getEncryptionAlgorithmId() {
        return KeyExchangeAlgorithmId.INSECURE;
    }
    decapsulate(ct) {
        return new InsecureSymmetricEncryptionKey();
    }
}

/**
 * An enumeration representing the identifiers for different signature algorithms.
 * This enum is used to indicate the type of cryptographic signature algorithm being utilized.
 *
 * Enum members:
 * - SECP256K1: Indicates the SECP256K1 signature algorithm, typically associated with elliptic-curve cryptography.
 * - ML_DSA_65: Represents the ML-DSA-65 signature algorithm.
 */
var SignatureAlgorithmId;
(function (SignatureAlgorithmId) {
    SignatureAlgorithmId[SignatureAlgorithmId["SECP256K1"] = 0] = "SECP256K1";
    SignatureAlgorithmId[SignatureAlgorithmId["ML_DSA_65"] = 1] = "ML_DSA_65";
})(SignatureAlgorithmId || (SignatureAlgorithmId = {}));

class MLDSA65SignatureScheme {
    getSignatureAlgorithmId() {
        return SignatureAlgorithmId.ML_DSA_65;
    }
    getSignatureSize() {
        return MLDSA65SignatureScheme.SIGNATURE_SIZE;
    }
    getPublicKeyEncoder() {
        return new MLDSA65PublicKeyEncoder();
    }
}
MLDSA65SignatureScheme.SIGNATURE_SIZE = 3311;
/**
 * Represents a public signature key for the MLDSA44 signature scheme.
 *
 * This class provides functionalities to verify digital signatures and retrieve
 * the raw public key used in the signing process. It extends the `MLDSA44SignatureScheme`
 * and implements the `PublicSignatureKey` interface.
 */
class MLDSA65PublicSignatureKey extends MLDSA65SignatureScheme {
    /**
     * Constructs an instance of the class.
     *
     * @param {Uint8Array} publicKey - The public key used for initialization.
     * @return {void} This constructor does not return a value.
     */
    constructor(publicKey) {
        super();
        this.publicKey = publicKey;
    }
    /**
     * Verifies the provided data and its signature using the stored public key.
     *
     * @param {Uint8Array} data - The data to be verified.
     * @param {Uint8Array} signature - The signature of the data to be verified.
     * @return {boolean} Returns true if the verification is successful, otherwise false.
     */
    verify(data, signature) {
        return ml_dsa65.verify(this.publicKey, data, signature);
    }
    /**
     * Retrieves the raw public key as a Uint8Array.
     *
     * @return {Uint8Array} The public key in its raw byte form.
     */
    getRawPublicKey() {
        return this.publicKey;
    }
}
/**
 *
 */
class MLDSA65PrivateSignatureKey extends MLDSA65PublicSignatureKey {
    /**
     * Generates and returns a new private signature key.
     *
     * This method creates a private signature key instance using a randomly generated 32-byte seed.
     *
     * @return {MLDSA65PrivateSignatureKey} A new instance of MLDSA65PrivateSignatureKey initialized with a randomly generated seed.
     */
    static gen() {
        const seed = randomBytes(32);
        return new MLDSA65PrivateSignatureKey(seed);
    }
    /**
     * Constructs a new instance of the class, initializes the public and private keys
     * using the provided seed value.
     *
     * @param {Uint8Array} seed - The seed value used to generate key pairs.
     * @return {void}
     */
    constructor(seed) {
        const keys = ml_dsa65.keygen(seed);
        super(keys.publicKey);
        this.seed = seed;
        this.signatureKey = keys.secretKey;
    }
    /**
     * Retrieves the public signature key associated with this instance.
     *
     * @return {MLDSA65PublicSignatureKey} The public signature key.
     */
    getPublicKey() {
        return this;
    }
    /**
     * Signs the provided data using the signature key.
     *
     * @param {Uint8Array} data - The data to be signed.
     * @return {Uint8Array} The generated signature for the provided data.
     */
    sign(data) {
        return ml_dsa65.sign(this.signatureKey, data);
    }
}
/**
 * Class responsible for encoding and decoding MLDSA44 public signature keys.
 * This implementation provides methods to handle conversions between
 * `MLDSA65PublicSignatureKey` objects and their `Uint8Array` byte representations.
 */
class MLDSA65PublicKeyEncoder {
    /**
     * Decodes a Uint8Array input to generate an MLDSA44PublicSignatureKey instance.
     *
     * @param {Uint8Array} publicKey - The Uint8Array containing the public key data that needs*/
    decodeFromUint8Array(publicKey) {
        return new MLDSA65PublicSignatureKey(publicKey);
    }
    /**
     * Encodes the specified public key as a Uint8Array.
     *
     * @param {MLDSA65PublicSignatureKey} publicKey - The public signature key to encode.
     * @return {Uint8Array} The encoded public key as a Uint8Array.
     */
    encodeAsUint8Array(publicKey) {
        return publicKey.getRawPublicKey();
    }
}

class CryptoSchemeFactory {
    createPrivateSignatureKey(schemeId, walletSeed) {
        switch (schemeId) {
            case SignatureAlgorithmId.ML_DSA_65: return new MLDSA65PrivateSignatureKey(walletSeed);
            default: throw `Not supported signature scheme ID: ${schemeId}`;
        }
    }
    createVirtualBlockchainPrivateSignatureScheme(schemeId, walletSeed, vbSeed) {
        switch (schemeId) {
            case SignatureAlgorithmId.ML_DSA_65: return new MLDSA65PrivateSignatureKey(walletSeed);
            default: throw `Not supported signature scheme ID: ${schemeId}`;
        }
    }
    createDecapsulationKey(schemeId, walletSeed) {
        switch (schemeId) {
            case KeyExchangeAlgorithmId.INSECURE: return new InsecureKeyExchangeScheme();
            default: throw `Not supported encryption scheme ID: ${schemeId}`;
        }
    }
    createVirtualBlockchainDecapsulationKey(schemeId, walletSeed, vbSeed) {
        switch (schemeId) {
            case KeyExchangeAlgorithmId.INSECURE: return new InsecureKeyExchangeScheme();
            default: throw `Not supported encryption scheme ID: ${schemeId}`;
        }
    }
    createPublicSignatureKey(schemeId, publicKey) {
        switch (schemeId) {
            case SignatureAlgorithmId.ML_DSA_65: return new MLDSA65PublicKeyEncoder().decodeFromUint8Array(publicKey);
            default: throw `Not supported signature scheme ID: ${schemeId}`;
        }
    }
    createEncapsulationKey(schemeId, encapsulationKey) {
        switch (schemeId) {
            case KeyExchangeAlgorithmId.INSECURE: return new InsecureKeyExchangeScheme();
            default: throw `Not supported encryption scheme ID: ${schemeId}`;
        }
    }
}

class OrganizationVb extends VirtualBlockchain {
    constructor({ provider }) {
        super({ provider, type: VB_ORGANIZATION });
        this.registerSectionCallback(ORG_SIG_ALGORITHM, this.signatureAlgorithmCallback);
        this.registerSectionCallback(ORG_PUBLIC_KEY, this.publicKeyCallback);
        this.registerSectionCallback(ORG_DESCRIPTION, this.descriptionCallback);
        this.registerSectionCallback(ORG_SIGNATURE, this.signatureCallback);
    }
    /**
      Update methods
    */
    setSignatureAlgorithm(object) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.addSection(ORG_SIG_ALGORITHM, object);
        });
    }
    setPublicKey(object) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.addSection(ORG_PUBLIC_KEY, object);
        });
    }
    setDescription(object) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.addSection(ORG_DESCRIPTION, object);
        });
    }
    /**
     *
     * @param {PrivateSignatureKey} privateKey
     * @returns {Promise<void>}
     */
    setSignature(privateKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const object = this.createSignature(privateKey);
            yield this.addSection(ORG_SIGNATURE, object);
        });
    }
    /**
      Section callbacks
    */
    signatureAlgorithmCallback(microblock, section) {
        return __awaiter(this, void 0, void 0, function* () {
            this.state.signatureAlgorithmId = section.object.algorithmId;
        });
    }
    publicKeyCallback(microblock, section) {
        return __awaiter(this, void 0, void 0, function* () {
            this.state.publicKeyHeight = microblock.header.height;
        });
    }
    descriptionCallback(microblock, section) {
        return __awaiter(this, void 0, void 0, function* () {
            this.state.descriptionHeight = microblock.header.height;
        });
    }
    signatureCallback(microblock, section) {
        return __awaiter(this, void 0, void 0, function* () {
            const keyMicroblock = yield this.getMicroblock(this.state.publicKeyHeight);
            const rawPublicKey = keyMicroblock.getSection((section) => section.type == ORG_PUBLIC_KEY).object.publicKey;
            const cryptoFactory = new CryptoSchemeFactory();
            const signatureAlgorithmId = this.state.signatureAlgorithmId;
            const publicKey = cryptoFactory.createPublicSignatureKey(signatureAlgorithmId, rawPublicKey);
            const valid = microblock.verifySignature(publicKey, section.object.signature, true, section.index);
            if (!valid) {
                throw `invalid signature`;
            }
        });
    }
    /**
      Structure check
    */
    checkStructure(microblock) {
        const checker = new StructureChecker(microblock);
        checker.expects(checker.isFirstBlock() ? ONE : ZERO, ORG_SIG_ALGORITHM);
        checker.expects(checker.isFirstBlock() ? ONE : AT_MOST_ONE, ORG_PUBLIC_KEY);
        checker.group(AT_LEAST_ONE, [
            [AT_MOST_ONE, ORG_DESCRIPTION],
            [AT_MOST_ONE, ORG_SERVER]
        ]);
        checker.expects(ONE, ORG_SIGNATURE);
        checker.endsHere();
    }
}

class ApplicationVb extends VirtualBlockchain {
    constructor({ provider }) {
        super({ provider, type: VB_ORGANIZATION });
        this.registerSectionCallback(APP_SIG_ALGORITHM, this.signatureAlgorithmCallback);
        this.registerSectionCallback(APP_DECLARATION, this.declarationCallback);
        this.registerSectionCallback(APP_SIGNATURE, this.signatureCallback);
    }
    /**
      Update methods
    */
    setSignatureAlgorithm(object) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.addSection(APP_SIG_ALGORITHM, object);
        });
    }
    setDeclaration(object) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.addSection(APP_DECLARATION, object);
        });
    }
    setDescription(object) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.addSection(APP_DESCRIPTION, object);
        });
    }
    /**
     *
     * @param {PrivateSignatureKey} privateKey
     * @returns {Promise<void>}
     */
    setSignature(privateKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const object = this.createSignature(privateKey);
            yield this.addSection(APP_SIGNATURE, object);
        });
    }
    /**
      Section callbacks
    */
    signatureAlgorithmCallback(microblock, section) {
        return __awaiter(this, void 0, void 0, function* () {
            this.state.signatureAlgorithmId = section.object.algorithmId;
        });
    }
    declarationCallback(microblock, section) {
        return __awaiter(this, void 0, void 0, function* () {
        });
    }
    signatureCallback(microblock, section) {
        return __awaiter(this, void 0, void 0, function* () {
        });
    }
    /**
      Structure check
    */
    checkStructure(microblock) {
        const checker = new StructureChecker(microblock);
        checker.expects(checker.isFirstBlock() ? ONE : ZERO, APP_SIG_ALGORITHM);
        checker.expects(checker.isFirstBlock() ? ONE : ZERO, APP_DECLARATION);
        checker.group(AT_LEAST_ONE, [
            [AT_MOST_ONE, APP_DESCRIPTION]
        ]);
        checker.expects(ONE, APP_SIGNATURE);
        checker.endsHere();
    }
}

class ApplicationLedgerVb extends VirtualBlockchain {
    constructor({ provider }) {
        super({ provider, type: VB_APP_LEDGER });
        this.state = {
            actors: [],
            channels: []
        };
        this.registerSectionCallback(APP_LEDGER_SIG_ALGORITHM, this.signatureAlgorithmCallback);
        this.registerSectionCallback(APP_LEDGER_ACTOR_CREATION, this.actorCreationCallback);
        this.registerSectionCallback(APP_LEDGER_CHANNEL_CREATION, this.channelCreationCallback);
        this.registerSectionCallback(APP_LEDGER_PUBLIC_CHANNEL_DATA, this.publicChannelDataCallback);
        this.registerSectionCallback(APP_LEDGER_PRIVATE_CHANNEL_DATA, this.privateChannelDataCallback);
    }
    /**
      Update methods
    */
    setSignatureAlgorithm(object) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.addSection(APP_LEDGER_SIG_ALGORITHM, object);
        });
    }
    createActor(object) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.addSection(APP_LEDGER_ACTOR_CREATION, object);
        });
    }
    createChannel(object) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.addSection(APP_LEDGER_CHANNEL_CREATION, object);
        });
    }
    addPublicChannelData(object) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.addSection(APP_LEDGER_PUBLIC_CHANNEL_DATA, object);
        });
    }
    addPrivateChannelData(object) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.addSection(APP_LEDGER_PRIVATE_CHANNEL_DATA, object);
        });
    }
    /**
     *
     * @param {PrivateSignatureKey} privateKey
     * @returns {Promise<void>}
     */
    signAsAuthor(privateKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const object = this.createSignature(privateKey);
            yield this.addSection(APP_LEDGER_AUTHOR_SIGNATURE, object);
        });
    }
    /**
      Helper methods
    */
    getChannelId(name) {
        const id = this.state.channels.findIndex((obj) => obj.name == name);
        if (id == -1) {
            throw `unknown channel '${name}'`;
        }
        return id;
    }
    getActorId(name) {
        const id = this.state.actors.findIndex((obj) => obj.name == name);
        if (id == -1) {
            throw `unknown actor '${name}'`;
        }
        return id;
    }
    /**
      Section callbacks
    */
    signatureAlgorithmCallback(microblock, section) {
        return __awaiter(this, void 0, void 0, function* () {
            this.state.signatureAlgorithmId = section.object.algorithmId;
        });
    }
    actorCreationCallback(microblock, section) {
        return __awaiter(this, void 0, void 0, function* () {
            if (section.object.id != this.state.actors.length) {
                throw `invalid actor ID ${section.object.id}`;
            }
            if (this.state.actors.some((obj) => obj.name == section.object.name)) {
                throw `actor '${section.object.name}' already exists`;
            }
            this.state.actors.push({
                name: section.object.name
            });
        });
    }
    channelCreationCallback(microblock, section) {
        return __awaiter(this, void 0, void 0, function* () {
            if (section.object.id != this.state.channels.length) {
                throw `invalid channel ID ${section.object.id}`;
            }
            if (this.state.channels.some((obj) => obj.name == section.object.name)) {
                throw `channel '${section.object.name}' already exists`;
            }
            this.state.channels.push({
                name: section.object.name,
                isPrivate: section.object.isPrivate
            });
        });
    }
    publicChannelDataCallback(microblock, section) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.state.channels[section.object.channelId]) {
                throw `invalid channel ID ${section.object.channelId}`;
            }
        });
    }
    privateChannelDataCallback(microblock, section) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.state.channels[section.object.channelId]) {
                throw `invalid channel ID ${section.object.channelId}`;
            }
        });
    }
    /**
      Structure check
    */
    checkStructure(microblock) {
    }
}

const VB_CLASSES = [
    AccountVb,
    ValidatorNodeVb,
    OrganizationVb,
    ApplicationVb,
    ApplicationLedgerVb
];
class MicroblockImporter {
    constructor({ data, provider }) {
        this.provider = provider;
        this.headerData = data.slice(0, MICROBLOCK_HEADER_SIZE);
        this.bodyData = data.slice(MICROBLOCK_HEADER_SIZE);
        this.hash = Crypto.Hashes.sha256AsBinary(this.headerData);
        this.error = "";
    }
    check(currentTimestamp) {
        return __awaiter(this, void 0, void 0, function* () {
            this.currentTimestamp = currentTimestamp || Utils.getTimestampInSeconds();
            return (yield this.checkHeader()) || (yield this.checkTimestamp()) || (yield this.checkContent());
        });
    }
    /**
      Checks the consistency of the serialized header, the magic string and the protocol version.
    */
    checkHeader() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const headerUnserializer = new SchemaUnserializer(MICROBLOCK_HEADER);
                this.header = headerUnserializer.unserialize(this.headerData);
                if (this.header.magicString != MAGIC_STRING) {
                    this.error = `magic string '${MAGIC_STRING}' is missing`;
                    return MB_STATUS_UNRECOVERABLE_ERROR;
                }
                if (this.header.protocolVersion != PROTOCOL_VERSION) {
                    this.error = `invalid protocol version (expected ${PROTOCOL_VERSION}, got ${this.header.protocolVersion})`;
                    return MB_STATUS_UNRECOVERABLE_ERROR;
                }
            }
            catch (error) {
                this.error = `invalid header format (${error})`;
                return MB_STATUS_UNRECOVERABLE_ERROR;
            }
            return 0;
        });
    }
    /**
      Checks the timestamp declared in the header.
    */
    checkTimestamp() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.header.timestamp < this.currentTimestamp - MAX_MICROBLOCK_PAST_DELAY) {
                this.error = `timestamp is too far in the past`;
                return MB_STATUS_TIMESTAMP_ERROR;
            }
            if (this.header.timestamp > this.currentTimestamp + MAX_MICROBLOCK_FUTURE_DELAY) {
                this.error = `timestamp is too far in the future`;
                return MB_STATUS_TIMESTAMP_ERROR;
            }
            return 0;
        });
    }
    /**
      Checks the body hash declared in the header, the existence of the previous microblock (if any) and the microblock height.
      Then instantiates a virtual blockchain of the relevant type and attempts to import the microblock (which includes the
      state update). Finally, verifies that the declared gas matches the computed gas.
    */
    checkContent() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // check the body hash
                const bodyHash = Crypto.Hashes.sha256AsBinary(this.bodyData);
                if (!Utils.binaryIsEqual(bodyHash, this.header.bodyHash)) {
                    this.error = `inconsistent body hash`;
                    return MB_STATUS_UNRECOVERABLE_ERROR;
                }
                // check the previous microblock, or get the type from the leading byte of the previousHash field if genesis
                let type;
                let vbIdentifier;
                if (this.header.height > 1) {
                    const previousMicroblockInfo = yield this.provider.getMicroblockInformation(this.header.previousHash);
                    if (!previousMicroblockInfo) {
                        this.error = `previous microblock ${Utils.binaryToHexa(this.header.previousHash)} not found`;
                        return MB_STATUS_PREVIOUS_HASH_ERROR;
                    }
                    const headerUnserializer = new SchemaUnserializer(MICROBLOCK_HEADER);
                    const previousHeader = headerUnserializer.unserialize(previousMicroblockInfo.header);
                    if (this.header.height != previousHeader.height + 1) {
                        this.error = `inconsistent microblock height (expected ${previousHeader.height + 1}, got ${this.header.height})`;
                        return MB_STATUS_UNRECOVERABLE_ERROR;
                    }
                    type = previousMicroblockInfo.virtualBlockchainType;
                    vbIdentifier = previousMicroblockInfo.virtualBlockchainId;
                }
                else {
                    type = this.header.previousHash[0];
                }
                // attempt to instantiate the VB class
                const vbClass = VB_CLASSES[type];
                if (!vbClass) {
                    this.error = `invalid virtual blockchain type ${type}`;
                    return MB_STATUS_UNRECOVERABLE_ERROR;
                }
                this.vb = new vbClass({ provider: this.provider });
                // load the VB if this is an existing one
                if (this.header.height > 1) {
                    yield this.vb.load(vbIdentifier);
                }
                // attempt to import the microblock
                yield this.vb.importMicroblock(this.headerData, this.bodyData);
                // check the gas
                const declaredGas = this.vb.currentMicroblock.header.gas;
                const expectedGas = this.vb.currentMicroblock.computeGas();
                if (declaredGas != expectedGas) {
                    this.error = `inconsistent gas value in microblock header (expected ${expectedGas}, got ${declaredGas})`;
                    return MB_STATUS_UNRECOVERABLE_ERROR;
                }
            }
            catch (error) {
                this.error = error.toString();
                return MB_STATUS_UNRECOVERABLE_ERROR;
            }
            return 0;
        });
    }
    store() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.provider.storeMicroblock(this.hash, this.vb.identifier, this.vb.type, this.vb.height, this.headerData, this.bodyData);
            yield this.provider.updateVirtualBlockchainState(this.vb.identifier, this.vb.type, this.vb.height, this.hash, this.vb.state);
        });
    }
}

class Account {
    constructor({ provider }) {
        this.vb = new AccountVb({ provider });
        this.provider = provider;
        if (provider.isKeyed()) {
            this.privateKey = this.provider.getPrivateSignatureKey();
            this.signatureAlgorithmId = this.privateKey.getSignatureAlgorithmId();
        }
    }
    _createGenesis() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.provider.isKeyed())
                throw "Cannot create a genesis account without a keyed provider.";
            yield this.vb.setSignatureAlgorithm({
                algorithmId: this.signatureAlgorithmId
            });
            const publicKey = this.privateKey.getPublicKey();
            yield this.vb.setPublicKey({
                publicKey: publicKey.getRawPublicKey()
            });
            yield this.vb.setTokenIssuance({
                amount: INITIAL_OFFER
            });
        });
    }
    /**
     *
     * @param {Uint8Array} sellerAccount
     * @param {PublicSignatureKey} buyerPublicKey
     * @param {number} amount
     * @returns {Promise<void>}
     * @private
     */
    _create(sellerAccount, buyerPublicKey, amount) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.provider.isKeyed())
                throw "Cannot create an account without a keyed provider.";
            yield this.vb.setSignatureAlgorithm({
                algorithmId: this.signatureAlgorithmId
            });
            yield this.vb.setPublicKey({
                publicKey: buyerPublicKey.getRawPublicKey()
            });
            yield this.vb.setCreation({
                sellerAccount: sellerAccount,
                amount: amount
            });
        });
    }
    _load(identifier) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.vb.load(identifier);
        });
    }
    transfer(object) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.vb.setTransfer(object);
        });
    }
    publishUpdates() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.provider.isKeyed())
                throw "Cannot publish updates without a keyed provider.";
            yield this.vb.setSignature(this.privateKey);
            return yield this.vb.publish();
        });
    }
}

class Organization {
    constructor({ provider }) {
        this.vb = new OrganizationVb({ provider });
        this.provider = provider;
        if (this.provider.isKeyed()) {
            const privateKey = this.provider.getPrivateSignatureKey();
            this.signatureAlgorithmId = privateKey.getSignatureAlgorithmId();
        }
    }
    _create() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.vb.setSignatureAlgorithm({
                algorithmId: this.signatureAlgorithmId
            });
            if (!this.provider.isKeyed())
                throw 'Cannot create an organisation without a keyed provider';
            const privateKey = this.provider.getPrivateSignatureKey();
            const publicKey = privateKey.getPublicKey();
            yield this.vb.setPublicKey({
                publicKey: publicKey.getRawPublicKey()
            });
        });
    }
    _load(identifier) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.vb.load(identifier);
        });
    }
    setDescription(object) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.vb.setDescription(object);
        });
    }
    getDescription() {
        return __awaiter(this, void 0, void 0, function* () {
            // TODO (for all similar methods): the state may have changed and there may be a more recent description
            const microblock = yield this.vb.getMicroblock(this.vb.state.descriptionHeight);
            const section = microblock.getSection((section) => section.type == ORG_DESCRIPTION);
            return section.object;
        });
    }
    publishUpdates() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.provider.isKeyed())
                throw 'Cannot publish updates without keyed provider.';
            const privateKey = this.provider.getPrivateSignatureKey();
            yield this.vb.setSignature(privateKey);
            return yield this.vb.publish();
        });
    }
}

class Application {
    constructor({ provider }) {
        this.vb = new ApplicationVb({ provider });
        this.provider = provider;
        if (this.provider.isKeyed()) {
            const privateKey = this.provider.getPrivateSignatureKey();
            this.signatureAlgorithmId = privateKey.getSignatureAlgorithmId();
        }
    }
    _create(organizationId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.vb.setSignatureAlgorithm({
                algorithmId: this.signatureAlgorithmId
            });
            yield this.vb.setDeclaration({
                organizationId: organizationId
            });
        });
    }
    _load(identifier) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.vb.load(identifier);
        });
    }
    setDescription(object) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.vb.setDescription(object);
        });
    }
    publishUpdates() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.provider.isKeyed())
                throw 'Cannot publish updates without keyed provider.';
            const privateKey = this.provider.getPrivateSignatureKey();
            yield this.vb.sign(privateKey);
            return yield this.vb.publish();
        });
    }
}

class SchemaValidator {
    /**
      Constructor
      @param {Array} schema - Top-level schema
    */
    constructor(schema) {
        this.schema = schema;
    }
    /**
      Checks whether the given object matches the schema.
      @param {object} object - The object to be tested.
    */
    validate(object) {
        this.validateObject(this.schema, object);
    }
    /**
      Validates any sub-object of the full structure.
      @param {Array} schema - The (sub)schema of the object.
      @param {object} object - The object to be serialized.
    */
    validateObject(schema, object, path = "") {
        for (const definition of schema) {
            const fieldPath = path + (path && ".") + definition.name, value = object[definition.name];
            if (value === undefined) {
                if (definition.optional) {
                    continue;
                }
                throw `field '${fieldPath}' is missing`;
            }
            if (definition.type & TYPE_ARRAY_OF) {
                if (TypeManager.getType(value) != TYPE_ARRAY) {
                    throw `'${fieldPath}' is not an array`;
                }
                for (const index in value) {
                    this.validateItem(definition, value[index], fieldPath + `[${index}]`);
                }
            }
            else {
                this.validateItem(definition, value, fieldPath);
            }
        }
    }
    /**
      Validates an item.
      @param {object} definition - The definition of the item.
      @param {} value - The value of the item.
    */
    validateItem(definition, value, fieldPath) {
        const mainType = definition.type & TYPE_MAIN;
        if (mainType == TYPE_OBJECT) {
            if (TypeManager.getType(value) != TYPE_OBJECT) {
                throw `'${fieldPath}' is not an object`;
            }
            if (!definition.unspecifiedSchema) {
                this.validateObject(definition.schema, value, fieldPath);
            }
        }
        else {
            const typeChecker = new TypeChecker(definition, value);
            try {
                typeChecker.check();
            }
            catch (error) {
                throw `Error on field '${fieldPath}': ${error}`;
            }
        }
    }
}

const PathManager = {
    parsePrefix,
    toNumericPath,
    fromNumericPath,
    processCallback,
    fromParents
};
function parsePrefix(pathString) {
    const match = /^(this|previous|block(\d+))(?=\.|\[)/.exec(pathString);
    if (!match) {
        throw `invalid prefix for path '${pathString}'`;
    }
    return {
        prefix: match[0],
        pathString: pathString.slice(match[0].length)
    };
}
function toNumericPath(irObject, pathString) {
    const res = processPathString(irObject, pathString, false);
    return res.numericPath;
}
function fromNumericPath(irObject, numericPath) {
    let item = irObject[0], pathString = "";
    for (const index of numericPath) {
        if (item.type == TYPE_OBJECT) {
            item = item.properties[index];
            pathString += "." + item.name;
        }
        else if (item.type == TYPE_ARRAY) {
            item = item.entries[index];
            pathString += `[${item.index}]`;
        }
    }
    return pathString;
}
function fromParents(parents) {
    let pathString = "";
    for (let n = 1; n < parents.length; n++) {
        const item = parents[n];
        pathString += parents[n - 1].type == TYPE_ARRAY ? `[${item.index}]` : "." + item.name;
    }
    return pathString;
}
function processCallback(irObject, pathString, callback) {
    const res = processPathString(irObject, pathString, true);
    if (res.hasWildcard) {
        (function browse(list) {
            for (const item of list) {
                if (item.type == TYPE_OBJECT) {
                    browse(item.properties);
                }
                else if (item.type == TYPE_ARRAY) {
                    browse(item.entries);
                }
                else {
                    callback(item);
                }
            }
        })(res.item);
    }
    else {
        callback(res.item);
    }
}
function processPathString(irObject, pathString, wildcardAllowed) {
    const parts = pathString.match(/\[(?:\*|\d+)\]|\.(?:\*|[^.*\[\]]+)/g);
    if (parts.join("") != pathString) {
        throw `invalid syntax for path '${pathString}'`;
    }
    const numericPath = [];
    let item = irObject[0], index, hasWildcard = false;
    for (let part of parts) {
        if (hasWildcard) {
            throw `a wildcard cannot be followed by anything else`;
        }
        switch (part[0]) {
            case ".": {
                const propertyName = part.slice(1);
                if (item.type != TYPE_OBJECT) {
                    throw `cannot read property '${propertyName}': the parent node is not an object`;
                }
                if (propertyName == "*") {
                    if (!wildcardAllowed) {
                        throw `a wildcard is not allowed`;
                    }
                    item = item.properties;
                    hasWildcard = true;
                }
                else {
                    index = item.properties.findIndex((obj) => obj.name == propertyName);
                    if (index == -1) {
                        throw `cannot find property '${propertyName}'`;
                    }
                    item = item.properties[index];
                }
                break;
            }
            case "[": {
                if (item.type != TYPE_ARRAY) {
                    throw `cannot read entry '${part}': the parent node is not an array`;
                }
                const arrayIndex = part.slice(1, -1);
                if (arrayIndex == "*") {
                    if (!wildcardAllowed) {
                        throw `a wildcard is not allowed`;
                    }
                    item = item.entries;
                    hasWildcard = true;
                }
                else {
                    index = item.entries.findIndex((obj) => obj.index == arrayIndex);
                    if (index == -1) {
                        throw `cannot find index '${arrayIndex}'`;
                    }
                    item = item.entries[index];
                }
                break;
            }
        }
        numericPath.push(index);
    }
    if (!hasWildcard) {
        switch (item.type) {
            case TYPE_OBJECT: {
                throw `the last part of the path must be a primitive type${wildcardAllowed ? " (use .* to access all object properties)" : ""}`;
            }
            case TYPE_ARRAY: {
                throw `the last part of the path must be a primitive type${wildcardAllowed ? " (use [*] to access all array entries)" : ""}`;
            }
        }
    }
    return {
        item: item,
        numericPath: numericPath,
        hasWildcard: hasWildcard
    };
}

const MaskManager = {
    getListFromRegex,
    applyMask,
    getVisibleText,
    getFullText
};
function getListFromRegex(str, regex, substitution) {
    const stringParts = (regex.exec(str) || []).slice(1);
    if (stringParts.join("") != str) {
        throw `the regular expression ${regex} does not capture all string parts`;
    }
    const substitutionParts = substitution.split(/(\$\d+)/)
        .map((s, i) => [i & 1, s])
        .filter((a) => a[1]);
    if (substitutionParts.length != stringParts.length ||
        substitutionParts.some(([shown, s], i) => shown && s != "$" + (i + 1))) {
        throw `invalid substitution string "${substitution}"`;
    }
    const list = [];
    let ptr = 0;
    substitutionParts.forEach(([shown, s], i) => {
        const newPtr = ptr + stringParts[i].length;
        if (!shown) {
            list.push([ptr, newPtr, s]);
        }
        ptr = newPtr;
    });
    return list;
}
function applyMask(str, list) {
    const visible = [], hidden = [];
    list.sort((a, b) => a[0] - b[0]);
    list.forEach(([start, end, maskString], i) => {
        const [prevStart, prevEnd] = i ? list[i - 1] : [0, 0];
        if (start < 0 || start >= str.length || end <= start) {
            throw `invalid interval [${[start, end]}]`;
        }
        if (start < prevEnd) {
            throw `overlapping intervals [${[prevStart, prevEnd]}] / [${[start, end]}]`;
        }
        const hiddenPart = str.slice(start, end);
        if (i && start == prevEnd) {
            visible[visible.length - 1] += maskString;
            hidden[hidden.length - 1] += hiddenPart;
        }
        else {
            visible.push(str.slice(prevEnd, start), maskString);
            hidden.push(hiddenPart);
        }
        if (i == list.length - 1 && end < str.length) {
            visible.push(str.slice(end));
        }
    });
    return { visible, hidden };
}
function getVisibleText(visible) {
    return visible.join("");
}
function getFullText(visible, hidden) {
    return visible.map((s, i) => i & 1 ? hidden[i >> 1] : s).join("");
}

class MerkleTree {
    constructor() {
        this.leaves = [];
    }
    addLeaf(hash) {
        this.checkHash(hash);
        this.leaves.push(hash);
    }
    setLeaf(index, hash) {
        this.checkHash(hash);
        this.leaves[index] = hash;
    }
    checkHash(hash) {
        if (!(hash instanceof Uint8Array) || hash.length != 32) {
            throw "invalid hash";
        }
    }
    finalize(nLeaves) {
        this.nLeaves = nLeaves === undefined ? this.leaves.length : nLeaves;
        this.buildTreeStructure();
    }
    getNumberOfLeaves() {
        return this.nLeaves;
    }
    getRootHash() {
        const rootDepth = this.tree.length - 1;
        for (let depth = 0; depth < rootDepth; depth++) {
            const row = this.tree[depth];
            for (let index = 0; index < row.length; index += 2) {
                if (row[index] && row[index + 1]) {
                    this.tree[depth + 1][index >> 1] = this.mergeHashes(depth + 1, row[index], row[index + 1]);
                }
            }
        }
        return this.tree[rootDepth][0];
    }
    getWitnesses(unknownPositions) {
        const unknownPositionSet = new Set(unknownPositions), witnessPositions = this.getWitnessPositions(unknownPositionSet), witnesses = [];
        for (let index = 0; index < this.tree[0].length; index++) {
            if (!unknownPositionSet.has(index) && !this.tree[0][index]) {
                throw `cannot find leaf at index ${index}`;
            }
        }
        for (const [depth, index] of witnessPositions) {
            const witness = this.tree[depth][index];
            if (!witness) {
                throw `cannot find witness hash at depth ${depth}, index ${index}`;
            }
            witnesses.push(witness);
        }
        return witnesses;
    }
    setWitnesses(witnesses) {
        const unknownPositionSet = new Set;
        for (let index = 0; index < this.nLeaves; index++) {
            if (!this.leaves[index]) {
                unknownPositionSet.add(index);
            }
        }
        const witnessPositions = this.getWitnessPositions(unknownPositionSet);
        if (witnesses.length != witnessPositions.length) {
            throw "invalid witness list";
        }
        let ptr = 0;
        for (const [depth, index] of witnessPositions) {
            this.checkHash(witnesses[ptr]);
            this.tree[depth][index] = witnesses[ptr++];
        }
    }
    buildTreeStructure() {
        let nLeaves = this.nLeaves;
        this.tree = [];
        while (nLeaves) {
            const row = Array(nLeaves).fill(null);
            if (nLeaves > 1 && nLeaves & 1) {
                row.push(Utils.getNullHash());
                nLeaves++;
            }
            this.tree.push(row);
            nLeaves >>= 1;
        }
        for (let index = 0; index < this.nLeaves; index++) {
            if (this.leaves[index]) {
                this.tree[0][index] = this.leaves[index];
            }
        }
    }
    getWitnessPositions(unknownPositionSet) {
        let nLeaves = this.nLeaves;
        const witnessPositions = [];
        for (let depth = 0; nLeaves; depth++) {
            const newUnknownPositionSet = new Set;
            for (let index = 0; index < nLeaves; index += 2) {
                const unknownLeft = unknownPositionSet.has(index), unknownRight = index + 1 < nLeaves && unknownPositionSet.has(index + 1);
                if (unknownLeft && unknownRight) {
                    newUnknownPositionSet.add(index >> 1);
                }
                else if (unknownLeft || unknownRight) {
                    witnessPositions.push([depth, index + unknownRight]);
                }
            }
            unknownPositionSet = newUnknownPositionSet;
            nLeaves = nLeaves + (nLeaves > 1) >> 1;
        }
        return witnessPositions;
    }
    mergeHashes(depth, left, right) {
        const data = new Uint8Array(65);
        data[0] = +(depth == this.tree.length - 1);
        data.set(left, 1);
        data.set(right, 33);
        return Crypto.Hashes.sha256AsBinary(data);
    }
}

class Merklizer {
    constructor() {
        this.tree = new MerkleTree;
    }
    addItem(item, parents) {
        const info = this.getLeafInfo(item, parents);
        if (item.attributes & MASKABLE) {
            this.addMaskableItem(item, info);
        }
        else if (item.attributes & HASHABLE) {
            this.addHashableItem(item, info);
        }
        else {
            this.addRawItem(item, info);
        }
    }
    getLeafInfo(item, parents) {
        const path = PathManager.fromParents(parents), utf8Path = Utf8Encoder.encode(path);
        if (utf8Path.length > 0xFFFF) {
            throw "path too long";
        }
        const info = new Uint8Array(utf8Path.length + 3);
        info[0] = item.type;
        info[1] = utf8Path.length >> 8;
        info[2] = utf8Path.length & 0xFF;
        info.set(utf8Path, 3);
        return info;
    }
    getWitnesses(knownPositions) {
        const unknownPositions = [];
        for (let index = 0; index < this.nLeaves; index++) {
            if (!knownPositions.has(index)) {
                unknownPositions.push(index);
            }
        }
        const witnesses = this.tree.getWitnesses(unknownPositions);
        return witnesses.map((arr) => Utils.binaryToHexa(arr)).join("");
    }
}
class PepperMerklizer extends Merklizer {
    constructor(pepper) {
        super();
        this.pepper = pepper || this.constructor.generatePepper();
        this.saltCounter = 0;
        this.leaves = [];
    }
    static generatePepper() {
        return Crypto.Random.getBytes(32);
    }
    addLeaf(item, data) {
        this.leaves.push({
            item: item,
            hash: Crypto.Hashes.sha256AsBinary(data)
        });
    }
    generateTree() {
        this.nLeaves = this.leaves.length;
        this.leaves.sort((a, b) => Utils.binaryCompare(a.hash, b.hash));
        for (const n in this.leaves) {
            this.tree.addLeaf(this.leaves[+n].hash);
            this.leaves[+n].item.leafIndex = +n;
        }
        this.tree.finalize();
        const rootHash = this.tree.getRootHash();
        return {
            nLeaves: this.leaves.length,
            rootHash: Utils.binaryToHexa(rootHash),
            pepper: Utils.binaryToHexa(this.pepper)
        };
    }
    addRawItem(item, info) {
        const salt = this.getSalt();
        item.salt = Utils.binaryToHexa(salt);
        this.addLeaf(item, Utils.binaryFrom(salt, info, item.valueBinary));
    }
    addHashableItem(item, info) {
        const salt = this.getSalt(), hash = Crypto.Hashes.sha256AsBinary(item.valueBinary);
        item.hash = Utils.binaryToHexa(hash);
        item.salt = Utils.binaryToHexa(salt);
        this.addLeaf(item, Utils.binaryFrom(salt, info, hash));
    }
    addMaskableItem(item, info) {
        const visibleSalt = this.getSalt(), visibleHash = Crypto.Hashes.sha256AsBinary(Utils.binaryFrom(visibleSalt, info, item.visiblePartsBinary)), hiddenSalt = this.getSalt(), hiddenHash = Crypto.Hashes.sha256AsBinary(Utils.binaryFrom(hiddenSalt, item.hiddenPartsBinary));
        item.visibleSalt = Utils.binaryToHexa(visibleSalt);
        item.hiddenSalt = Utils.binaryToHexa(hiddenSalt);
        item.hiddenHash = Utils.binaryToHexa(hiddenHash);
        this.addLeaf(item, Utils.binaryFrom(visibleHash, hiddenHash));
    }
    getSalt() {
        const n = this.saltCounter & 3, k = this.saltCounter++ >> 2;
        if (!n) {
            this.sha512 = Crypto.Hashes.sha512AsBinary(Utils.binaryFrom(this.pepper, k));
        }
        return this.sha512.slice(n << 4, (n + 1) << 4);
    }
}
class SaltMerklizer extends Merklizer {
    constructor(nLeaves, witnesses) {
        super();
        this.nLeaves = nLeaves;
        this.witnesses = (witnesses.match(/.{64}/g) || []).map((s) => Utils.binaryFromHexa(s));
    }
    addLeaf(item, data) {
        this.tree.setLeaf(item.leafIndex, Crypto.Hashes.sha256AsBinary(data));
    }
    generateTree() {
        this.tree.finalize(this.nLeaves);
        this.tree.setWitnesses(this.witnesses);
        const rootHash = this.tree.getRootHash();
        return {
            nLeaves: this.tree.getNumberOfLeaves(),
            rootHash: Utils.binaryToHexa(rootHash)
        };
    }
    addRawItem(item, info) {
        const salt = Utils.binaryFromHexa(item.salt);
        this.addLeaf(item, Utils.binaryFrom(salt, info, item.valueBinary));
    }
    addHashableItem(item, info) {
        const salt = Utils.binaryFromHexa(item.salt);
        let hash;
        if (item.hash) {
            hash = Utils.binaryFromHexa(item.hash);
        }
        else {
            hash = Crypto.Hashes.sha256AsBinary(item.valueBinary);
            item.hash = hash;
        }
        this.addLeaf(item, Utils.binaryFrom(salt, info, item.valueBinary));
    }
    addMaskableItem(item, info) {
        const visibleSalt = Utils.binaryFromHexa(item.visibleSalt), visibleHash = Crypto.Hashes.sha256AsBinary(Utils.binaryFrom(visibleSalt, info, item.visiblePartsBinary));
        let hiddenHash;
        if (item.hiddenHash) {
            hiddenHash = Utils.binaryFromHexa(item.hiddenHash);
        }
        else {
            const hiddenSalt = Utils.binaryFromHexa(item.hiddenSalt);
            hiddenHash = Crypto.Hashes.sha256AsBinary(Utils.binaryFrom(hiddenSalt, item.hiddenPartsBinary));
            item.hiddenHash = Utils.binaryToHexa(hiddenHash);
        }
        this.addLeaf(item, Utils.binaryFrom(visibleHash, hiddenHash));
    }
}

const MAX_UINT8_ARRAY_DUMP_SIZE = 24;
class IntermediateRepresentation {
    /**
      Constructor
    */
    constructor() {
        this.irObject = [];
        this.channelDefinitions = new Map;
        this.object = {
            info: {},
            recordData: this.irObject
        };
    }
    addPublicChannel(id) {
        if (this.channelDefinitions.has(id)) {
            throw `channel ${id} was already added`;
        }
        this.channelDefinitions.set(id, { id, isPrivate: false });
    }
    addPrivateChannel(id) {
        if (this.channelDefinitions.has(id)) {
            throw `channel ${id} was already added`;
        }
        this.channelDefinitions.set(id, { id, isPrivate: true, pepper: PepperMerklizer.generatePepper() });
    }
    /**
      Initializes the IR object from a JSON-compatible object.
      @param {object} input
    */
    buildFromJson(input) {
        const output = [];
        processStructure({
            root: input
        }, output, false);
        this.irObject = output;
        function processNode(object, propertyName, container, insideArray) {
            const item = object[propertyName], type = TypeManager.getType(item);
            if (!TypeManager.isJsonType(type)) {
                throw `Invalid JSON type`;
            }
            const outputNode = {
                type: type
            };
            if (insideArray) {
                outputNode.index = +propertyName;
            }
            else {
                outputNode.name = propertyName;
            }
            if (type == TYPE_OBJECT) {
                outputNode.properties = [];
                processStructure(item, outputNode.properties, false);
            }
            else if (type == TYPE_ARRAY) {
                outputNode.entries = [];
                processStructure(item, outputNode.entries, true);
            }
            else {
                outputNode.value = item;
                outputNode.attributes = 0;
                outputNode.channelId = null;
            }
            container.push(outputNode);
        }
        function processStructure(object, output, insideArray) {
            for (const propertyName in object) {
                processNode(object, propertyName, output, insideArray);
            }
        }
    }
    /**
      Exports the IR object to the serialized section format used for on-chain storage.
    */
    exportToSectionFormat() {
        const list = [];
        for (const channelId of this.usedChannels) {
            const channelInfo = this.channelDefinitions.get(channelId);
            const data = this.exportChannelToSectionFormat(channelInfo);
            const object = { channelId, data, isPrivate: channelInfo.isPrivate };
            if (channelInfo.isPrivate) {
                object.merkleRootHash = this.getMerkleRootHash(channelId);
            }
            list.push(object);
        }
        return list;
    }
    /**
      Exports a given channel to the serialized section format used for on-chain storage.
    */
    exportChannelToSectionFormat(channelInfo) {
        const stream = new WriteStream();
        if (channelInfo.isPrivate) {
            stream.writeByteArray(channelInfo.pepper);
        }
        const dictionary = this.buildDictionary(channelInfo.id);
        stream.writeVarUint(dictionary.length);
        for (const name of dictionary) {
            stream.writeString(name);
        }
        this.traverseIrObject({
            channelId: channelInfo.id,
            onObject: (item, context, insideArray, parents) => {
                if (parents.length > 1) {
                    writeIdentifier(item, insideArray);
                }
                stream.writeByte(item.type);
                stream.writeVarUint(countChildren(item.properties));
            },
            onArray: (item, context, insideArray, parents) => {
                if (parents.length > 1) {
                    writeIdentifier(item, insideArray);
                }
                stream.writeByte(item.type);
                stream.writeVarUint(countChildren(item.entries));
            },
            onPrimitive: (item, context, insideArray, parents) => {
                writeIdentifier(item, insideArray);
                stream.writeByte(item.type | item.attributes << 3);
                if (item.attributes == MASKABLE) {
                    stream.writeByteArray(item.visiblePartsBinary);
                    stream.writeByteArray(item.hiddenPartsBinary);
                }
                else {
                    stream.writeByteArray(item.valueBinary);
                }
            }
        });
        return stream.getByteStream();
        function writeIdentifier(item, insideArray) {
            stream.writeVarUint(insideArray ?
                item.index
                :
                    dictionary.indexOf(item.name));
        }
        function countChildren(list) {
            return list.reduce((cnt, item) => cnt +=
                item.type == TYPE_ARRAY || item.type == TYPE_OBJECT ?
                    item.channels.has(channelInfo.id)
                    :
                        item.channelId === channelInfo.id, 0);
        }
    }
    /**
      Imports the IR object from the serialized section format.
    */
    importFromSectionFormat(list) {
        for (const object of list) {
            const channelInfo = this.channelDefinitions.get(object.channelId);
            this.importChannelFromSectionFormat(channelInfo, object.data);
            if (channelInfo.isPrivate) {
                const merkleRootHash = this.getMerkleRootHash(object.channelId);
                if (merkleRootHash != object.merkleRootHash) {
                    throw `inconsistent Merkle root hash (expected: ${object.merkleRootHash}, computed: ${merkleRootHash})`;
                }
            }
        }
    }
    /**
      Imports a given channel from the serialized section format.
    */
    importChannelFromSectionFormat(channelInfo, data$1) {
        const stream = new ReadStream(data$1);
        if (channelInfo.isPrivate) {
            channelInfo.pepper = stream.readByteArray(32);
        }
        const dictionarySize = stream.readVarUint(), dictionary = [];
        for (let n = 0; n < dictionarySize; n++) {
            dictionary.push(stream.readString());
        }
        readNode(this.irObject, false, true);
        function readNode(container, insideArray, isRoot = false) {
            const id = isRoot ? null : stream.readVarUint(), name = insideArray ? null : isRoot ? "root" : dictionary[id], param = stream.readByte(), type = param & 0x7, attributes = param >> 3;
            let newItem = true, item;
            if (type == TYPE_OBJECT || type == TYPE_ARRAY) {
                // if this item is an object or an array, it may have been already created while processing another channel,
                // in which case we must re-use the existing instance
                item = container.find((item) => insideArray ? item.index == id : item.name == name);
                newItem = item === undefined;
            }
            if (newItem) {
                item = { type };
                if (insideArray) {
                    item.index = id;
                }
                else {
                    item.name = name;
                }
            }
            if (type == TYPE_OBJECT) {
                (item.channels = item.channels || new Set).add(channelInfo.id);
                readObject(item);
            }
            else if (type == TYPE_ARRAY) {
                (item.channels = item.channels || new Set).add(channelInfo.id);
                readArray(item, !newItem);
            }
            else {
                if (attributes == MASKABLE) {
                    let ptr;
                    item.visibleParts = [];
                    item.hiddenParts = [];
                    ptr = stream.getPointer();
                    for (let n = stream.readVarUint(); n--;) {
                        item.visibleParts.push(stream.readString());
                    }
                    item.visiblePartsBinary = stream.extractFrom(ptr);
                    ptr = stream.getPointer();
                    for (let n = stream.readVarUint(); n--;) {
                        item.hiddenParts.push(stream.readString());
                    }
                    item.hiddenPartsBinary = stream.extractFrom(ptr);
                    item.value = MaskManager.getFullText(item.visibleParts, item.hiddenParts);
                }
                else {
                    item.value = stream.readJsonValue(type);
                    item.valueBinary = stream.getLastField();
                }
                item.attributes = attributes;
                item.channelId = channelInfo.id;
            }
            if (newItem) {
                container.push(item);
            }
        }
        function readObject(parent) {
            const nProperties = stream.readVarUint();
            parent.properties = parent.properties || [];
            for (let n = 0; n < nProperties; n++) {
                readNode(parent.properties, false);
            }
        }
        function readArray(parent, sortRequired) {
            const nEntries = stream.readVarUint();
            parent.entries = parent.entries || [];
            for (let n = 0; n < nEntries; n++) {
                readNode(parent.entries, true);
            }
            if (sortRequired) {
                parent.entries.sort((a, b) => a.index - b.index);
            }
        }
    }
    /**
      Exports the IR object to a proof, as a JSON-compatible object.
      @param {object} info - An object containing meta-data about the proof.
    */
    exportToProof(info) {
        const proofIr = new IntermediateRepresentation, merkleData = [];
        for (const channelId of this.usedChannels) {
            const channelInfo = this.channelDefinitions.get(channelId);
            if (!channelInfo.isPrivate) {
                continue;
            }
            const merklizer = this.getMerklizer(channelId), merkleObject = merklizer.generateTree(), knownPositions = new Set;
            this.traverseIrObject({
                channelId: channelId,
                onPrimitive: (item, context, insideArray, parents) => {
                    if (!(item.attributes & REDACTED)) {
                        knownPositions.add(item.leafIndex);
                        const proofItem = proofIr.createBranch(parents);
                        proofItem.attributes = item.attributes;
                        proofItem.channelId = item.channelId;
                        proofItem.leafIndex = item.leafIndex;
                        if (item.attributes & MASKABLE) {
                            proofItem.visibleSalt = item.visibleSalt;
                            proofItem.visibleParts = item.visibleParts;
                            if (item.attributes & MASKED) {
                                proofItem.hiddenHash = item.hiddenHash;
                            }
                            else {
                                proofItem.hiddenSalt = item.hiddenSalt;
                                proofItem.hiddenParts = item.hiddenParts;
                            }
                        }
                        else if (item.attributes & HASHABLE) {
                            proofItem.salt = item.salt;
                            if (item.attributes & HASHED) {
                                proofItem.hash = item.hash;
                            }
                            else {
                                proofItem.value = item.value;
                            }
                        }
                        else {
                            proofItem.salt = item.salt;
                            proofItem.value = item.value;
                        }
                    }
                }
            });
            merkleData.push({
                channelId: channelId,
                nLeaves: merkleObject.nLeaves,
                witnesses: merklizer.getWitnesses(knownPositions)
            });
        }
        const infoObject = proofIr.object.info;
        infoObject.type = "proof";
        infoObject.microblock = info.microblock;
        infoObject.timestamp = (new Date).toJSON();
        infoObject.author = info.author;
        proofIr.object.merkleData = merkleData;
        return proofIr.object;
    }
    /**
      Imports the IR object from a proof.
      @param {object} proof - The proof object generated by the exportToProof() method.
    */
    importFromProof(proof) {
        this.object = proof;
        this.irObject = proof.recordData;
        this.populateChannels();
        this.serializeFields();
        const merkleData = [];
        for (const channelId of this.usedChannels) {
            const channelInfo = this.channelDefinitions.get(channelId);
            if (!channelInfo.isPrivate) {
                continue;
            }
            const merklizer = this.getMerklizer(channelId), merkleObject = merklizer.generateTree();
            merkleData.push({
                channelId: channelId,
                rootHash: merkleObject.rootHash
            });
        }
        return merkleData;
    }
    /**
      Internal method to create a branch in the object tree, including a primitive type and all its parents.
      Only a minimal set of properties is included for each node: 'type', 'name'/'index', 'properties'/'entries'.
      @param {array} itemList - An array containing the primitive item, preceded by all its parents.
    */
    createBranch(itemList) {
        let container = this.irObject, insideArray = false;
        for (const currentItem of itemList) {
            if (currentItem.type == TYPE_OBJECT || currentItem.type == TYPE_ARRAY) {
                let refItem = container.find((item) => insideArray ? item.index == currentItem.index : item.name == currentItem.name);
                if (!refItem) {
                    refItem = createNewItem(currentItem);
                    if (currentItem.type == TYPE_OBJECT) {
                        refItem.properties = [];
                    }
                    else {
                        refItem.entries = [];
                    }
                    container.push(refItem);
                }
                insideArray = refItem.type == TYPE_ARRAY;
                container = insideArray ? refItem.entries : refItem.properties;
            }
            else {
                const refItem = createNewItem(currentItem);
                container.push(refItem);
                return refItem;
            }
        }
        function createNewItem(item) {
            const newItem = {
                type: item.type
            };
            if (insideArray) {
                newItem.index = item.index;
            }
            else {
                newItem.name = item.name;
            }
            return newItem;
        }
    }
    getMerkleRootHash(channelId) {
        const merklizer = this.getMerklizer(channelId), merkleObject = merklizer.generateTree();
        return merkleObject.rootHash;
    }
    /**
      Internal method to create a merklizer for a given channel, using either the channel pepper or the salts.
      @param {number} channel - The identifier of the channel.
    */
    getMerklizer(channelId) {
        let merklizer;
        if (this.object.info.type == "proof") {
            const merkleData = this.object.merkleData.find((obj) => obj.channelId == channelId);
            merklizer = new SaltMerklizer(merkleData.nLeaves, merkleData.witnesses);
        }
        else {
            const channelInfo = this.channelDefinitions.get(channelId);
            merklizer = new PepperMerklizer(channelInfo.pepper);
        }
        this.traverseIrObject({
            channelId: channelId,
            onPrimitive: (item, context, insideArray, parents) => {
                merklizer.addItem(item, parents);
            }
        });
        return merklizer;
    }
    /**
      Returns the IR object.
    */
    getIRObject() {
        return this.irObject;
    }
    /**
      Returns a formatted dump of the IR object, with uint8 arrays turned into truncated hexadecimal strings for readability.
    */
    dumpIRObject() {
        return JSON.stringify(this.irObject, (key, value) => {
            if (value instanceof Uint8Array) {
                return [
                    `<${value.length} byte(s)>`,
                    ...[...value.slice(0, MAX_UINT8_ARRAY_DUMP_SIZE)].map((v) => v.toString(16).toUpperCase().padStart(2, "0"))
                ].join(" ") +
                    (value.length > MAX_UINT8_ARRAY_DUMP_SIZE ? " .." : "");
            }
            if (value instanceof Set) {
                return [...value];
            }
            return value;
        }, 2);
    }
    /**
      Associates a set of fields to a channel.
      @param {string} pathStringList - A string describing the set of fields.
      @param {number} channel - The channel identifier.
    */
    setChannel(pathStringList, channelId) {
        if (!this.channelDefinitions.has(channelId)) {
            throw `channel ${channelId} is undefined`;
        }
        this.processPath(pathStringList, (item) => {
            item.channelId = channelId;
        });
    }
    /**
      Sets the 'maskable' attribute for a set of fields and define their visible and hidden parts using explicit positions, lengths and replacement strings.
      @param {string} pathStringList - A string describing the set of fields.
      @param {array} maskedParts - An array describing the masked parts.
    */
    setAsMaskable(pathStringList, maskedParts) {
        this.processPath(pathStringList, (item) => {
            const obj = MaskManager.applyMask(item.value, maskedParts);
            item.visibleParts = obj.visible;
            item.hiddenParts = obj.hidden;
            item.attributes = MASKABLE;
        });
    }
    /**
      Sets the 'maskable' attribute for a set of fields and define their visible and hidden parts using a regular expression and a substitution string.
      @param {string} pathStringList - A string describing the set of fields.
      @param {RegExp} regex - A regular expression whose capturing groups must cover the entire field value, e.g. /^(.)(.*?)(@.)(.*?)(\..*)$/.
      @param {string} substitution - The substitution string, which should include references to capturing groups and placeholders for hidden parts, e.g. "$1***$3***$5".
    */
    setAsMaskableByRegex(pathStringList, regex, substitution) {
        this.processPath(pathStringList, (item) => {
            const list = MaskManager.getListFromRegex(item.value, regex, substitution), obj = MaskManager.applyMask(item.value, list);
            item.visibleParts = obj.visible;
            item.hiddenParts = obj.hidden;
            item.attributes = (item.attributes & -4) | MASKABLE;
        });
    }
    /**
      Sets the 'hashable' attribute for a set of fields.
      @param {string} pathStringList - A string describing the set of fields.
    */
    setAsHashable(pathStringList) {
        this.processPath(pathStringList, (item) => {
            item.attributes = (item.attributes & -4) | HASHABLE;
        });
    }
    /**
      Marks a set of fields as 'redacted'.
      @param {string} pathStringList - A string describing the set of fields.
    */
    setAsRedacted(pathStringList) {
        this.processPath(pathStringList, (item) => {
            item.attributes = (item.attributes & -29) | REDACTED;
        });
    }
    /**
      Marks a set of fields as 'masked'.
      @param {string} pathStringList - A string describing the set of fields.
    */
    setAsMasked(pathStringList) {
        this.processPath(pathStringList, (item) => {
            if (!(item.attributes & MASKABLE)) {
                throw "this item is not maskable";
            }
            if (item.attributes & FORMAT) {
                throw "the format of this item was already set";
            }
            item.attributes = (item.attributes & -29) | MASKED;
        });
    }
    /**
      Marks a set of fields as 'hashed'.
      @param {string} pathStringList - A string describing the set of fields.
    */
    setAsHashed(pathStringList) {
        this.processPath(pathStringList, (item) => {
            if (!(item.attributes & HASHABLE)) {
                throw "this item is not hashable";
            }
            if (item.attributes & FORMAT) {
                throw "the format of this item was already set";
            }
            item.attributes = (item.attributes & -29) | HASHED;
        });
    }
    /**
      Internal method to apply a callback function to each field included in a set of fields.
      @param {string} pathStringList - A string describing the set of fields.
      @param {function} callback - The callback function, which will receive the field item as argument.
    */
    processPath(pathStringList, callback) {
        const pathStrings = pathStringList.split(/, */);
        for (const pathString of pathStrings) {
            const res = PathManager.parsePrefix(pathString);
            if (res.prefix != "this") {
                throw `the path must start with 'this'`;
            }
            PathManager.processCallback(this.irObject, res.pathString, callback);
        }
    }
    /**
      Internal method to populate the channel identifiers from the primitive fields to their parents.
      Also loads the sorted list of all channels in the array this.usedChannels.
    */
    populateChannels() {
        this.traverseIrObject({
            onPrimitive: (item, context, insideArray, parents) => {
                for (let i = 0; i < parents.length - 1; i++) {
                    if (item.channelId === null) {
                        throw `field '${PathManager.fromParents(parents)}' is not assigned to any channel`;
                    }
                    (parents[i].channels = parents[i].channels || new Set).add(item.channelId);
                }
            }
        });
        this.usedChannels = [...this.irObject[0].channels].sort((a, b) => a - b);
        for (const channelId of this.usedChannels) {
            if (!this.channelDefinitions.has(channelId)) {
                throw `channel ${channelId} is undefined`;
            }
        }
    }
    /**
      Internal method to build a dictionary of field names for a given channel.
      @param {number} channel - The channel identifier.
    */
    buildDictionary(channelId) {
        const dictionary = new Map;
        // collect all names and count how many times they appear
        this.traverseIrObject({
            channelId: channelId,
            onObject: (item, context, insideArray, parents) => {
                if (parents.length > 1 && !insideArray) {
                    processItem(item);
                }
            },
            onArray: (item, context, insideArray, parents) => {
                if (!insideArray) {
                    processItem(item);
                }
            },
            onPrimitive: (item, context, insideArray, parents) => {
                if (!insideArray) {
                    processItem(item);
                }
            }
        });
        function processItem(item) {
            dictionary.set(item.name, dictionary.has(item.name) ? dictionary.get(item.name) + 1 : 1);
        }
        // turn that into a lookup sorted by use frequency in descending order
        const arr = [];
        for (const [key, count] of dictionary) {
            arr.push([count, key]);
        }
        const lookup = new Map([...arr.sort((a, b) => b[0] - a[0]).map((a, i) => [a[1], i])]);
        return [...lookup.keys()];
    }
    /**
      Internal method to serialize the primitive fields.
    */
    serializeFields() {
        this.traverseIrObject({
            onPrimitive: (item, context, insideArray, parents) => {
                const stream = new WriteStream();
                if (item.attributes & MASKABLE) {
                    stream.writeVarUint(item.visibleParts.length);
                    for (const str of item.visibleParts) {
                        stream.writeString(str);
                    }
                    item.visiblePartsBinary = stream.getByteStream();
                    if (!(item.attributes & MASKED)) {
                        stream.clear();
                        stream.writeVarUint(item.hiddenParts.length);
                        for (const str of item.hiddenParts) {
                            stream.writeString(str);
                        }
                        item.hiddenPartsBinary = stream.getByteStream();
                    }
                }
                else if (!(item.attributes & HASHED)) {
                    stream.writeJsonValue(item.type, item.value);
                    item.valueBinary = stream.getByteStream();
                }
            }
        });
    }
    // !! not used
    unserializeFields() {
        this.traverseIrObject({
            onPrimitive: (item) => {
                const stream = new ReadStream(item.valueBinary);
                item.value = stream.read(item.type);
            }
        });
    }
    /**
      Internal method to traverse the IR object and calling optional callbacks on each node.
      @param {object} options - An object containing the traversal options.
    */
    traverseIrObject(options) {
        processStructure(this.irObject, options.initialContext, false, []);
        function hasChannel(item, isPrimitive) {
            return (options.channelId === undefined || (isPrimitive ?
                item.channelId === options.channelId
                :
                    item.channels.has(options.channelId)));
        }
        function processNode(item, context, insideArray, parents) {
            const newParents = [...parents, item];
            if (item.type == TYPE_ARRAY) {
                if (hasChannel(item, false)) {
                    const newContext = options.onArray && options.onArray(item, context, insideArray, newParents);
                    processStructure(item.entries, newContext, true, newParents);
                }
            }
            else if (item.type == TYPE_OBJECT) {
                if (hasChannel(item, false)) {
                    const newContext = options.onObject && options.onObject(item, context, insideArray, newParents);
                    processStructure(item.properties, newContext, false, newParents);
                }
            }
            else {
                if (hasChannel(item, true)) {
                    options.onPrimitive && options.onPrimitive(item, context, insideArray, newParents);
                }
            }
        }
        function processStructure(list, context, insideArray, parents) {
            for (const item of list) {
                processNode(item, context, insideArray, parents);
            }
        }
    }
    /**
      Exports the IR object back to the core JSON-compatible object it describes.
    */
    exportToJson() {
        const object = {};
        this.traverseIrObject({
            initialContext: object,
            onArray: (item, context, insideArray) => {
                return context[insideArray ? item.index : item.name] = [];
            },
            onObject: (item, context, insideArray) => {
                return context[insideArray ? item.index : item.name] = {};
            },
            onPrimitive: (item, context, insideArray, parents) => {
                context[insideArray ? item.index : item.name] = item.value;
            }
        });
        return object.root;
    }
}

class ApplicationLedger {
    constructor({ provider }) {
        this.vb = new ApplicationLedgerVb({ provider });
        //this.publicKey = publicKey;
        //this.privateKey = privateKey;
        this.provider = provider;
        //this.signatureAlgorithmId = Crypto.SECP256K1;
        if (this.provider.isKeyed()) {
            const privateKey = this.provider.getPrivateSignatureKey();
            this.signatureAlgorithmId = privateKey.getSignatureAlgorithmId();
        }
    }
    _create(applicationId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.provider.isKeyed())
                throw 'Cannot create an application ledger without keyed provider.';
            yield this.vb.setSignatureAlgorithm({
                algorithmId: this.signatureAlgorithmId
            });
        });
    }
    _load(identifier) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.vb.load(identifier);
        });
    }
    _processJson(object) {
        return __awaiter(this, void 0, void 0, function* () {
            const validator = new SchemaValidator(RECORD_DESCRIPTION);
            validator.validate(object);
            // if there's a reference to an existing VB, load it
            if (object.virtualBlockchainId) {
                yield this.vb.load(object.virtualBlockchainId);
            }
            else {
                yield this.vb.setSignatureAlgorithm({
                    algorithmId: this.signatureAlgorithmId
                });
            }
            // add the new actors
            for (const def of object.actors || []) {
                yield this.vb.createActor({
                    id: this.vb.state.actors.length,
                    type: 0,
                    name: def.name
                });
            }
            // get the author ID
            const authorId = this.vb.getActorId(object.author);
            // get the endorser ID
            object.endorser && this.vb.getActorId(object.endorser);
            // add the new channels
            for (const def of object.channels || []) {
                yield this.vb.createChannel({
                    id: this.vb.state.channels.length,
                    isPrivate: !def.isPublic,
                    keyOwnerId: authorId,
                    name: def.name
                });
            }
            // initialize an IR object, load the data and set the channels
            const ir = new IntermediateRepresentation;
            ir.buildFromJson(object.data);
            for (let channelId = 0; channelId < this.vb.state.channels.length; channelId++) {
                const channel = this.vb.state.channels[channelId];
                if (channel.isPrivate) {
                    ir.addPrivateChannel(channelId);
                }
                else {
                    ir.addPublicChannel(channelId);
                }
            }
            // process field assignations
            for (const def of object.fieldAssignations || []) {
                const channelId = this.vb.getChannelId(def.channelName);
                ir.setChannel(def.fieldPath, channelId);
            }
            // process actor assignations
            for (const def of object.actorAssignations || []) {
                this.vb.getChannelId(def.channelName); this.vb.getActorId(def.actorName);
            }
            // process hashable fields
            for (const def of object.hashableFields || []) {
                ir.setAsHashable(def.fieldPath);
            }
            // process maskable fields
            for (const def of object.maskableFields || []) {
                const list = def.maskedParts.map((obj) => [obj.position, obj.position + obj.length, obj.replacementString]);
                ir.setAsMaskable(def.fieldPath, list);
            }
            // process channel data
            ir.serializeFields();
            ir.populateChannels();
            const channelDataList = ir.exportToSectionFormat();
            for (const channelData of channelDataList) {
                if (channelData.isPrivate) {
                    const channelKey = new Uint8Array(32), // !!
                    iv = new Uint8Array(32), // !!
                    encryptedData = Crypto.Aes.encryptGcm(channelKey, channelData.data, iv);
                    yield this.vb.addPrivateChannelData({
                        channelId: channelData.channelId,
                        merkleRootHash: Utils.binaryFromHexa(channelData.merkleRootHash),
                        encryptedData: encryptedData
                    });
                }
                else {
                    yield this.vb.addPublicChannelData({
                        channelId: channelData.channelId,
                        data: channelData.data
                    });
                }
            }
            console.log(this.vb);
        });
    }
    publishUpdates() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.provider.isKeyed())
                throw 'Cannot publish updates without keyed provider.';
            const privateKey = this.provider.getPrivateSignatureKey();
            yield this.vb.signAsAuthor(privateKey);
            return yield this.vb.publish();
        });
    }
}

class Blockchain {
    constructor(provider) {
        this.provider = provider;
    }
    getExplorer() {
        return new Explorer({ provider: this.provider });
    }
    getMicroblockImporter(data) {
        return new MicroblockImporter({ data, provider: this.provider });
    }
    /**
     * Should be used with a keyed provider.
     *
     *
     * @returns {Promise<Account>}
     */
    createGenesisAccount() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.provider.isKeyed())
                throw 'Cannot create a genesis account without a keyed provider.';
            const account = new Account({ provider: this.provider });
            yield account._createGenesis();
            return account;
        });
    }
    /**
     * Should be used with a keyed provider.
     *
     * @param {Uint8Array} sellerAccount
     * @param {PublicSignatureKey} buyerPublicKey
     * @param {number} amount
     * @returns {Promise<Account>}
     */
    createAccount(sellerAccount, buyerPublicKey, amount) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.provider.isKeyed())
                throw 'Cannot create an account without a keyed provider.';
            const account = new Account({ provider: this.provider });
            yield account._create(sellerAccount, buyerPublicKey, amount);
            return account;
        });
    }
    /**
     * Can be used with a keyed provider.
     *
     * @param identifier
     * @returns {Promise<Account>}
     */
    loadAccount(identifier) {
        return __awaiter(this, void 0, void 0, function* () {
            const account = new Account({ provider: this.provider });
            yield account._load(identifier);
            return account;
        });
    }
    /**
     * Should be used with a keyed provider.
     *
     * @returns {Promise<Organization>}
     */
    createOrganization() {
        return __awaiter(this, void 0, void 0, function* () {
            const organization = new Organization({ provider: this.provider });
            yield organization._create();
            return organization;
        });
    }
    /**
     * Can be used with a keyed provider.
     *
     * @param identifier
     * @returns {Promise<Organization>}
     */
    loadOrganization(identifier) {
        return __awaiter(this, void 0, void 0, function* () {
            const organization = new Organization({ provider: this.provider });
            yield organization._load(identifier);
            return organization;
        });
    }
    /**
     * Should be used with a keyed provider.
     *
     * @param keyPair
     * @returns {Promise<Application>}
     */
    createApplication(keyPair) {
        return __awaiter(this, void 0, void 0, function* () {
            const application = new Application(Object.assign(Object.assign({}, keyPair), { provider: this.provider }));
            yield application._create();
            return application;
        });
    }
    /**
     * Can be used with a keyed provider.
     *
     * @param identifier
     * @returns {Promise<Application>}
     */
    loadApplication(identifier) {
        return __awaiter(this, void 0, void 0, function* () {
            const application = new Application({ provider: this.provider });
            yield application._load(identifier);
            return application;
        });
    }
    /**
     * Should be used with a keyed provider.
     *
     * @param object
     * @returns {Promise<ApplicationLedger>}
     */
    getApplicationLedgerFromJson(object) {
        return __awaiter(this, void 0, void 0, function* () {
            const applicationLedger = new ApplicationLedger({ provider: this.provider });
            yield applicationLedger._processJson(object);
            return applicationLedger;
        });
    }
    /**
     * Should be used with a keyed provider.
     *
     * @returns {Promise<ApplicationLedger>}
     */
    createApplicationLedger() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.provider.isKeyed())
                throw 'Cannot create application ledger without a keyed provider.';
            const applicationLedger = new ApplicationLedger({ provider: this.provider });
            yield applicationLedger._create();
            return applicationLedger;
        });
    }
    /**
     * Can be used with a keyed provider.
     *
     * @param identifier
     * @returns {Promise<ApplicationLedger>}
     */
    loadApplicationLedger(identifier) {
        return __awaiter(this, void 0, void 0, function* () {
            const applicationLedger = new ApplicationLedger({ provider: this.provider });
            yield applicationLedger._load(identifier);
            return applicationLedger;
        });
    }
}

var blockchain = /*#__PURE__*/Object.freeze({
    __proto__: null,
    Blockchain: Blockchain
});

class MessageSerializer {
    /**
      Constructor
      @param {Array} collection - Message collection
    */
    constructor(collection) {
        this.collection = collection;
    }
    /**
      Serializes the given message.
      @param {number} type - Message type
      @param {object} object - The message object to be serialized
    */
    serialize(type, object) {
        const schema = [
            { name: "__msgType", type: TYPE_UINT8 },
            ...this.collection[type]
        ];
        const serializer = new SchemaSerializer(schema);
        const data$1 = serializer.serialize(Object.assign({ __msgType: type }, object));
        return data$1;
    }
}
class MessageUnserializer {
    /**
      Constructor
      @param {Array} collection - Message collection
    */
    constructor(collection) {
        this.collection = collection;
    }
    /**
      Unserializes the given message byte stream.
      @param {Uint8Array} stream - The serialized byte stream
    */
    unserialize(stream) {
        const type = stream[0];
        const schema = [
            { name: "__msgType", type: TYPE_UINT8 },
            ...this.collection[type]
        ];
        const unserializer = new SchemaUnserializer(schema);
        const object = unserializer.unserialize(stream);
        delete object.__msgType;
        return { type, object };
    }
}

var messageSerializer = /*#__PURE__*/Object.freeze({
    __proto__: null,
    MessageSerializer: MessageSerializer,
    MessageUnserializer: MessageUnserializer
});

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const BASE64 = ALPHA + "+/=";
const URL = ALPHA + "-_=";
const Base64 = {
    BASE64,
    URL,
    encodeString,
    decodeString,
    encodeBinary,
    decodeBinary
};
function encodeString(str, alphabet = BASE64, padding = false) {
    return encodeBinary(Utf8Encoder.encode(str), alphabet, padding);
}
function decodeString(str, alphabet = BASE64) {
    return Utf8Encoder.decode(decodeBinary(str, alphabet));
}
function encodeBinary(bin, alphabet = BASE64, padding = false) {
    let r = bin.length % 3, acc = 0, out = "";
    for (let i = 0; i < bin.length || i % 3;) {
        acc = acc << 8 | bin[i++];
        if (!(i % 3)) {
            for (let j = 4; j--;) {
                out += alphabet[acc >> j * 6 & 0x3F];
            }
            acc = 0;
        }
    }
    return r ? out.slice(0, r - 3) + alphabet[0x40].repeat(padding ? 3 - r : 0) : out;
}
function decodeBinary(str, alphabet = BASE64) {
    let crop = 0, acc = 0, out = [];
    str += alphabet[0x40].repeat(-str.length & 3);
    for (let i = 0; i < str.length;) {
        let n = alphabet.indexOf(str[i++]);
        crop += n == 0x40;
        acc = acc << 6 | n;
        if (!(i & 3)) {
            out.push(acc >> 16 & 0xFF, acc >> 8 & 0xFF, acc & 0xFF);
        }
    }
    return new Uint8Array(crop ? out.slice(0, -crop) : out);
}

var base64 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    Base64: Base64
});

const CACHE_HORIZON = 2;
const HASH_SIZE = 32;
const ROOT_ANCHORING_HASH = new Uint8Array(HASH_SIZE);
const RADIX_CST = {
    CACHE_HORIZON,
    HASH_SIZE,
    ROOT_ANCHORING_HASH
};

/**
  Three different components are used to store the tree:
    - the database, where everything is eventually stored
    - cache: in-memory storage for the first few levels of the tree
    - batch: keeps track of updates that were performed in the current batch but are not yet committed to the DB
*/
class RadixStorage {
    constructor(database, subId) {
        this.cache = new Map();
        this.batch = new Map();
        this.database = database;
        this.subId = subId;
    }
    get(depth, hash) {
        return __awaiter(this, void 0, void 0, function* () {
            const hashString = Utils.binaryToHexa(hash);
            let value = this.cache.get(hashString);
            if (value === undefined) {
                // the value was not found in the cache: get it from the DB and update the cache if we're within the cache horizon
                value = yield this.database.getRaw(this.subId, hash);
                if (value !== undefined && depth <= RADIX_CST.CACHE_HORIZON) {
                    this.cache.set(hashString, value);
                }
            }
            if (value === undefined || value === null) {
                if (hash.some((v) => v)) {
                    console.log(value);
                    throw `failed to get hash ${hashString} from storage`;
                }
                else {
                    value = RADIX_CST.ROOT_ANCHORING_HASH;
                }
            }
            return value;
        });
    }
    set(depth, hash, value) {
        const hashString = Utils.binaryToHexa(hash);
        // update the cache
        this.cache.set(hashString, value);
        // update the batch
        if (value === null && this.batch.get(hashString) !== undefined) {
            // the entry is to be deleted and was set during the current batch: discard it entirely
            //console.log('batch delete', hashString);
            this.batch.delete(hashString);
        }
        else {
            //console.log('batch set', hashString, value === null ? 'null' : 'value');
            this.batch.set(hashString, value);
        }
    }
    /**
      a removed item is set to null so that we know that it must be actually deleted when flush() is called
    */
    remove(depth, hash) {
        this.set(depth, hash, null);
    }
    getRootHash() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.get(-1, RADIX_CST.ROOT_ANCHORING_HASH);
        });
    }
    setRootHash(rootHash) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.set(-1, RADIX_CST.ROOT_ANCHORING_HASH, rootHash);
        });
    }
    flush() {
        return __awaiter(this, void 0, void 0, function* () {
            //console.log('flush', batch);
            const dbBatch = this.database.getBatch();
            const deleteList = [];
            const putList = [];
            for (const [hashString, value] of this.batch) {
                const key = Utils.binaryFromHexa(hashString);
                if (value === null) {
                    deleteList.push(key);
                }
                else {
                    putList.push([key, value]);
                }
            }
            this.resetBatch();
            const rootHash = yield this.getRootHash();
            dbBatch.del(this.subId, deleteList);
            dbBatch.put(this.subId, putList);
            yield dbBatch.write();
            // TODO: clear the cache beyond the horizon
            return rootHash;
        });
    }
    rollback() {
        return __awaiter(this, void 0, void 0, function* () {
            // for each key defined in the batch, delete the corresponding cache entry to force it to be reloaded from the DB
            for (const [hashString, value] of this.batch) {
                this.cache.delete(hashString);
            }
            this.resetBatch();
        });
    }
    resetBatch() {
        this.batch = new Map();
    }
}

/**
  Radix tree

  This structure is used to:
  - store the hash of the last state of each virtual blockchain, given the hash of the genesis block as the key
  - store the hash of the state of each account (from DB_ACCOUNT_STATE), given the hash of the account virtual blockchain as
    the key

  The key hash is split into nibbles. So, each node may have up to 16 children. Each node in the tree is identified by its
  hash. We use an 'early leaf node' when there's only one remaining path.

  Standard node:
    BITMASK (2 bytes) : non-zero bit-mask of active child nodes
    for each active child (from LSB to MSB):
      HASH (32 bytes) : hash of child node, or target value if this is the deepest level (*)
    end

  Early leaf node:
    BITMASK (2 bytes)       : set to 0x0000
    TRAILING_PATH (N bytes) : the remaining nibbles in the path, packed in the nearest number of bytes
    VALUE (32 bytes)        : target value

  (*) Although this case is supported, it will never happen in practice. (For it would mean that we have two hashes that are
      identical up to the penultimate nibble, which is almost as unlikely as a full hash collision.)
*/
class RadixTree {
    constructor(database, subId) {
        this.database = database;
        this.subId = subId;
        this.storage = new RadixStorage(database, subId);
    }
    /**
      Sets a (key, value) pair
    */
    set(key, value) {
        return __awaiter(this, void 0, void 0, function* () {
            const rootHash = yield this.storage.getRootHash();
            const newRootHash = yield this.write(key, value, rootHash, 0);
            yield this.storage.setRootHash(newRootHash);
        });
    }
    /**
      Given a key, returns the corresponding value.*
    */
    get(key) {
        return __awaiter(this, void 0, void 0, function* () {
            const rootHash = yield this.storage.getRootHash();
            const proof = [];
            const value = yield this.read(key, rootHash, 0, proof);
            return { value, proof };
        });
    }
    /**
      Cancels all updates defined in the batch.
    */
    rollback() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.storage.rollback();
        });
    }
    /**
      Returns the root hash of the tree.
    */
    getRootHash() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.storage.getRootHash();
        });
    }
    /**
      Commits the current batch to the database and returns the root hash.
    */
    flush() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.storage.flush();
        });
    }
    /**
      Debugging method.
    */
    getEntries() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, e_1, _b, _c;
            function hexa(a) {
                return a.map((v) => v.toString(16).toUpperCase().padStart(2, 0)).join('');
            }
            const iterator = this.database.query(this.subId);
            const list = [];
            try {
                for (var _d = true, iterator_1 = __asyncValues(iterator), iterator_1_1; iterator_1_1 = yield iterator_1.next(), _a = iterator_1_1.done, !_a; _d = true) {
                    _c = iterator_1_1.value;
                    _d = false;
                    const e = _c;
                    const msk = e[1][0] << 8 | e[1][1];
                    list.push(hexa([...e[0]]) + ": " + (e[0].some((v) => v) ?
                        msk.toString(2).padStart(16, 0) + " " + (msk ?
                            hexa([...e[1]].slice(2)).match(RegExp(`.{${RADIX_CST.HASH_SIZE * 2}}`, 'g')).join(' ')
                            :
                                hexa([...e[1]].slice(2)).replace(RegExp(`(.*)(.{${RADIX_CST.HASH_SIZE * 2}})$`), "$1 $2"))
                        :
                            hexa([...e[1]])));
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = iterator_1.return)) yield _b.call(iterator_1);
                }
                finally { if (e_1) throw e_1.error; }
            }
            return list;
        });
    }
    write(key, value, nodeHash, depth) {
        return __awaiter(this, void 0, void 0, function* () {
            if (depth == RADIX_CST.HASH_SIZE * 2) {
                return value;
            }
            let node = nodeHash && (yield this.storage.get(depth, nodeHash));
            const len = RADIX_CST.HASH_SIZE * 2 + 1 - depth >> 1;
            //console.log('node', nodeHash && debug(nodeHash));
            if (node) {
                //console.log('node exists');
                // the node already exists
                let msk = node[0] << 8 | node[1];
                let nibble = key[depth >> 1] >> 4 * (depth & 1) & 0xF;
                let update = 0;
                let hashList;
                if (msk) {
                    //console.log('already standard');
                    // this is already a standard node --> get the list of hashes of child nodes and update the node
                    hashList = this.constructor.getHashList(msk, node);
                    update = 1;
                }
                else {
                    // this is an early leaf node --> test whether this is the same key
                    if (this.constructor.keyDifference(depth, key, node)) {
                        //console.log('early leaf / different key');
                        // this is not the same key --> turn this node into a standard node with a single child and update the node
                        const prevKey = new Uint8Array(RADIX_CST.HASH_SIZE);
                        const prevValue = node.slice(2 + len, 2 + RADIX_CST.HASH_SIZE + len);
                        const index = node[2] >> 4 * (depth & 1) & 0xF;
                        prevKey.set(node.slice(2, 2 + len), RADIX_CST.HASH_SIZE - len);
                        hashList = Array(16).fill(null);
                        hashList[index] = yield this.write(prevKey, prevValue, null, depth + 1);
                        msk = 1 << index;
                        update = 1;
                    }
                    else {
                        //console.log('early leaf / same key');
                        // this is the same key --> just update the target hash
                        node.set(value, 2 + len);
                    }
                }
                if (update) {
                    // the node is now guaranteed to be a standard one and an update is required
                    hashList[nibble] = yield this.write(key, value, hashList[nibble], depth + 1);
                    const nHash = hashList.reduce((p, c) => p + (c != null), 0);
                    node = new Uint8Array(2 + RADIX_CST.HASH_SIZE * nHash);
                    msk |= 1 << nibble;
                    node[0] = msk >> 8;
                    node[1] = msk;
                    let ptr = 2;
                    for (let i = 0; i < 16; i++) {
                        if (msk & 1 << i) {
                            node.set(hashList[i], ptr);
                            ptr += RADIX_CST.HASH_SIZE;
                        }
                    }
                }
            }
            else {
                //console.log('node does not exist -> new early leaf');
                // the node does not exist --> create an early leaf node
                node = new Uint8Array(2 + RADIX_CST.HASH_SIZE + len);
                node.set(key.slice(depth >> 1), 2);
                if (depth & 1) {
                    // odd depth --> because we may get an exact copy of a previous early leaf node that was just turned into a standard
                    // node at depth - 1, we XOR the unused nibble in the key with 0xF to make sure that we'll get a different hash
                    node[2] ^= 0xF;
                }
                node.set(value, 2 + len);
            }
            // remove the previous entry / save the new one
            if (nodeHash) {
                this.storage.remove(depth, nodeHash);
            }
            const newHash = (Crypto.Hashes.sha256AsBinary(node)).slice(0, RADIX_CST.HASH_SIZE);
            //console.log('hash', debug(newHash), debug(node));
            this.storage.set(depth, newHash, node);
            return newHash;
        });
    }
    read(key, nodeHash, depth, proof) {
        return __awaiter(this, void 0, void 0, function* () {
            if (depth == RADIX_CST.HASH_SIZE * 2) {
                return nodeHash;
            }
            const node = nodeHash && (yield this.storage.get(depth, nodeHash));
            if (!node) {
                throw `missing node in radix tree`;
            }
            proof.push(node);
            const msk = node[0] << 8 | node[1];
            if (msk) {
                const hashList = this.constructor.getHashList(msk, node);
                const nibble = key[depth >> 1] >> 4 * (depth & 1) & 0xF;
                return msk & 1 << nibble ? yield this.read(key, hashList[nibble], depth + 1, proof) : false;
            }
            if (this.constructor.keyDifference(depth, key, node)) {
                return false;
            }
            const len = RADIX_CST.HASH_SIZE * 2 + 1 - depth >> 1;
            return node.slice(2 + len);
        });
    }
    static verifyProof(key, value, proof) {
        return __awaiter(this, void 0, void 0, function* () {
            return (yield this.verify(key, value, proof, null, 0)) && Crypto.Hashes.sha256AsBinary(proof[0]);
        });
    }
    static verify(key, value, proof, nodeHash, depth) {
        return __awaiter(this, void 0, void 0, function* () {
            if (depth == RADIX_CST.HASH_SIZE * 2) {
                return Utils.binaryIsEqual(nodeHash, value);
            }
            const node = proof[depth];
            if (depth && !Utils.binaryIsEqual(Crypto.Hashes.sha256AsBinary(node), nodeHash)) {
                return false;
            }
            const msk = node[0] << 8 | node[1];
            if (msk) {
                const hashList = this.getHashList(msk, node);
                const nibble = key[depth >> 1] >> 4 * (depth & 1) & 0xF;
                return msk & 1 << nibble ? yield this.verify(key, value, proof, hashList[nibble], depth + 1) : value === false;
            }
            if (this.keyDifference(depth, key, node)) {
                return value === false;
            }
            const len = RADIX_CST.HASH_SIZE * 2 + 1 - depth >> 1;
            return Utils.binaryIsEqual(node.slice(2 + len), value);
        });
    }
    /**
      Tests whether the trailing key stored in an early leaf node is different from the key that's being processed.
    */
    static keyDifference(depth, key, node) {
        for (let n = depth; n < RADIX_CST.HASH_SIZE * 2; n++) {
            if ((key[n >> 1] ^ node[2 + (n >> 1) - (depth >> 1)]) >> 4 * (n & 1) & 0xF) {
                return 1;
            }
        }
        return 0;
    }
    /**
      Extracts all hashes stored in a standard node and return them as a list. Empty slots are filled with null.
    */
    static getHashList(msk, node) {
        const hashList = [];
        let ptr = 2;
        for (let i = 0; i < 16; i++) {
            hashList.push(msk & 1 << i ? node.slice(ptr, ptr += RADIX_CST.HASH_SIZE) : null);
        }
        return hashList;
    }
}

var radixTree = /*#__PURE__*/Object.freeze({
    __proto__: null,
    RadixTree: RadixTree
});

class MemoryProvider {
    constructor() {
        this.microblockInformationStore = new Map;
        this.microblockBodyStore = new Map;
        this.virtualBlockchainStateStore = new Map;
    }
    clear() {
        this.microblockInformationStore = new Map;
        this.microblockBodyStore = new Map;
        this.virtualBlockchainStateStore = new Map;
    }
    getMicroblockInformation(identifier) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.constructor.get(this.microblockInformationStore, identifier);
        });
    }
    getMicroblockBody(identifier) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.constructor.get(this.microblockBodyStore, identifier);
        });
    }
    getVirtualBlockchainState(identifier) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.constructor.get(this.virtualBlockchainStateStore, identifier);
        });
    }
    setMicroblockInformation(identifier, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.constructor.set(this.microblockInformationStore, identifier, data);
        });
    }
    setMicroblockBody(identifier, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.constructor.set(this.microblockBodyStore, identifier, data);
        });
    }
    setVirtualBlockchainState(identifier, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.constructor.set(this.virtualBlockchainStateStore, identifier, data);
        });
    }
    static get(store, identifier) {
        return __awaiter(this, void 0, void 0, function* () {
            const key = Utils.binaryToHexa(identifier);
            if (!store.has(key)) {
                return null;
            }
            return store.get(key);
        });
    }
    static set(store, identifier, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const key = Utils.binaryToHexa(identifier);
            store.set(key, data);
        });
    }
}

var memoryProvider = /*#__PURE__*/Object.freeze({
    __proto__: null,
    MemoryProvider: MemoryProvider
});

/**
  This is the dummy external provider for nodes.
*/
class NullNetworkProvider {
    constructor() {
    }
    getMicroblockInformation() {
        return __awaiter(this, void 0, void 0, function* () {
            return null;
        });
    }
    getMicroblockBodys() {
        return __awaiter(this, void 0, void 0, function* () {
            return null;
        });
    }
    getVirtualBlockchainUpdate() {
        return __awaiter(this, void 0, void 0, function* () {
            return { changed: false };
        });
    }
}

var nullNetworkProvider = /*#__PURE__*/Object.freeze({
    __proto__: null,
    NullNetworkProvider: NullNetworkProvider
});

let requests = [], qrIdentifiers = new Map(), walletSocketRequests = new Map();
class wiServer {
    constructor(ioServer) {
        ioServer.on("connection", this.onConnect);
    }
    onConnect(socket) {
        socket.on("data", onData);
        socket.on("disconnect", _ => {
        });
        function onData(message) {
            let binary = Base64.decodeBinary(message, Base64.BASE64), [id, object] = schemaSerializer.decodeMessage(binary, WI_MESSAGES);
            switch (id) {
                case WIMSG_REQUEST: {
                    // the client has sent a request
                    // --> send it a first QR code
                    let requestId = requests.push({
                        type: object.requestType,
                        request: object.request,
                        clientSocket: socket
                    }) - 1;
                    refreshQrCode(requestId);
                    break;
                }
                case WIMSG_CONNECTION_ACCEPTED: {
                    // the wallet has accepted the connection
                    // --> associate the wallet socket with the request
                    // --> send the client request to the wallet
                    let requestId = qrIdentifiers.get(hexToBytes(object.qrId));
                    let request = requests[requestId];
                    walletSocketRequests.set(socket.id, requestId);
                    sendMessage(socket, WIMSG_FORWARDED_REQUEST, { requestType: request.type, request: request.request });
                    break;
                }
                case WIMSG_ANSWER: {
                    // the wallet has sent an answer
                    // --> forward it to the client
                    let requestId = walletSocketRequests.get(socket.id);
                    let request = requests[requestId];
                    sendMessage(request.clientSocket, WIMSG_FORWARDED_ANSWER, object);
                    break;
                }
            }
        }
        function refreshQrCode(requestId) {
            let timestamp = getCarmentisTimestamp(), qrId = randomBytes(32);
            qrIdentifiers.set(bytesToHex(qrId), requestId);
            sendMessage(socket, WIMSG_UPDATE_QR, { qrId: qrId, timestamp: timestamp });
        }
        function sendMessage(socket, msgId, object = {}) {
            const serializer = new MessageSerializer(WI_MESSAGES);
            let binary = serializer.serialize(msgId, object), b64 = Base64.encodeBinary(binary, Base64.BASE64);
            socket.emit("data", b64);
        }
        function getCarmentisTimestamp() {
            return Math.floor(Date.now() / 1000);
        }
    }
}

export { base64, blockchain, constants, crypto, memoryProvider, messageSerializer, nullNetworkProvider, provider, radixTree, schemaSerializer$1 as schemaSerializer, utils, wiServer };
//# sourceMappingURL=index.mjs.map
