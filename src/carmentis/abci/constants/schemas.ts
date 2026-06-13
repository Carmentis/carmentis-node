import { DATA, ECO, SCHEMAS } from '@cmts-dev/carmentis-sdk-core';

// chain information
// key: "CHAIN_INFORMATION" (unique)
// this always contains a single record
export const DB_CHAIN_INFORMATION_KEY = new Uint8Array(Buffer.from('CHAIN_INFORMATION'));

// ============================================================================================================================ //
//  Account history references (chainReference field in DB_ACCOUNT_HISTORY)                                                     //
// ============================================================================================================================ //
// reference to a block (for earned fees)
const ACCOUNT_BLOCK_REFERENCE = {
    label: 'AccountBlockReference',
    definition: [
        { name: 'height', type: DATA.TYPE_UINT48 }
    ]
};

// reference to a microblock (for paid fees)
const ACCOUNT_MB_REFERENCE = {
    label: 'AccountMbReference',
    definition: [
        { name: 'mbHash', type: DATA.TYPE_BIN256 }
    ]
};

// reference to a microblock section (for token transfers)
const ACCOUNT_SECTION_REFERENCE = {
    label: 'AccountSectionReference',
    definition: [
        { name: 'mbHash', type: DATA.TYPE_BIN256 },
        { name: 'sectionIndex', type: DATA.TYPE_UINT16 },
    ]
};

export const ACCOUNT_REF_SCHEMAS: SCHEMAS.Schema[] = [];

ACCOUNT_REF_SCHEMAS[ECO.BK_REF_BLOCK] = ACCOUNT_BLOCK_REFERENCE;
ACCOUNT_REF_SCHEMAS[ECO.BK_REF_MICROBLOCK] = ACCOUNT_MB_REFERENCE;
ACCOUNT_REF_SCHEMAS[ECO.BK_REF_SECTION] = ACCOUNT_SECTION_REFERENCE;
