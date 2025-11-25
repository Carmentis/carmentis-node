import fs, { mkdirSync } from 'node:fs';
import { FileHandle, access, mkdir, open, rm } from 'node:fs/promises';
import path from 'path';
import { NodeCrypto } from '../crypto/NodeCrypto';
import { ChallengeFile } from '../challenge/ChallengeFile';
import { SnapshotDataCopyManager } from '../SnapshotDataCopyManager';
import { DbInterface } from '../database/DbInterface';
import { NODE_SCHEMAS } from '../constants/constants';

import { SCHEMAS, Utils } from '@cmts-dev/carmentis-sdk/server';
import { FileIdentifier } from '../types/FileIdentifier';
import { getLogger } from '@logtape/logtape';
import { IStorage } from './IStorage';

const ENDLESS_DIRECTORY_NAME = 'endless';

export enum MicroblockReadingMode {
    READ_FULL = 0,
    READ_HEADER = 1,
    READ_BODY = 2,
}
const READ_FULL = 0;
const READ_HEADER = 1;
const READ_BODY = 2;


export class Storage implements IStorage {

    /**
     * Converts the 32-bit encoded expiration day and microblock hash to a 32-bit file identifier:
     * - the range 0x00000000 - 0x000EFFFF is reserved for special uses (only 0x00000000 is currently
     *   used to identify the database file in a snapshot)
     * - the range 0x000F0000 - 0xFEFFFFFF is used for files with an expiration day
     * - the range 0xFF000000 - 0xFF0000FF is used for files with endless storage
     * - the range 0xFF000100 - 0xFFFFFFFF is currently not used
     */
    static getFileIdentifier(expirationDay: number, hash: Uint8Array): FileIdentifier {
        return expirationDay || (0xff000000 | hash[0]) >>> 0;
    }


    private db: DbInterface;
    private path: string;

    //private txs: Uint8Array[];
    //private cache: Map<number, any>;

    private static logger = getLogger(['node', 'storage', Storage.name]);
    private logger = Storage.logger;

    constructor(db: DbInterface, path: string) {
        this.db = db;
        this.path = path;
        //this.txs = txs;
        //this.cache = new Map();
    }

    /**
     * Deletes all microblock directories and files.
     * This should be called when and ONLY WHEN InitChain is triggered.
     */
    async clear() {
        this.logger.debug(`Clearing storage at '${this.path}'`);
        await rm(this.path, { recursive: true, force: true });
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
        const copyManager = new SnapshotDataCopyManager();
        const filePath = this.getFilePath(fileIdentifier);

        await copyManager.copyFileToBuffer(filePath, buffer, bufferOffset, fileOffset, size);
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
        const copyManager = new SnapshotDataCopyManager();
        const filePath = this.getFilePath(fileIdentifier);

        await copyManager.copyBufferToFile(filePath, buffer, bufferOffset, fileOffset, size);
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
    async readSerializedMicroblockHeader(hash: Uint8Array) {
        return await this.readMicroblock(hash, READ_HEADER);
    }

    /**
     * Reads a microblock body from its hash.
     */
    async readSerializedMicroblockBody(hash: Uint8Array) {
        return await this.readMicroblock(hash, READ_BODY);
    }

    /**
     * Reads a full microblock, microblock header or microblock body from its hash.
     */
    private async readMicroblock(hash: Uint8Array, partType: MicroblockReadingMode) {
        const storageInfo = await this.db.getMicroblockStorage(hash);

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
            this.logger.error("{error}", {error});
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
        partType: MicroblockReadingMode,
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





    async writeTransactions(
        fileIdentifier: number,
        expectedFileSizeBeforeToWrite: number,
        transactions: Uint8Array[],
        //cacheObject: { txIds: number[]; expectedFileSize: number },
    ) {
        const filePath = this.getFilePath(fileIdentifier);
        const directoryPath = path.dirname(filePath);

        try {
            await access(directoryPath, fs.constants.F_OK);
        } catch (error) {
            this.logger.debug(`Creating directory '${directoryPath}'`);
            await mkdir(directoryPath, { recursive: true });
        }

        try {
            const handle = await open(filePath, 'a+');
            const stats = await handle.stat();
            const fileSize = stats.size;

            if (fileSize != expectedFileSizeBeforeToWrite) {
                throw new Error(
                    `PANIC - '${filePath}' has an invalid size (expected ${expectedFileSizeBeforeToWrite}, got ${fileSize})`,
                );
            }

            for (const tx of transactions) {
                await handle.write(tx);
            }
            await handle.sync();
            await handle.close();
        } catch (error) {
            this.logger.error("{e}", {e: error})
        }
    }



    /**
     * Converts a 32-bit file identifier to a file path:
     * - either [this.path]/[ENDLESS_DIRECTORY_NAME]/NN.bin for files with endless storage
     * - or [this.path]/YYYY/YYYYMMDD.bin for files with an expiration day
     */
    getFilePath(fileIdentifier: FileIdentifier) {
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
