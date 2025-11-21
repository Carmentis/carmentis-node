import { FileIdentifier } from '../types/FileIdentifier';

export interface IStorage {
    //writeMicroblock(expirationDay: number, txId: number): Promise<boolean>;
    readFullMicroblock(hash: Uint8Array): Promise<Uint8Array>;
    readMicroblockHeader(hash: Uint8Array): Promise<Uint8Array>;
    readMicroblockBody(hash: Uint8Array): Promise<Uint8Array>;
}