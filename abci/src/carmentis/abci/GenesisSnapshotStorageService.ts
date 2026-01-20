import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { EncoderFactory } from '@cmts-dev/carmentis-sdk/server';
import { NodeConfigService } from '../config/services/NodeConfigService';
import { StoredGenesisSnapshot, StoredGenesisSnapshotSchema } from './types/valibot/StoredGenesisSnapshot';
import * as v from 'valibot';



@Injectable()
export class GenesisSnapshotStorageService {

    private logger: Logger = new Logger(GenesisSnapshotStorageService.name);

    constructor(
        private readonly nodeConfig: NodeConfigService,
    ) {
    }

    private get genesisSnapshotPath() {
        const {genesisSnapshotFilePath} = this.nodeConfig.getStoragePaths();
        return genesisSnapshotFilePath;
    }

    async writeGenesisSnapshotChunksToDiskFromEncodedChunks(chunks: Uint8Array[]) {
        const base64Encoder = EncoderFactory.bytesToBase64Encoder();
        const genesisSnapshot : StoredGenesisSnapshot = {
            base64EncodedChunks: chunks.map((chunk) => base64Encoder.encode(chunk)),
        }
        return await this.writeGenesisSnapshotToDisk(genesisSnapshot);
    }
    
    async writeGenesisSnapshotToDisk(data: StoredGenesisSnapshot) {
        this.logger.verbose(`Writing genesis snapshot to ${this.genesisSnapshotPath}`);
        try {
            const dir = path.dirname(this.genesisSnapshotPath);
            await mkdir(dir, { recursive: true });
            const json = JSON.stringify(data, null, 2);
            this.logger.verbose(`Genesis snapshot size as JSON: ${json.length} bytes`);
            await writeFile(this.genesisSnapshotPath, json, { encoding: 'utf8' });
        } catch (error) {
            const msg = error instanceof Error ? error.message : (typeof error === 'string' ? error : JSON.stringify(error));
            this.logger.error(`Failed to write genesis snapshot: ${msg}`);
            throw error;
        }
    }
    
    async readGenesisSnapshotFromDisk(): Promise<StoredGenesisSnapshot> {
        this.logger.verbose(`Reading genesis snapshot from ${this.genesisSnapshotPath}`);
        try {
            const content = await readFile(this.genesisSnapshotPath, { encoding: 'utf8' });
            return v.parse(StoredGenesisSnapshotSchema, JSON.parse(content));
        } catch (error) {
            const msg = error instanceof Error ? error.message : (typeof error === 'string' ? error : JSON.stringify(error));
            this.logger.error(`Failed to read genesis snapshot: ${msg}`);
            throw error;
        }
    }
}