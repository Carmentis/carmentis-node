import fs, { mkdirSync } from 'node:fs';
import { FileHandle, access, mkdir, open, rm } from 'node:fs/promises';
import path from 'path';
import { DbInterface } from './database/DbInterface';
import { NODE_SCHEMAS } from './constants/constants';

import { SCHEMAS, Crypto, Utils } from '@cmts-dev/carmentis-sdk/server';
import { FileIdentifier } from './types/FileIdentifier';

const ENDLESS_DIRECTORY_NAME = 'endless';

const READ_FULL = 0;
const READ_HEADER = 1;
const READ_BODY = 2;

const CHALLENGE_FILES_PER_CHALLENGE = 8;
const CHALLENGE_PARTS_PER_FILE = 256;
const CHALLENGE_BYTES_PER_PART = 1024;

export class Storage {
    db: DbInterface;
    path: string;
    txs: Uint8Array[];
    cache: Map<number, any>;

    constructor(db: DbInterface, path: string, txs: Uint8Array[]) {
        this.db = db;
        this.path = path;
        this.txs = txs;
        this.cache = new Map();
    }

    /**
     * Deletes all microblock directories and files.
     * This should be called when and ONLY WHEN InitChain is triggered.
     */
    async clear() {
        await rm(this.path, { recursive: true, force: true });
    }

    /**
     * Writes a microblock taken from the block transaction pool with a given expiration day.
     * This updates a dedicated cache and the database (which should be cached as well).
     * The data is NOT saved on disk until flush() is called.
     */
    async writeMicroblock(expirationDay: number, txId: number): Promise<boolean> {
        const content = this.txs[txId];
        const size = content.length;
        const hash = Crypto.Hashes.sha256AsBinary(content.slice(0, SCHEMAS.MICROBLOCK_HEADER_SIZE));
        const fileIdentifier = this.getFileIdentifier(expirationDay, hash);
        const filePath = this.getFilePath(fileIdentifier);
        const dbFileKey = new Uint8Array(Utils.intToByteArray(fileIdentifier, 4));

        const dataFileObject: any = (await this.db.getObject(NODE_SCHEMAS.DB_DATA_FILE, dbFileKey)) || {
            fileSize: 0,
            microblockCount: 0,
        };

        let cacheObject;

        if (this.cache.has(fileIdentifier)) {
            cacheObject = this.cache.get(fileIdentifier);
        } else {
            cacheObject = { txIds: [], expectedFileSize: dataFileObject.fileSize };
            this.cache.set(fileIdentifier, cacheObject);
        }

        cacheObject.txIds.push(txId);

        await this.db.putObject(NODE_SCHEMAS.DB_MICROBLOCK_STORAGE, hash, {
            fileIdentifier,
            offset: dataFileObject.fileSize,
            size,
        });

        dataFileObject.fileSize += size;
        dataFileObject.microblockCount++;

        await this.db.putObject(NODE_SCHEMAS.DB_DATA_FILE, dbFileKey, dataFileObject);

        return true;
    }

    /**
     * Flushes all pending writes to disk.
     */
    async flush() {
        for (const [fileIdentifier, cacheObject] of this.cache) {
            const filePath = this.getFilePath(fileIdentifier);
            const directoryPath = path.dirname(filePath);

            try {
                await access(directoryPath, fs.constants.F_OK);
            } catch (error) {
                await mkdir(directoryPath, { recursive: true });
            }

            try {
                const handle = await open(filePath, 'a+');
                const stats = await handle.stat();
                const fileSize = stats.size;

                if (fileSize != cacheObject.expectedFileSize) {
                    throw new Error(
                        `PANIC - '${filePath}' has an invalid size (expected ${cacheObject.expectedFileSize}, got ${fileSize})`,
                    );
                }

                for (const txId of cacheObject.txIds) {
                    await handle.write(this.txs[txId]);
                }
                await handle.sync();
                await handle.close();
            } catch (error) {
                console.error(error);
            }
        }
    }

