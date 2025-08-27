export interface DbInterface {
    getTableCount(): number;
    getRaw(tableId: number, key: Uint8Array): Promise<Uint8Array>;
    getObject(tableId: number, key: Uint8Array): Promise<any>;
    putRaw(tableId: number, key: Uint8Array, data: Uint8Array): Promise<boolean>;
    putObject(tableId: number, key: Uint8Array, object: any): Promise<boolean>;
    getKeys(tableId: number): Promise<Uint8Array[]>;
    query(tableId: number, query?: any): Promise<any>;
    del(tableId: number, key: Uint8Array): Promise<boolean>;
    serialize(tableId: number, object: any): Uint8Array;
    unserialize(tableId: number, data: Uint8Array): any;
}
