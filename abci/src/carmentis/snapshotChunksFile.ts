import fs from 'node:fs';
import stream from 'node:stream/promises';
import { FileHandle, open } from 'node:fs/promises';
import path from 'path';

import {
    Utils
} from '@cmts-dev/carmentis-sdk/server';

const CHUNK_HEIGHT_LENGTH = 6;
const CHUNK_COUNT_LENGTH = 4;
const CHUNK_INDEX_LENGTH = 4;
const CHUNK_FILE_IDENTIFIER_LENGTH = 4;
const CHUNK_OFFSET_LENGTH = 6;
const CHUNK_SIZE_LENGTH = 4;
const CHUNK_RECORD_LENGTH = CHUNK_FILE_IDENTIFIER_LENGTH + CHUNK_OFFSET_LENGTH + CHUNK_SIZE_LENGTH;

export class SnapshotChunksFile {
    filePath: string;

    constructor(filePath: string) {
        this.filePath = filePath;
    }

    /**
      * Creates a new chunks file, given a height and a list of chunks.
      */
    async create(height: number, chunks: any[]) {
        const handle = await open(this.filePath, 'w');

        // write the header (height and chunks count)
        await handle.write(new Uint8Array(Utils.intToByteArray(height, CHUNK_HEIGHT_LENGTH)));
        await handle.write(new Uint8Array(Utils.intToByteArray(chunks.length, CHUNK_COUNT_LENGTH)));

        // write the index
        let pointer = CHUNK_HEIGHT_LENGTH + CHUNK_COUNT_LENGTH + chunks.length * CHUNK_INDEX_LENGTH;

        for(const chunk of chunks) {
            await handle.write(new Uint8Array(Utils.intToByteArray(pointer, CHUNK_INDEX_LENGTH)));
            pointer += chunk.length * CHUNK_RECORD_LENGTH;
        }

        // write the records
        for(const chunk of chunks) {
            for(const record of chunk) {
                await handle.write(record);
            }
        }

        await handle.close();
    }

    /**
      * Gets information about the chunks file: height, chunks count and file size.
      */
    async getInformation() {
        const handle = await open(this.filePath, 'r');
        const fileSize = (await handle.stat()).size;
        const buffer = new Uint8Array(CHUNK_HEIGHT_LENGTH + CHUNK_COUNT_LENGTH);
        await handle.read(buffer, 0, CHUNK_HEIGHT_LENGTH + CHUNK_COUNT_LENGTH, 0);
        await handle.close();

        const height = Utils.byteArrayToInt([...buffer.slice(0, CHUNK_HEIGHT_LENGTH)]);
        const chunksCount = Utils.byteArrayToInt([...buffer.slice(CHUNK_HEIGHT_LENGTH, CHUNK_HEIGHT_LENGTH + CHUNK_COUNT_LENGTH)]);

        return { height, chunksCount, fileSize };
    }

    /**
      * Gets the full content of the chunks file.
      */
    async getFullContent() {
        const { fileSize } = await this.getInformation();
        const handle = await open(this.filePath, 'r');
        const buffer = new Uint8Array(fileSize);
        await handle.read(buffer, 0, fileSize, 0);
        await handle.close();

        return buffer;
    }

    /**
      * Invokes a callback function on each record of a given chunk.
      */
    async processChunk(index: number, callback: (fileIdentifier: number, offset: number, size: number) => void) {
        const info = await this.getInformation();
        const handle = await open(this.filePath, 'r');

        // get the initial and maximum pointers from the index
        const buffer = new Uint8Array(CHUNK_RECORD_LENGTH);
        const indexPointer = CHUNK_HEIGHT_LENGTH + CHUNK_COUNT_LENGTH + index * CHUNK_INDEX_LENGTH;
        await handle.read(buffer, 0, CHUNK_INDEX_LENGTH, indexPointer);
        let pointer = Utils.byteArrayToInt([...buffer.slice(0, CHUNK_INDEX_LENGTH)]);

        let maxPointer;

        if(index == info.chunksCount - 1) {
            maxPointer = info.fileSize;
        }
        else {
            await handle.read(buffer, 0, CHUNK_INDEX_LENGTH, indexPointer + CHUNK_INDEX_LENGTH);
            maxPointer = Utils.byteArrayToInt([...buffer.slice(0, CHUNK_INDEX_LENGTH)]);
        }

        // read the chunk records
        for(; pointer < maxPointer; pointer += CHUNK_RECORD_LENGTH) {
            await handle.read(buffer, 0, CHUNK_RECORD_LENGTH, pointer);
            const { fileIdentifier, offset, size } = SnapshotChunksFile.decodeChunkRecord(buffer);
            await callback(fileIdentifier, offset, size);
        }
        await handle.close();
    }

    /**
      * Encodes a chunk record.
      */
    static encodeChunkRecord(fileIdentifier: number, offset: number, size: number) {
        const record = new Uint8Array(CHUNK_RECORD_LENGTH);

        record.set(new Uint8Array(Utils.intToByteArray(fileIdentifier, CHUNK_FILE_IDENTIFIER_LENGTH)), 0);
        record.set(new Uint8Array(Utils.intToByteArray(offset, CHUNK_OFFSET_LENGTH)), CHUNK_FILE_IDENTIFIER_LENGTH);
        record.set(new Uint8Array(Utils.intToByteArray(size, CHUNK_SIZE_LENGTH)), CHUNK_FILE_IDENTIFIER_LENGTH + CHUNK_OFFSET_LENGTH);

        return record;
    }

    /**
      * Decodes a chunk record.
      */
    static decodeChunkRecord(record: Uint8Array) {
        let pointer = 0;
        const fileIdentifier = Utils.byteArrayToInt([...record.slice(pointer, pointer += CHUNK_FILE_IDENTIFIER_LENGTH)]);
        const offset = Utils.byteArrayToInt([...record.slice(pointer, pointer += CHUNK_OFFSET_LENGTH)]);
        const size = Utils.byteArrayToInt([...record.slice(pointer, pointer += CHUNK_SIZE_LENGTH)]);

        return { fileIdentifier, offset, size };
    }
}
