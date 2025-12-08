import { Lock } from '@cmts-dev/carmentis-sdk/server';

export type AccountState = {
    height: number;
    balance: number;
    lastHistoryHash: Uint8Array,
    locks: Lock[]
};

export type AccountInformation = {
    type: number;
    exists: boolean;
    state: AccountState;
};
