import fs from 'node:fs';
import crypto from 'node:crypto';
import stream from 'node:stream/promises';
import { FileHandle, access, mkdir, open, rename, readdir } from 'node:fs/promises';
import path from 'path';
import { LevelDb } from './levelDb';
import { NODE_SCHEMAS } from './constants/constants';

import {
    SCHEMAS,
    SchemaUnserializer,
    Crypto,
    Utils,
} from '@cmts-dev/carmentis-sdk/server';

const FORMAT = 1;
const MAX_CHUNK_SIZE = 4096; // 10 * 1024 * 1024;

const CHUNK_HEIGHT_LENGTH = 6;
const CHUNK_COUNT_LENGTH = 4;
const CHUNK_INDEX_LENGTH = 4;
const CHUNK_FILE_IDENTIFIER_LENGTH = 4;
const CHUNK_OFFSET_LENGTH = 6;
const CHUNK_SIZE_LENGTH = 4;
const CHUNK_RECORD_LENGTH = CHUNK_FILE_IDENTIFIER_LENGTH + CHUNK_OFFSET_LENGTH + CHUNK_SIZE_LENGTH;

export class Snapshot {
    db: LevelDb;
    path: string;

    constructor(db: LevelDb, path: string) {
        this.db = db;
        this.path = path;
    }

    /**
      * Gets the list of snapshots stored by this node.
      */
    async getList() {
        const entries = await readdir(this.path, { withFileTypes: true });
        const list = [];

        for(const entry of entries) {
            if(!entry.isFile() || !/^snapshot-\d{9}\.json$/.test(entry.name)) {
                continue;
            }

            const filePath = path.join(this.path, entry.name);

            try {
                const content = fs.readFileSync(filePath);
                const object = JSON.parse(content.toString());

                list.push({
                    height: object.height,
                    format: object.format,
                    chunks: object.chunks,
                    hash: Utils.binaryFromHexa(object.hash),
                    metadata: new Uint8Array()
                });
            }
            catch(error) {
            }
        }
        return list;
    }

    /**
      * Gets a snapshot chunk stored by this node.
      */
    async getChunk(height: number, index: number) {
        const jsonFilePath = path.join(this.path, this.getFilePrefix(height) + '.json');

        try {
            const content = fs.readFileSync(jsonFilePath);
            const object = JSON.parse(content.toString());
        }
        catch(error) {
            console.error(error);
            return;
        }

        const chunksFilePath = path.join(this.path, this.getFilePrefix(height) + '-chunks.bin');
        const handle = await open(chunksFilePath, 'r');
        const buffer = new Uint8Array(CHUNK_RECORD_LENGTH);

        // read the header (height and chunks count)
        await handle.read(buffer, 0, CHUNK_HEIGHT_LENGTH + CHUNK_COUNT_LENGTH, 0);

        const readHeight = Utils.byteArrayToInt([...buffer.slice(0, CHUNK_HEIGHT_LENGTH)]);
        const chunksCount = Utils.byteArrayToInt([...buffer.slice(CHUNK_HEIGHT_LENGTH, CHUNK_HEIGHT_LENGTH + CHUNK_COUNT_LENGTH)]);

        if(readHeight != height) {
            console.error("internal error: height field is inconsistent");
            return;
        }
        if(index < 0 || index >= chunksCount) {
            console.error("requested chunk index is inconsistent");
            return;
        }

        // get the initial and maximum pointers from the index
        const indexPointer = CHUNK_HEIGHT_LENGTH + CHUNK_COUNT_LENGTH + index * CHUNK_INDEX_LENGTH;
        await handle.read(buffer, 0, CHUNK_INDEX_LENGTH, indexPointer);
        let pointer = Utils.byteArrayToInt([...buffer.slice(0, CHUNK_INDEX_LENGTH)]);

        let maxPointer;

        if(index == chunksCount - 1) {
            const stats = await handle.stat();
            maxPointer = stats.size;
        }
        else {
            await handle.read(buffer, 0, CHUNK_INDEX_LENGTH, indexPointer + CHUNK_INDEX_LENGTH);
            maxPointer = Utils.byteArrayToInt([...buffer.slice(0, CHUNK_INDEX_LENGTH)]);
        }

        // read the chunk records
        let chunkSize = 0;

        for(; pointer < maxPointer; pointer += CHUNK_RECORD_LENGTH) {
            await handle.read(buffer, 0, CHUNK_RECORD_LENGTH, pointer);
            const { fileIdentifier, offset, size } = this.decodeChunkRecord(buffer);
            console.log(fileIdentifier, offset, size);
            chunkSize += size;
        }
        await handle.close();

        if(chunkSize > MAX_CHUNK_SIZE) {
            console.error("internal error: chunk size is inconsistent");
            return;
        }
    }

