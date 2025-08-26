export interface SnapshotChunkProcessingStrategyInterface {
    run(fileIdentifier: number, offset: number, size: number): Promise<void>;
}
