export declare class NodeCore {
    constructor(options: { dbPath: string });

    checkTx(request: { tx: any }): Promise<{ success: boolean; error?: string }>;
    prepareProposal(request: { txs: any[] }): Promise<any[]>;
    processProposal(request: any): Promise<number>;
    finalizeBlock(request: { txs: any[] }): Promise<{ txResults: any[]; appHash: Uint8Array }>;
    commit(): Promise<void>;
    query(data: Uint8Array): Promise<Uint8Array>;

    static decodeQueryField(urlObject: any, fieldName: string): Uint8Array;
    static encodeResponse(response: any): string;
}
