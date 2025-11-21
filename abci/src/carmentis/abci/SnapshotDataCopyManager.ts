import { open } from 'node:fs/promises';
import path from 'path';
import { Logger } from '@nestjs/common';
import { getLogger } from '@logtape/logtape';

export class SnapshotDataCopyManager {
    private logger = getLogger(["node", "snapshot", SnapshotDataCopyManager.name])

    constructor() {
    }

    /**
     * Copies from a file to a buffer.
     */
    async copyFileToBuffer(
        filePath: string,
        buffer: Uint8Array,
        bufferOffset: number,
        fileOffset: number,
        size: number,
    ) {
        const shortFilePath = this.getShortFilePath(filePath);
        const fileAccessMode = 'r';
        const handle = await open(filePath, fileAccessMode);

        this.logger.debug(`Copying ${size} bytes from '${shortFilePath}' at offset ${fileOffset}`);

        const rd = await handle.read(buffer, bufferOffset, size, fileOffset);
        await handle.close();

        if (rd.bytesRead < size) {
            throw new Error(
                `copyFileToBuffer(): encountered end of file while reading ${size} bytes from '${shortFilePath}' at offset ${fileOffset}`
            );
        }
    }

    /**
     * Copies from a buffer to a file.
     */
    async copyBufferToFile(
        filePath: string,
        buffer: Uint8Array,
        bufferOffset: number,
        fileOffset: number,
        size: number,
    ) {
        const shortFilePath = this.getShortFilePath(filePath);
        const isWritingOnEmptyFile = fileOffset == 0;
        const fileAccessMode = isWritingOnEmptyFile ? 'w+' : 'a+';
        const handle = await open(filePath, fileAccessMode);
        const stats = await handle.stat();
        const fileSize = stats.size;

        this.logger.debug(`Copying ${size} bytes to '${shortFilePath}' at offset ${fileOffset}`);

        if (fileSize != fileOffset) {
            await handle.close();
            throw new Error(
                `copyBufferToFile(): offset ${fileOffset} doesn't match the current size (${fileSize}) of file '${shortFilePath}'`
            );
        }

        await handle.write(buffer, bufferOffset, size);
        await handle.close();
    }

    getShortFilePath(filePath) {
        return filePath.split(path.sep).slice(-2).join(path.sep);
    }
}