    /**
     * Copies from a microblock file to a buffer.
     * This is used by snapshots.
     */
    async copyFileToBuffer(
        fileIdentifier: FileIdentifier,
        buffer: Uint8Array,
        bufferOffset: number,
        fileOffset: number,
        size: number,
    ) {
        const filePath = this.getFilePath(fileIdentifier);
        const handle = await open(filePath, 'r');
        const rd = await handle.read(buffer, bufferOffset, size, fileOffset);
        await handle.close();

        if (rd.bytesRead < size) {
            throw new Error(
                `Encountered end of file while reading ${size} bytes from '${filePath}' at offset ${fileOffset}`,
            );
        }
    }

    /**
     * Copies from a buffer to a microblock file.
     * This is used by snapshots.
     */
    async copyBufferToFile(
        fileIdentifier: FileIdentifier,
        buffer: Uint8Array,
        bufferOffset: number,
        fileOffset: number,
        size: number,
    ) {
        const filePath = this.getFilePath(fileIdentifier);
        const isWritingOnEmptyFile = fileOffset == 0;
        const fileAccessMode = isWritingOnEmptyFile ? 'a+' : 'w+';
        const handle = await open(filePath, fileAccessMode);
        const stats = await handle.stat();
        const fileSize = stats.size;

        if (fileSize != fileOffset) {
            await handle.close();
            throw new Error(
                `copyBufferToFile(): argument fileOffset (${fileOffset}) doesn't match the current file size (${fileSize})`,
            );
        }

        await handle.write(buffer, bufferOffset, size);
        await handle.close();
    }

    /**
     * Reads a full microblock from its hash.
     */
    async readFullMicroblock(hash: Uint8Array) {
        return await this.readMicroblock(hash, READ_FULL);
    }

    /**
     * Reads a microblock header from its hash.
     */
    async readMicroblockHeader(hash: Uint8Array) {
        return await this.readMicroblock(hash, READ_HEADER);
    }

    /**
     * Reads a microblock body from its hash.
     */
    async readMicroblockBody(hash: Uint8Array) {
        return await this.readMicroblock(hash, READ_BODY);
    }

    /**
     * Reads a full microblock, microblock header or microblock body from its hash.
     */
    private async readMicroblock(hash: Uint8Array, partType: number) {
        const storageInfo: any = await this.db.getObject(NODE_SCHEMAS.DB_MICROBLOCK_STORAGE, hash);

        if (!storageInfo) {
            return new Uint8Array();
        }

        const filePath = this.getFilePath(storageInfo.fileIdentifier);
        let dataBuffer: Uint8Array;

        try {
            const handle = await open(filePath, 'r');
            dataBuffer = await this.readMicroblockPart(
                handle,
                storageInfo.offset,
                storageInfo.size,
                partType,
            );
            await handle.close();
        } catch (error) {
            console.error(error);
            dataBuffer = new Uint8Array();
        }

        return dataBuffer;
    }

    /**
     * Reads a microblock part given a file handle, offset, size and type of part.
     */
    private async readMicroblockPart(
        handle: FileHandle,
        offset: number,
        size: number,
        partType: number,
    ) {
        const [extraOffset, targetSize] = [
            [0, size],
            [0, SCHEMAS.MICROBLOCK_HEADER_SIZE],
            [SCHEMAS.MICROBLOCK_HEADER_SIZE, size - SCHEMAS.MICROBLOCK_HEADER_SIZE],
        ][partType];

        const dataBuffer = new Uint8Array(targetSize);
        const rd = await handle.read(dataBuffer, 0, targetSize, offset + extraOffset);

        if (rd.bytesRead < targetSize) {
            throw new Error(`PANIC - encountered end of file while reading microblock data`);
        }

        return dataBuffer;
    }

