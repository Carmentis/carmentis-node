import { SnapshotChunkProcessingStrategyInterface } from './SnapshotChunkProcessingStrategyInterface';

export class TotalSizeSnapshotStrategy implements SnapshotChunkProcessingStrategyInterface{
    private chunkSize: number = 0;

    async run(fileIdentifier: number, offset: number, size: number) : Promise<void> {
        this.chunkSize += size;
    }

    getChunkSize() : number {
        return this.chunkSize;
    }
}