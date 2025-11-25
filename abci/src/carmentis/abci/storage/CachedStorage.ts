import { MicroblockReadingMode, Storage } from './Storage';
import { NodeCrypto } from '../crypto/NodeCrypto';
import { Microblock, SCHEMAS, Utils } from '@cmts-dev/carmentis-sdk/server';
import { CachedLevelDb } from '../database/CachedLevelDb';
import { FileIdentifier } from '../types/FileIdentifier';
import { FileHandle, open } from 'node:fs/promises';
import { IStorage } from './IStorage';

interface BufferedTransactions {
    transactionsToWrite: Uint8Array[];
    expectedFileSizeBeforeToWrite: number;
}

export class CachedStorage implements IStorage {

    private contentToBeWritten: Map<
        number,
        BufferedTransactions
    >;

    constructor(
        private readonly storage: Storage,
        private readonly db: CachedLevelDb,
        initialPendingTransactions: Uint8Array[] = [],
    ) {
        this.contentToBeWritten = new Map();
    }

    async readFullMicroblock(hash: Uint8Array) {
        return await this.readMicroblock(hash, MicroblockReadingMode.READ_FULL);
    }

    /**
     * Reads a microblock header from its hash.
     */
    async readSerializedMicroblockHeader(hash: Uint8Array) {
        return await this.readMicroblock(hash, MicroblockReadingMode.READ_HEADER);
    }

