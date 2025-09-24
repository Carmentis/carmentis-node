import fs from 'node:fs';
import path from 'path';
import crypto from 'node:crypto';
import stream from 'node:stream/promises';
import { FileHandle, access, mkdir, open, rename, readdir, rm } from 'node:fs/promises';
import { LevelDb } from './database/LevelDb';
import { Storage } from './Storage';
import { SnapshotChunksFile } from './SnapshotChunksFile';
import { NODE_SCHEMAS } from './constants/constants';

import { SCHEMAS, SchemaUnserializer, Crypto, Utils } from '@cmts-dev/carmentis-sdk/server';
import { Logger } from '@nestjs/common';

const FORMAT = 1;
const MAX_CHUNK_SIZE = 4096; // 10 * 1024 * 1024;
const DB_BATCH_SIZE = 1000;
const SNAPSHOT_PREFIX = 'snapshot-';
const CHUNKS_SUFFIX = '-chunks.bin';
const DB_SUFFIX = '-db.bin';
const JSON_SUFFIX = '.json';
const DB_DUMP_IN_PROGRESS_FILENAME = 'db-dump-in-progress.bin';
const IMPORTED_CHUNKS_FILENAME = 'imported-chunks.bin';

export class SnapshotsManager {
    db: LevelDb;
    path: string;
    logger: Logger;

    constructor(db: LevelDb, path: string, logger: Logger) {
        this.db = db;
        this.path = path;
        this.logger = logger;
    }

    /**
     * Keeps up to n of the most recent snapshots and deletes the rest.
     */
    async clear(n) {
        const list = await this.getList();

        list.sort((a, b) => b.height - a.height);

        while (list.length > n) {
            const entry = list.pop();
            await rm(path.join(this.path, entry.metadata.jsonFile));
            await rm(path.join(this.path, entry.metadata.dbFile));
            await rm(path.join(this.path, entry.metadata.chunksFile));
            this.logger.log(`Removed snapshot for height ${entry.height}`);
        }
    }

    /**
     * Gets the list of snapshots stored by this node.
     * Called internally and from ListSnapshots.
     */
    async getList() {
        const entries = await this.getSnapshotEntriesFromDirectory();
        //const entries = await readdir(this.path, { withFileTypes: true});
        // FIXME: The '\\' before ${JSON_SUFFIX} is for the '.' of '.json' and is temporary.
        // Once we've switched to Node 24, we should use this cleaner and safer version:
        // const regex = new RegExp(`^${RegExp.escape(SNAPSHOT_PREFIX)}\\d{9}${RegExp.escape(JSON_SUFFIX)}$`);
        const regex = new RegExp(`^${SNAPSHOT_PREFIX}\\d{9}\\${JSON_SUFFIX}$`);
        const list = [];

        for (const entry of entries) {
            if (!entry.isFile() || !regex.test(entry.name)) {
                continue;
            }

            const filePath = path.join(this.path, entry.name);

            try {
                const content = fs.readFileSync(filePath);
                const object = JSON.parse(content.toString());

                list.push(object);
            } catch (error) {
                this.logger.error(error);
            }
        }
        return list;
    }

