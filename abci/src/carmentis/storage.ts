import fs from 'node:fs';
import { FileHandle, access, mkdir, open, rm } from 'node:fs/promises';
import path from 'path';
import { dbInterface } from './dbInterface';
import { NODE_SCHEMAS } from './constants/constants';

import {
    SCHEMAS,
    Crypto,
    Utils,
} from '@cmts-dev/carmentis-sdk/server';

const ENDLESS_DIRECTORY_NAME = "endless";

const READ_FULL = 0;
const READ_HEADER = 1;
const READ_BODY = 2;

export class Storage {
    db: dbInterface;
    path: string;
    txs: Uint8Array[];
    cache: Map<number, any>;

    constructor(db: dbInterface, path: string, txs: Uint8Array[]) {
        this.db = db;
        this.path = path;
        this.txs = txs;
        this.cache = new Map;
    }

    async clear() {
        await rm(this.path, { recursive: true, force: true });
    }

    async writeMicroblock(expirationDay: number, txId: number): Promise<boolean> {
        const content = this.txs[txId];
        const size = content.length;
        const hash = Crypto.Hashes.sha256AsBinary(content.slice(0, SCHEMAS.MICROBLOCK_HEADER_SIZE));
        const fileIdentifier = this.getFileIdentifier(expirationDay, hash);
        const filePath = this.getFilePath(fileIdentifier);
        const dbFileKey = new Uint8Array(Utils.intToByteArray(fileIdentifier, 4));

        const dataFileObject = await this.db.getObject(
            NODE_SCHEMAS.DB_DATA_FILE,
            dbFileKey
        ) || {
            fileSize: 0,
            microblockCount: 0
        };

        let cacheObject;

        if(this.cache.has(fileIdentifier)) {
            cacheObject = this.cache.get(fileIdentifier);
        }
        else {
            cacheObject = { txIds: [], expectedFileSize: dataFileObject.fileSize };
            this.cache.set(fileIdentifier, cacheObject);
        }

        cacheObject.txIds.push(txId);

        await this.db.putObject(
            NODE_SCHEMAS.DB_MICROBLOCK_STORAGE,
            hash,
            {
                fileIdentifier,
                offset: dataFileObject.fileSize,
                size
            }
        );

        dataFileObject.fileSize += size;
        dataFileObject.microblockCount++;

        await this.db.putObject(
            NODE_SCHEMAS.DB_DATA_FILE,
            dbFileKey,
            dataFileObject
        );

        return true;
    }

    async commit() {
        for(const [ fileIdentifier, cacheObject ] of this.cache) {
            const filePath = this.getFilePath(fileIdentifier);
            const directoryPath = path.dirname(filePath);

            try {
                await access(directoryPath, fs.constants.F_OK);
            }
            catch(error) {
                await mkdir(directoryPath, { recursive: true });
            }

            try {
                const handle = await open(filePath, 'a+');
                const stats = await handle.stat();
                const fileSize = stats.size;

                if(fileSize != cacheObject.expectedFileSize) {
                    throw new Error(`PANIC - '${filePath}' has an invalid size (expected ${cacheObject.expectedFileSize}, got ${fileSize})`);
                }

                for(const txId of cacheObject.txIds) {
                    await handle.write(this.txs[txId]);
                }
                await handle.sync();
                await handle.close();
            }
            catch(error) {
                console.error(error);
            }
        }
    }

    async readFullMicroblock(hash: Uint8Array) {
        return await this.readMicroblock(hash, READ_FULL);
    }

    async readMicroblockHeader(hash: Uint8Array) {
        return await this.readMicroblock(hash, READ_HEADER);
    }

    async readMicroblockBody(hash: Uint8Array) {
        return await this.readMicroblock(hash, READ_BODY);
    }

    private async readMicroblock(hash: Uint8Array, partType: number) {
        const storageInfo = await this.db.getObject(NODE_SCHEMAS.DB_MICROBLOCK_STORAGE, hash);

        if(!storageInfo) {
            return new Uint8Array();
        }

        const filePath = this.getFilePath(storageInfo.fileIdentifier);
        let dataBuffer;

        try {
            const handle = await open(filePath, 'r');
            dataBuffer = await this.readMicroblockPart(handle, storageInfo.offset, storageInfo.size, partType);
            await handle.close();
        }
        catch(error) {
            console.error(error);
            dataBuffer = new Uint8Array();
        }

        return dataBuffer;
    }

    private async readMicroblockPart(handle: FileHandle, offset: number, size: number, partType: number) {
        let rd;

        const [ extraOffset, targetSize ] = [
            [ 0, size ],
            [ 0, SCHEMAS.MICROBLOCK_HEADER_SIZE ],
            [ SCHEMAS.MICROBLOCK_HEADER_SIZE, size - SCHEMAS.MICROBLOCK_HEADER_SIZE ]
        ][partType];

        const dataBuffer = new Uint8Array(targetSize);
        rd = await handle.read(dataBuffer, 0, targetSize, offset + extraOffset);

        if(rd.bytesRead != targetSize) {
            throw new Error(`PANIC - encountered end of file while reading microblock data`);
        }

        return dataBuffer;
    }

    createChallenge(seed: Uint8Array) {
    }

    async processChallenge(seed: Uint8Array) {
    }

    private getFileIdentifier(expirationDay: number, hash: Uint8Array) {
        return expirationDay || (0xFF000000 | hash[0]) >>> 0;
    }

    private getFilePath(fileIdentifier: number) {
        let directory;
        let filename;

        if(fileIdentifier < 0xFF000000) {
            const [ year, month, day ] = Utils.decodeDay(fileIdentifier);
            const yearStr = year.toString(10);
            const monthStr = month.toString(10).padStart(2, "0");
            const dayStr = day.toString(10).padStart(2, "0");

            directory = yearStr;
            filename = yearStr + monthStr + dayStr;
        }
        else {
            directory = ENDLESS_DIRECTORY_NAME;
            filename = (fileIdentifier & 0xFF).toString(16).padStart(2, "0");
        }

        return path.join(this.path, directory, filename + ".bin");
    }
}
