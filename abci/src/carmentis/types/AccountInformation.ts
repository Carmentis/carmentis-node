export type AccountInformation = {
    type: number;
    exists: boolean;
    state: { height: number; balance: number; lastHistoryHash: Uint8Array };
};
