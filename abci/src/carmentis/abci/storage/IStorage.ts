import { FileIdentifier } from '../types/FileIdentifier';

export interface IStorage {
    //writeMicroblock(expirationDay: number, txId: number): Promise<boolean>;
    readFullMicroblock(hash: Uint8Array): Promise<Uint8Array>;
    readSerializedMicroblockHeader(hash: Uint8Array): Promise<Uint8Array>;
    readSerializedMicroblockBody(hash: Uint8Array): Promise<Uint8Array>;
}