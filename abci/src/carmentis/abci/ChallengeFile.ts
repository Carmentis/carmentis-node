import { FileHandle, open } from 'node:fs/promises';

/**
  This class allows reading a file that may have updates (i.e. pending transactions) that have not yet been flushed to disk.
  It is used during a storage challenge.
*/
export class ChallengeFile {
    filePath: string;
    handle: FileHandle;
    pendingData: Uint8Array;
    size: number;

    constructor(filePath: string, pendingTxs: Uint8Array[]) {
        this.filePath = filePath;

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
            this.handle = null;
            this.size = 0;
        }
    }

    async read(buffer: Uint8Array, bufferOffset: number, size: number, fileOffset: number) {
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
        if(this.handle !== null) {
            await this.handle.close();
        }
    }
}