    /**
     * Gets a snapshot chunk stored by this node.
     * Called from LoadSnapshotChunk.
     */
    async getChunk(storage: Storage, height: number, index: number): Promise<Uint8Array> {
        const emptyBuffer = new Uint8Array();
        const jsonFilePath = path.join(this.path, this.getFilePrefix(height) + JSON_SUFFIX);
        let jsonData;

        try {
            const content = fs.readFileSync(jsonFilePath);
            jsonData = JSON.parse(content.toString());
        } catch (error) {
            this.logger.error(error);
            return emptyBuffer;
        }

        if (jsonData.height != height) {
            this.logger.error('internal error: inconsistent height in JSON file');
            return emptyBuffer;
        }

        const chunksFilePath = path.join(this.path, this.getFilePrefix(height) + CHUNKS_SUFFIX);
        const chunksFile = new SnapshotChunksFile(chunksFilePath);
        const info = await chunksFile.getInformation();

        if (jsonData.chunks != info.chunksCount + 1) {
            this.logger.error(
                'internal error: number of chunks in JSON file and chunks file are inconsistent',
            );
            return emptyBuffer;
        }
        if (info.height != height) {
            this.logger.error('internal error: inconsistent height in chunks file');
            return emptyBuffer;
        }
        if (index < 0 || index >= info.chunksCount + 1) {
            this.logger.error(
                `requested chunk index ${index} is inconsistent (should be in 0 .. ${info.chunksCount})`,
            );
            return emptyBuffer;
        }

        if (index == 0) {
            return await chunksFile.getFullContent();
        }

        // compute the total chunk size
        let chunkSize = 0;

        // TODO replace chunk callback
        await chunksFile.processChunk(index - 1, async (fileIdentifier, offset, size) => {
            chunkSize += size;
        });

        if (chunkSize > MAX_CHUNK_SIZE) {
            this.logger.error('internal error: chunk size is inconsistent');
            return emptyBuffer;
        }

        // allocate the buffer and load all parts
        const buffer = new Uint8Array(chunkSize);
        let bufferOffset = 0;

        await chunksFile.processChunk(index - 1, async (fileIdentifier, fileOffset, size) => {
            if (fileIdentifier == 0) {
                await this.copyDbFileToBuffer(height, buffer, bufferOffset, fileOffset, size);
            } else {
                await storage.copyFileToBuffer(
                    fileIdentifier,
                    buffer,
                    bufferOffset,
                    fileOffset,
                    size,
                );
            }
            bufferOffset += size;
        });

        return buffer;
    }

    /**
     * Loads a snapshot chunk received from another node.
     * Called from ApplySnapshotChunk.
     */
    async loadReceivedChunk(storage: Storage, index: number, buffer: Uint8Array, isLast: boolean) {
        await this.createPath();

        const chunksFilePath = path.join(this.path, IMPORTED_CHUNKS_FILENAME);

        // the very first chunk contains the chunks description file
        if (index == 0) {
            fs.writeFileSync(chunksFilePath, buffer);
            return;
        }

        const chunksFile = new SnapshotChunksFile(chunksFilePath);
        const info = await chunksFile.getInformation();
        let bufferOffset = 0;

        await chunksFile.processChunk(index - 1, async (fileIdentifier, fileOffset, size) => {
            if (fileIdentifier == 0) {
                await this.copyBufferToDbFile(info.height, buffer, bufferOffset, fileOffset, size);
            } else {
                await storage.copyBufferToFile(
                    fileIdentifier,
                    buffer,
                    bufferOffset,
                    fileOffset,
                    size,
                );
            }
            bufferOffset += size;
        });

        if (isLast) {
            await this.importDbFile(info.height);
        }
    }

    /**
     * Copies from a DB file to a buffer.
     */
    async copyDbFileToBuffer(
        height: number,
        buffer: Uint8Array,
        bufferOffset: number,
        fileOffset: number,
        size: number,
    ) {
        const dbFilePath = path.join(this.path, this.getFilePrefix(height) + DB_SUFFIX);
        const handle = await open(dbFilePath, 'r');
        const rd = await handle.read(buffer, bufferOffset, size, fileOffset);
        await handle.close();

        if (rd.bytesRead < size) {
            throw new Error(
                `Encountered end of file while reading ${size} bytes from '${dbFilePath}' at offset ${fileOffset}`,
            );
        }
    }

    /**
     * Copies from a buffer to a DB file.
     */
    async copyBufferToDbFile(
        height: number,
        buffer: Uint8Array,
        bufferOffset: number,
        fileOffset: number,
        size: number,
    ) {
        // open database in writing mode
        const dbFilePath = path.join(this.path, this.getFilePrefix(height) + DB_SUFFIX);
        const handle = await open(dbFilePath, fileOffset ? 'a+' : 'w+');
        const stats = await handle.stat();
        const fileSize = stats.size;

        if (fileSize != fileOffset) {
            await handle.close();
            throw new Error(
                `copyBufferToDbFile(): argument fileOffset (${fileOffset}) doesn't match the current file size (${fileSize})`,
            );
        }

        await handle.write(buffer, bufferOffset, size);
        await handle.close();
    }

