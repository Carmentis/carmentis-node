import { FileHandle, open } from 'node:fs/promises';
import { getLogger } from '@logtape/logtape';

/**
  This class allows reading a file that may have updates (i.e. pending transactions) that have not yet been flushed to disk.
  It is used during a storage challenge.
*/
export class ChallengeFile {
    private logger = getLogger(['node', 'challenge', ChallengeFile.name])
    private filePath: string;
    private handle?: FileHandle;
    private pendingData: Uint8Array;
    private size: number;

    constructor(filePath: string, pendingTxs: Uint8Array[]) {
        this.filePath = filePath;
        this.size = 0;
        const pendingDataSize = pendingTxs.reduce((sz, arr) => sz + arr.length, 0);
        this.pendingData = new Uint8Array(pendingDataSize);
        let ptr = 0;

        pendingTxs.forEach(arr => {
            this.pendingData.set(arr, ptr);
            ptr += arr.length;
        });
    }

    async open() {
        try {
            this.handle = await open(this.filePath, 'r');
            const stats = await this.handle.stat();
            this.size = stats.size;
        }
        catch(err) {
            this.handle = undefined;
            this.size = 0;
        }
    }

    async read(buffer: Uint8Array, bufferOffset: number, size: number, fileOffset: number) {
        // reject if the handle is not open
        if (!this.handle) {
            this.logger.warn(`Attempt to read at file ${this.filePath} but handle is not defined: aborting`)
            throw new Error(`Cannot read at ${this.filePath}: handle not open`)
        }

        let bytesRead = 0;
        const sizeToReadFromDisk = Math.max(0, Math.min(fileOffset + size, this.size) - fileOffset);

        if(sizeToReadFromDisk) {
            const rd = await this.handle.read(buffer, bufferOffset, sizeToReadFromDisk, fileOffset);
            bytesRead += rd.bytesRead;
            bufferOffset += sizeToReadFromDisk;
            fileOffset += sizeToReadFromDisk;
        }

        const sizeToReadFromPendingData = size - sizeToReadFromDisk;

        if(sizeToReadFromPendingData) {
            const pendingDataOffset = fileOffset - this.size;
            const pendingDataSlice = this.pendingData.slice(pendingDataOffset, pendingDataOffset + sizeToReadFromPendingData);
            buffer.set(pendingDataSlice, bufferOffset);
            bytesRead += pendingDataSlice.length;
        }

        return { bytesRead };
    }

    async close() {
        if (this.handle) {
            await this.handle.close();
            this.handle = undefined;
        }
    }
}
