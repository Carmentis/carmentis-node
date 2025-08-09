import fs from 'node:fs';
import { FileHandle, access, mkdir, open, rm } from 'node:fs/promises';
import path from 'path';

import {
    SCHEMAS,
    Crypto,
    Utils,
} from '@cmts-dev/carmentis-sdk/server';

const META_DATA_SIZE = 6;

const READ_FULL = 0;
const READ_HEADER = 1;
const READ_BODY = 2;

export class Storage {
    path: string;
    txs: Uint8Array[];
    cache: Map<string, any>;

    constructor(path: string, txs: Uint8Array[]) {
        this.path = path;
        this.txs = txs;
        this.cache = new Map;
    }

    async clear() {
        await rm(this.path, { recursive: true, force: true });
    }

    async writeMicroblock(expirationDay: number, txId: number): Promise<number> {
        const content = this.txs[txId];
        const identifier = Crypto.Hashes.sha256AsBinary(content.slice(0, SCHEMAS.MICROBLOCK_HEADER_SIZE));
        const filePath = this.getFilePath(expirationDay, identifier);
        const key = path.basename(filePath);
        let fileOffset;
        let cacheObject;

        if(this.cache.has(key)) {
            cacheObject = this.cache.get(key);
            fileOffset = cacheObject.fileOffset;
        }
        else {
            let handle;

            try {
                handle = await open(filePath, 'r');
                const stats = await handle.stat();
                fileOffset = stats.size;
                await handle.close();
            }
            catch(error) {
                fileOffset = 0;
            }

            cacheObject = {
                filePath,
                fileOffset,
                txIds: []
            };

            this.cache.set(key, cacheObject);
        }

        cacheObject.txIds.push(txId);
        cacheObject.fileOffset += META_DATA_SIZE + content.length;

        return fileOffset;
    }

    async commit() {
        for(const [ key, cacheObject ] of this.cache) {
            const directoryPath = path.dirname(cacheObject.filePath);

            try {
                await access(directoryPath, fs.constants.F_OK);
            }
            catch(error) {
                await mkdir(directoryPath, { recursive: true });
            }

            let handle;

            try {
                handle = await open(cacheObject.filePath, 'a+');

                for(const txId of cacheObject.txIds) {
                    const content = this.txs[txId];
                    const meta = new Uint8Array(
                        [ 40, 32, 24, 16, 8, 0 ].map((n) => content.length / 2 ** n & 0xFF)
                    );

                    await handle.write(meta);
                    await handle.write(content);
                }
                await handle.close();
            }
            catch(error) {
                console.error(error);
            }
        }
    }

    async readFullMicroblock(expirationDay: number, identifier: Uint8Array, fileOffset: number) {
        return await this.readMicroblock(expirationDay, identifier, fileOffset, READ_FULL);
    }

    async readMicroblockHeader(expirationDay: number, identifier: Uint8Array, fileOffset: number) {
        return await this.readMicroblock(expirationDay, identifier, fileOffset, READ_HEADER);
    }

    async readMicroblockBody(expirationDay: number, identifier: Uint8Array, fileOffset: number) {
        return await this.readMicroblock(expirationDay, identifier, fileOffset, READ_BODY);
    }

    private async readMicroblock(expirationDay: number, identifier: Uint8Array, fileOffset: number, partType: number) {
        const filePath = this.getFilePath(expirationDay, identifier);
        let dataBuffer;
        let handle;

        try {
            handle = await open(filePath, 'r');
            dataBuffer = await this.readMicroblockPart(handle, fileOffset, partType);
            await handle.close();
        }
        catch(error) {
            console.error(error);
            dataBuffer = new Uint8Array();
        }

        return dataBuffer;
    }

    private async readMicroblockPart(handle: FileHandle, fileOffset: number, partType: number) {
        let rd;

        const metaBuffer = new Uint8Array(META_DATA_SIZE);
        rd = await handle.read(metaBuffer, 0, META_DATA_SIZE, fileOffset);

        if(rd.bytesRead != META_DATA_SIZE) {
            throw `encountered end of file while reading microblock meta data`;
        }

        const size = [...metaBuffer].reduce((sz, b) => sz * 0x100 + b, 0);

        const [ extraOffset, targetSize ] = [
            [ 0, size ],
            [ 0, SCHEMAS.MICROBLOCK_HEADER_SIZE ],
            [ SCHEMAS.MICROBLOCK_HEADER_SIZE, size - SCHEMAS.MICROBLOCK_HEADER_SIZE ]
        ][partType];

        const dataBuffer = new Uint8Array(targetSize);
        rd = await handle.read(dataBuffer, 0, targetSize, fileOffset + META_DATA_SIZE + extraOffset);

        if(rd.bytesRead != targetSize) {
            throw `encountered end of file while reading microblock data`;
        }

        return dataBuffer;
    }

    createChallenge(seed: Uint8Array) {
    }

    async processChallenge(seed: Uint8Array) {
    }

    private getFilePath(expirationDay: number, identifier: Uint8Array) {
        let filePath;

        if(expirationDay) {
            const date = Utils.dayToDate(expirationDay);
            const dayStr = date.getDate().toString().padStart(2, "0");
            const monthStr = (date.getMonth() + 1).toString().padStart(2, "0");
            const yearStr = date.getFullYear().toString();

            filePath = path.join(this.path, yearStr, yearStr + monthStr + dayStr + ".bin");
        }
        else {
            const bucketStr = identifier[0].toString(16).padStart(2, "0");

            filePath = path.join(this.path, "endless", bucketStr + ".bin");
        }

        return filePath;
    }
}
