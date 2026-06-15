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
    private committedSize: number;

    constructor(filePath: string, committedSize: number) {
        this.filePath = filePath;
        this.committedSize = committedSize;
    }

    async open() {
        let size: number;
        try {
            this.handle = await open(this.filePath, 'r');
            const stats = await this.handle.stat();
            size = stats.size;
            this.logger.debug(`File ${this.filePath} opened successfully, size=${size}`);
        }
        catch(err) {
            this.logger.warn(`Failed to open file ${this.filePath}`);
            this.handle = undefined;
            size = 0;
        }
        if (size < this.committedSize) {
            await this.close();
            throw new Error(
                `PANIC - File '${this.filePath}' is too small: file size is ${size}, committed size is ${this.committedSize}`
            );
        }
    }

    /**
     * Reads a file from a given offset in a circular way, writing the data to a buffer.
     *
     * @param buffer - the buffer to write the data to
     * @param initialBufferOffset - the offset at which to write in the buffer
     * @param totalSizeToRead - the total size to be read
     * @param initialFileOffset - the offset from which to read the file
     */
    async readOrFail(buffer: Uint8Array, initialBufferOffset: number, totalSizeToRead: number, initialFileOffset: number) {
        // reject if the handle is not open
        if (!this.handle) {
            throw new Error(`Cannot read ${this.filePath}: handle not open`)
        }

        let remainingBytes = totalSizeToRead;
        let fileOffset = initialFileOffset;
        let bufferOffset = initialBufferOffset;

        while (remainingBytes) {
            const sizeToRead = Math.min(this.committedSize - fileOffset, remainingBytes);
            const rd = await this.handle.read(buffer, bufferOffset, sizeToRead, fileOffset);

            // NB: this makes the log very verbose
            // this.logger.debug(`reading ${sizeToRead} bytes at offset ${fileOffset} in file, writing at offset ${bufferOffset} in buffer`);

            if (rd.bytesRead < sizeToRead) {
                throw new Error(
                    `PANIC - Failed to read enough bytes from '${this.filePath}' during storage challenge: read ${rd.bytesRead}, expected ${sizeToRead}`
                );
            }

            bufferOffset += sizeToRead;

            // if there are more bytes to read, it means we've reached the committed size of the file and must restart at 0
            fileOffset = 0;
            remainingBytes -= sizeToRead;
        }
    }

    async close() {
        if (this.handle) {
            await this.handle.close();
            this.handle = undefined;
            this.logger.debug(`File ${this.filePath} closed`);
        }
        else {
            this.logger.warn(`Attempt to close not-opened file ${this.filePath}`);
        }
    }
}