    /**
     * Reads a microblock body from its hash.
     */
    async readSerializedMicroblockBody(hash: Uint8Array) {
        return await this.readMicroblock(hash, MicroblockReadingMode.READ_BODY);
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
        partType: MicroblockReadingMode,
    ) {
        // TODO(fix): in the SDK, header and body are no more concatenated, so we need to read them separately
        // See BlockchainSerializer
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
     * Adds a microblock and its associated transaction to a buffer for later processing.
     *
     * @param {number} expirationDay - The expiration day associated with the microblock.
     * @param {Microblock} microblock - The microblock to be added.
     * @param {Uint8Array} serializedMicroblock - The transaction data to associate with the microblock.
     * @return {Promise<boolean>} Resolves to true if the operation completes successfully.
     */
    async addMicroblockToBuffer(
        expirationDay: number,
        microblock: Microblock,
        serializedMicroblock: Uint8Array,
    ): Promise<boolean> {
        const content = serializedMicroblock; //this.pendingTransactions[txId];
        const size = content.length;
        /*
        const microblockHeaderHash = NodeCrypto.Hashes.sha256AsBinary(
            content.slice(0, SCHEMAS.MICROBLOCK_HEADER_SIZE),
        );
         */

        const microblockHash = microblock.getHashAsBytes();
        const fileIdentifier = Storage.getFileIdentifier(expirationDay, microblockHash);
        const dbFileKey = new Uint8Array(Utils.intToByteArray(fileIdentifier, 4));
        const dataFileObject = (await this.db.getDataFileFromDataFileKey(dbFileKey)) || {
            fileSize: 0,
            microblockCount: 0,
        };

        // we add the transaction in the buffer
        let cacheObject: BufferedTransactions;
        if (this.contentToBeWritten.has(fileIdentifier)) {
            cacheObject = this.contentToBeWritten.get(fileIdentifier);
            cacheObject.transactionsToWrite.push(serializedMicroblock);
        } else {
            this.contentToBeWritten.set(fileIdentifier, {
                transactionsToWrite: [serializedMicroblock],
                expectedFileSizeBeforeToWrite: dataFileObject.fileSize,
            });
        }

        // update the microblock storage information
        await this.db.putMicroblockStorage(microblockHash, {
            fileIdentifier,
            offset: dataFileObject.fileSize,
            size,
        });


        dataFileObject.fileSize += size;
        dataFileObject.microblockCount += 1;
        await this.db.putDataFile(dbFileKey, dataFileObject);

        return true;
    }

    clear() {
        this.contentToBeWritten.clear();
    }

    async flush() {
        // write transactions
        for (const [fileIdentifier, cacheObject] of this.contentToBeWritten) {
            const expectedFileSizeBeforeToWrite = cacheObject.expectedFileSizeBeforeToWrite;
            const transactionsToBeWritten = cacheObject.transactionsToWrite;
            await this.storage.writeTransactions(
                fileIdentifier,
                expectedFileSizeBeforeToWrite,
                transactionsToBeWritten,
            );
        }

        // clear the cache
        this.clear();
    }

    getFilePath(fileIdentifier: FileIdentifier) {
        return this.storage.getFilePath(fileIdentifier);
    }

    containsFile(fileIdentifier: FileIdentifier) {
        return this.contentToBeWritten.has(fileIdentifier);
    }

    getPendingTransactionsByFileIdentifier(fileIdentifier: FileIdentifier) {
        const bufferedTransactions = this.contentToBeWritten.get(fileIdentifier);
        return bufferedTransactions.transactionsToWrite;
    }

    /*
     * Processes a storage challenge for a given seed.
     *
    async processChallenge(seed: Uint8Array) {
        const buffer = new Uint8Array(CHALLENGE_PARTS_PER_FILE * CHALLENGE_BYTES_PER_PART);
        let prngValue = seed;
        let prngCounter = 0;
        let hash: Uint8Array = Utils.getNullHash();

        const dataFileTable = await this.db.getFullTable(NODE_SCHEMAS.DB_DATA_FILE);

        if (dataFileTable === null) {
            return hash;
        }

        // fileEntries[] is the list of all pairs [ fileIdentifier, fileSize ],
        // sorted by file identifiers in ascending order
        const fileEntries = dataFileTable
            .map(([key, value]) => {
                return [
                    key.reduce((t, n) => t * 0x100 + n, 0),
                    value.slice(0, 6).reduce((t, n) => t * 0x100 + n, 0),
                ];
            })
            .sort(([key0], [key1]) => key0 - key1);

        const filesCount = fileEntries.length;

        if (!filesCount) {
            return hash;
        }

        for (let fileNdx = 0; fileNdx < CHALLENGE_FILES_PER_CHALLENGE; fileNdx++) {
            const fileRank = getRandom48() % filesCount;
            const [fileIdentifier, fileSize] = fileEntries[fileRank];
            const filePath = this.getFilePath(fileIdentifier);

            const pendingTxs = this.cache.has(fileIdentifier)
                ? this.cache.get(fileIdentifier).txIds.map((txId) => this.txs[txId])
                : [];

            const challengeFile = new ChallengeFile(filePath, pendingTxs);
            await challengeFile.open();
            let bufferOffset = 0;

            for (let partNdx = 0; partNdx < CHALLENGE_PARTS_PER_FILE; partNdx++) {
                let remainingBytes = CHALLENGE_BYTES_PER_PART;
                let fileOffset = getRandom48() % fileSize;

                while (remainingBytes) {
                    const sizeToRead = Math.min(fileSize - fileOffset, remainingBytes);
                    const rd = await challengeFile.read(
                        buffer,
                        bufferOffset,
                        sizeToRead,
                        fileOffset,
                    );

                    if (rd.bytesRead < sizeToRead) {
                        throw new Error(
                            `PANIC - Failed to read enough bytes from '${filePath}' during storage challenge`,
                        );
                    }

                    bufferOffset += sizeToRead;
                    fileOffset += sizeToRead;
                    fileOffset %= fileSize;
                    remainingBytes -= sizeToRead;
                }
            }
            await challengeFile.close();

            const newHash = NodeCrypto.Hashes.sha256AsBinary(buffer);
            hash = NodeCrypto.Hashes.sha256AsBinary(Utils.binaryFrom(hash, newHash));
        }

        return hash;

        // we extract 5 pseudo-random 48-bit values per hash and renew the hash every 5 calls
        function getRandom48() {
            const index = (prngCounter++ % 5) * 6;

            if (index == 0) {
                prngValue = NodeCrypto.Hashes.sha256AsBinary(prngValue);
            }
            return prngValue.slice(index, index + 6).reduce((t, n) => t * 0x100 + n, 0);
        }
    }

     */
    getCachedLevelDb() {
        return this.db;
    }
}