    /**
     * Creates a new snapshot at the current height. This will generate 3 files:
     * - snapshot-[height]-db.bin
     *   -> the dump of the database
     * - snapshot-[height]-chunks.bin
     *   -> the description of the chunks; the chunks include the full dump of the database
     *      and the microblock files up to the length they have at the time of the snapshot
     * - snapshot-[height].json
     *   -> meta information about the snapshot, used to answer ListSnapshots
     */
    async create() {
        await this.createPath();

        const { height, files, earliestFileDate, dbFilePath } = await this.createDbFile();
        const { chunks, chunksFilePath } = await this.createChunksFile(height, files);
        const dbFileSha256 = await this.getFileSha256(dbFilePath);
        const chunksFileSha256 = await this.getFileSha256(chunksFilePath);
        const hash = Crypto.Hashes.sha256(Utils.binaryFrom(dbFileSha256, chunksFileSha256));

        const jsonFilePath = path.join(this.path, this.getFilePrefix(height) + JSON_SUFFIX);

        const snapshotObject = {
            height,
            format: FORMAT,
            chunks,
            hash,
            metadata: {
                earliestFileDate,
                dbFile: path.basename(dbFilePath),
                dbFileSha256: Utils.binaryToHexa(dbFileSha256),
                chunksFile: path.basename(chunksFilePath),
                chunksFileSha256: Utils.binaryToHexa(chunksFileSha256),
                jsonFile: path.basename(jsonFilePath),
            },
        };

        fs.writeFileSync(jsonFilePath, JSON.stringify(snapshotObject, null, 2));
    }

    /**
     * Creates the database dump file.
     */
    private async createDbFile() {
        const chainInfoTableId = Utils.numberToHexa(NODE_SCHEMAS.DB_CHAIN_INFORMATION, 2);
        const chainInfoTableChar0 = chainInfoTableId.charCodeAt(0);
        const chainInfoTableChar1 = chainInfoTableId.charCodeAt(1);

        const dataFileTableId = Utils.numberToHexa(NODE_SCHEMAS.DB_DATA_FILE, 2);
        const dataFileTableChar0 = dataFileTableId.charCodeAt(0);
        const dataFileTableChar1 = dataFileTableId.charCodeAt(1);
        const dataFileUnserializer = new SchemaUnserializer(
            NODE_SCHEMAS.DB[NODE_SCHEMAS.DB_DATA_FILE],
        );

        const temporaryPath = path.join(this.path, DB_DUMP_IN_PROGRESS_FILENAME);
        const handle = await open(temporaryPath, 'w');

        const iterator = this.db.getDbIterator();
        const files = [];
        let earliestFileIdentifier = 0xff000000;
        let height;
        let size = 0;

        for await (const [key, value] of iterator) {
            await handle.write(new Uint8Array(Utils.intToByteArray(key.length, 2)));
            await handle.write(key);
            await handle.write(new Uint8Array(Utils.intToByteArray(value.length, 2)));
            await handle.write(value);

            size += key.length + value.length + 4;

            // if this is the DB_CHAIN_INFORMATION record, collect the height
            if (key[1] == chainInfoTableChar0 && key[2] == chainInfoTableChar1) {
                const chainInfoUnserializer = new SchemaUnserializer(
                    NODE_SCHEMAS.DB[NODE_SCHEMAS.DB_CHAIN_INFORMATION],
                );
                const chainInfoObject: any = chainInfoUnserializer.unserialize(value);
                height = chainInfoObject.height;
            }
            // if this is a DB_DATA_FILE record, collect the file identifier and size
            else if (key[1] == dataFileTableChar0 && key[2] == dataFileTableChar1) {
                const fileIdentifier = [4, 5, 6, 7].reduce((t, n) => t * 0x100 + key[n], 0);
                const dataFileObject: any = dataFileUnserializer.unserialize(value);
                files.push([fileIdentifier, dataFileObject.fileSize]);
                earliestFileIdentifier = Math.min(earliestFileIdentifier, fileIdentifier);
            }
        }
        await handle.close();

        const dbFilePath = path.join(this.path, this.getFilePrefix(height) + DB_SUFFIX);
        await rename(temporaryPath, dbFilePath);

        files.push([0, size]);

        const [earliestYear, earliestMonth, earliestDay] = Utils.decodeDay(earliestFileIdentifier);
        const earliestFileDate =
            earliestYear.toString(10) +
            earliestMonth.toString(10).padStart(2, '0') +
            earliestDay.toString(10).padStart(2, '0');

        return { height, files, earliestFileDate, dbFilePath };
    }