    /**
     * Processes a storage challenge for a given seed.
     */
    async processChallenge(seed: Uint8Array) {
        const buffer = new Uint8Array(CHALLENGE_PARTS_PER_FILE * CHALLENGE_BYTES_PER_PART);
        let prngValue = seed;
        let prngCounter = 0;
        let hash: Uint8Array = Utils.getNullHash();

        const iterator = await this.db.query(NODE_SCHEMAS.DB_DATA_FILE);

        if (iterator === null) {
            return hash;
        }

        // fileEntries[] is the list of all pairs [ fileIdentifier, fileSize ]
        const fileEntries = (await iterator.all()).map(([key, value]) => {
            return [
                key.reduce((t, n) => t * 0x100 + n, 0),
                value.slice(0, 6).reduce((t, n) => t * 0x100 + n, 0),
            ];
        });

        const filesCount = fileEntries.length;

        if (!filesCount) {
            return hash;
        }

        for (let fileNdx = 0; fileNdx < CHALLENGE_FILES_PER_CHALLENGE; fileNdx++) {
            const fileRank = getRandom48() % filesCount;
            const [fileIdentifier, fileSize] = fileEntries[fileRank];
            const filePath = this.getFilePath(fileIdentifier);
            const handle = await open(filePath, 'r');
            let bufferOffset = 0;

            for (let partNdx = 0; partNdx < CHALLENGE_PARTS_PER_FILE; partNdx++) {
                let remainingBytes = CHALLENGE_BYTES_PER_PART;
                let fileOffset = getRandom48() % fileSize;

                while (remainingBytes) {
                    const readSize = Math.min(fileSize - fileOffset, remainingBytes);
                    const rd = await handle.read(buffer, bufferOffset, readSize, fileOffset);

                    if (rd.bytesRead < readSize) {
                        throw new Error(
                            `PANIC - Failed to read enough bytes from '${filePath}' during storage challenge`,
                        );
                    }

                    bufferOffset += readSize;
                    fileOffset += readSize;
                    fileOffset %= fileSize;
                    remainingBytes -= readSize;
                }
            }
            await handle.close();

            const newHash = Crypto.Hashes.sha256AsBinary(buffer);
            hash = Crypto.Hashes.sha256AsBinary(Utils.binaryFrom(hash, newHash));
        }

        return hash;

        // we extract 5 pseudo-random 48-bit values per hash and renew the hash every 5 calls
        function getRandom48() {
            const index = (prngCounter++ % 5) * 6;

            if (index == 0) {
                prngValue = Crypto.Hashes.sha256AsBinary(prngValue);
            }
            return prngValue.slice(index, index + 6).reduce((t, n) => t * 0x100 + n, 0);
        }
    }

    /**
     * Converts the 32-bit encoded expiration day and microblock hash to a 32-bit file identifier:
     * - the range 0x00000000 - 0x000EFFFF is reserved for special uses (only 0x00000000 is currently
     *   used to identify the database file in a snapshot)
     * - the range 0x000F0000 - 0xFEFFFFFF is used for files with an expiration day
     * - the range 0xFF000000 - 0xFF0000FF is used for files with endless storage
     * - the range 0xFF000100 - 0xFFFFFFFF is currently not used
     */
    private getFileIdentifier(expirationDay: number, hash: Uint8Array): FileIdentifier {
        return expirationDay || (0xff000000 | hash[0]) >>> 0;
    }

    /**
     * Converts a 32-bit file identifier to a file path:
     * - either [this.path]/[ENDLESS_DIRECTORY_NAME]/NN.bin for files with endless storage
     * - or [this.path]/YYYY/YYYYMMDD.bin for files with an expiration day
     */
    private getFilePath(fileIdentifier: FileIdentifier) {
        let directory;
        let filename;

        const isFocusingFileHavingExpirationDay = fileIdentifier < 0xff000000;
        if (isFocusingFileHavingExpirationDay) {
            // We extract the expiration day from the file identifier.
            const [year, month, day] = Utils.decodeDay(fileIdentifier);
            const yearStr = year.toString(10);
            const monthStr = month.toString(10).padStart(2, '0');
            const dayStr = day.toString(10).padStart(2, '0');

            directory = yearStr;
            filename = yearStr + monthStr + dayStr;
        } else {
            directory = ENDLESS_DIRECTORY_NAME;

            // We use the hex-encoded upmost first byte of the microblock hash as the filename.
            filename = (fileIdentifier & 0xff)
                .toString(16) // encoding in hex
                .padStart(2, '0');
        }

        // we ensure that the directory exists
        const directoryPath = path.join(this.path, directory);
        mkdirSync(directoryPath, { recursive: true });

        // we return the file path
        const filePath = path.join(directoryPath, filename + '.bin');
        return filePath;
    }
}