    /**
      * Loads a snapshot chunk from another node.
      */
    async loadChunk(chunk: Uint8Array) {
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
        try {
            try {
                await access(this.path, fs.constants.F_OK);
            }
            catch(error) {
                await mkdir(this.path, { recursive: true });
            }

            const { height, files, earliestFileDate, dbFilePath } = await this.createDbFile();
            const { chunks, chunksFilePath } = await this.createChunksFile(height, files);
            const dbFileSha256 = await this.getFileSha256(dbFilePath);
            const chunksFileSha256 = await this.getFileSha256(chunksFilePath);
            const hash = Crypto.Hashes.sha256(Utils.binaryFrom(dbFileSha256, chunksFileSha256));

            const snapshotObject = {
                height,
                format: FORMAT,
                chunks,
                hash,
                metadata: {},
                earliestFileDate
            };

            const jsonFilePath = path.join(this.path, this.getFilePrefix(height) + '.json');
            fs.writeFileSync(jsonFilePath, JSON.stringify(snapshotObject, null, 2));
        }
        catch (err) {
            console.error(err);
        }
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
        const dataFileUnserializer = new SchemaUnserializer(NODE_SCHEMAS.DB[NODE_SCHEMAS.DB_DATA_FILE]);

        const temporaryPath = path.join(this.path, `snapshot-in-progress-db.bin`);
        const handle = await open(temporaryPath, 'w');

        const iterator = this.db.getDbIterator();
        const files = [];
        let earliestFileIdentifier = 0xFF000000;
        let height;
        let size = 0;

        for await (const [key, value] of iterator) {
            await handle.write(new Uint8Array(Utils.intToByteArray(key.length, 2)));
            await handle.write(key);
            await handle.write(new Uint8Array(Utils.intToByteArray(value.length, 2)));
            await handle.write(value);

            size += key.length + value.length + 4;

            // if this is the DB_CHAIN_INFORMATION record, collect the height
            if(key[1] == chainInfoTableChar0 && key[2] == chainInfoTableChar1) {
                const chainInfoUnserializer = new SchemaUnserializer(NODE_SCHEMAS.DB[NODE_SCHEMAS.DB_CHAIN_INFORMATION]);
                const chainInfoObject: any = chainInfoUnserializer.unserialize(value);
                height = chainInfoObject.height;
            }
            // if this is a DB_DATA_FILE record, collect the file identifier and size
            else if(key[1] == dataFileTableChar0 && key[2] == dataFileTableChar1) {
                const fileIdentifier = [ 4, 5, 6, 7 ].reduce((t, n) => t * 0x100 + key[n], 0);
                const dataFileObject: any = dataFileUnserializer.unserialize(value);
                files.push([ fileIdentifier, dataFileObject.fileSize ]);
                earliestFileIdentifier = Math.min(earliestFileIdentifier, fileIdentifier);
            }
        }
        await handle.close();

        const dbFilePath = path.join(this.path, this.getFilePrefix(height) + '-db.bin');
        await rename(temporaryPath, dbFilePath);

        files.push([ 0, size ]);

        const [ earliestYear, earliestMonth, earliestDay ] = Utils.decodeDay(earliestFileIdentifier);
        const earliestFileDate =
          earliestYear.toString(10) +
          earliestMonth.toString(10).padStart(2, "0") +
          earliestDay.toString(10).padStart(2, "0");

        return { height, files, earliestFileDate, dbFilePath };
    }