    /**
     * Imports a database dump file.
     */
    private async importDbFile(height: number) {
        const dbFilePath = path.join(this.path, this.getFilePrefix(height) + DB_SUFFIX);
        this.logger.verbose(`Importing db file ${dbFilePath}`);
        const handle = await open(dbFilePath, 'r');

        const sizeBuffer = new Uint8Array(2);
        let batch = this.db.getBatch();
        let fileOffset = 0;
        let size;
        let rd;

        await this.db.clear();

        for (let batchSize = 0; ; batchSize++) {
            rd = await handle.read(sizeBuffer, 0, 2, fileOffset);
            fileOffset += 2;

            if (!rd.bytesRead || batchSize == DB_BATCH_SIZE) {
                await batch.write();
                batchSize = 0;

                if (rd.bytesRead) {
                    batch = this.db.getBatch();
                }
            }

            if (!rd.bytesRead) {
                break;
            }

            size = Utils.byteArrayToInt([...sizeBuffer]);
            const keyBuffer = new Uint8Array(size);
            rd = await handle.read(keyBuffer, 0, size, fileOffset);
            fileOffset += size;

            if (rd.bytesRead < size) {
                throw new Error(`Encountered end of file while reading key from DB file`);
            }

            rd = await handle.read(sizeBuffer, 0, 2, fileOffset);
            fileOffset += 2;

            size = Utils.byteArrayToInt([...sizeBuffer]);
            const valueBuffer = new Uint8Array(size);
            rd = await handle.read(valueBuffer, 0, size, fileOffset);
            fileOffset += size;

            if (rd.bytesRead < size) {
                throw new Error(`Encountered end of file while reading value from DB file`);
            }
            batch.put(-1, [[keyBuffer, valueBuffer]]);
        }
        await handle.close();
    }

    /**
     * Creates the chunks file.
     */
    private async createChunksFile(height: number, files: [number, number][]) {
        const chunks = [];
        let currentChunk = [];
        let currentChunkSize = 0;

        for (const [fileIdentifier, fileSize] of files) {
            let remainingSize = fileSize;
            let offset = 0;

            while (currentChunkSize + remainingSize > MAX_CHUNK_SIZE) {
                const size = MAX_CHUNK_SIZE - currentChunkSize;
                if (size) {
                    currentChunk.push(
                        SnapshotChunksFile.encodeChunkRecord(fileIdentifier, offset, size),
                    );
                }
                chunks.push(currentChunk);
                currentChunk = [];
                currentChunkSize = 0;
                offset += size;
                remainingSize -= size;
            }
            if (remainingSize) {
                currentChunk.push(
                    SnapshotChunksFile.encodeChunkRecord(fileIdentifier, offset, remainingSize),
                );
                currentChunkSize += remainingSize;
            }
        }

        if (currentChunkSize) {
            chunks.push(currentChunk);
        }

        const chunksFilePath = path.join(this.path, this.getFilePrefix(height) + CHUNKS_SUFFIX);
        const chunksFile = new SnapshotChunksFile(chunksFilePath);
        await chunksFile.create(height, chunks);

        return { chunks: chunks.length + 1, chunksFilePath };
    }

    /**
     * Gets a the SHA256 of a given file as a Uint8Array.
     */
    private async getFileSha256(filePath: string) {
        const readStream = fs.createReadStream(filePath);
        const hash = crypto.createHash('sha256');

        await stream.pipeline(readStream, hash);

        return new Uint8Array(hash.digest());
    }

    /**
     * Gets the snapshot file prefix for a given height.
     */
    private getFilePrefix(height: number) {
        return SNAPSHOT_PREFIX + height.toString(10).padStart(9, '0');
    }

    private async getSnapshotEntriesFromDirectory() {
        await mkdir(this.path, { recursive: true });
        return await readdir(this.path, { withFileTypes: true });
    }

    /**
     * Creates the path to snapshots (if it doesn't exist yet)
     */
    async createPath() {
        try {
            await access(this.path, fs.constants.F_OK);
        } catch (error) {
            await mkdir(this.path, { recursive: true });
        }
    }
}