    /**
      * Creates the chunks file.
      */
    private async createChunksFile(height: number, files: [number, number][]) {
        let chunks = [];
        let currentChunk = [];
        let currentChunkSize = 0;

        for(const [ fileIdentifier, fileSize ] of files) {
            let remainingSize = fileSize;
            let offset = 0;

            while(currentChunkSize + remainingSize > MAX_CHUNK_SIZE) {
                let size = MAX_CHUNK_SIZE - currentChunkSize;
                if(size) {
                    currentChunk.push(this.encodeChunkRecord(fileIdentifier, offset, size));
                }
                chunks.push(currentChunk);
                currentChunk = [];
                currentChunkSize = 0;
                offset += size;
                remainingSize -= size;
            }
            if(remainingSize) {
                currentChunk.push(this.encodeChunkRecord(fileIdentifier, offset, remainingSize));
                currentChunkSize += remainingSize;
            }
        }

        if(currentChunkSize) {
            chunks.push(currentChunk);
        }

        const chunksFilePath = path.join(this.path, this.getFilePrefix(height) + '-chunks.bin');
        const handle = await open(chunksFilePath, 'w');

        // write the header (height and chunks count)
        await handle.write(new Uint8Array(Utils.intToByteArray(height, CHUNK_HEIGHT_LENGTH)));
        await handle.write(new Uint8Array(Utils.intToByteArray(chunks.length, CHUNK_COUNT_LENGTH)));

        // write the index
        let pointer = CHUNK_HEIGHT_LENGTH + CHUNK_COUNT_LENGTH + chunks.length * CHUNK_INDEX_LENGTH;

        for(const chunk of chunks) {
            await handle.write(new Uint8Array(Utils.intToByteArray(pointer, CHUNK_INDEX_LENGTH)));
            pointer += chunk.length * CHUNK_RECORD_LENGTH;
        }

        // write the chunks
        for(const chunk of chunks) {
            for(const record of chunk) {
                await handle.write(record);
            }
        }

        await handle.close();

        return { chunks: chunks.length, chunksFilePath };
    }

    /**
      * Encodes a chunk record.
      */
    private encodeChunkRecord(fileIdentifier: number, offset: number, size: number) {
        const record = new Uint8Array(CHUNK_RECORD_LENGTH);

        record.set(new Uint8Array(Utils.intToByteArray(fileIdentifier, CHUNK_FILE_IDENTIFIER_LENGTH)), 0);
        record.set(new Uint8Array(Utils.intToByteArray(offset, CHUNK_OFFSET_LENGTH)), CHUNK_FILE_IDENTIFIER_LENGTH);
        record.set(new Uint8Array(Utils.intToByteArray(size, CHUNK_SIZE_LENGTH)), CHUNK_FILE_IDENTIFIER_LENGTH + CHUNK_OFFSET_LENGTH);

        return record;
    }

    /**
      * Decodes a chunk record.
      */
    private decodeChunkRecord(record: Uint8Array) {
        let pointer = 0;
        const fileIdentifier = Utils.byteArrayToInt([...record.slice(pointer, pointer += CHUNK_FILE_IDENTIFIER_LENGTH)]);
        const offset = Utils.byteArrayToInt([...record.slice(pointer, pointer += CHUNK_OFFSET_LENGTH)]);
        const size = Utils.byteArrayToInt([...record.slice(pointer, pointer += CHUNK_SIZE_LENGTH)]);

        return { fileIdentifier, offset, size };
    }

    private async getFileSha256(filePath: string) {
        const readStream = fs.createReadStream(filePath);
        const hash = crypto.createHash('sha256');
        
        await stream.pipeline(readStream, hash);

        return new Uint8Array(hash.digest());
    }

    /**
      * Gets a snapshot file prefix.
      */
    private getFilePrefix(height: number) {
        return 'snapshot-' + height.toString(10).padStart(9, "0");
    }
}
