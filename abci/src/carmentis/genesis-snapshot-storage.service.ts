import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvService } from './EnvService';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { GenesisSnapshotDTO } from '@cmts-dev/carmentis-sdk/server';

@Injectable()
export class GenesisSnapshotStorageService {

    private logger: Logger = new Logger(GenesisSnapshotStorageService.name);
    private readonly genesisSnapshotFileName: string  = 'genesis-snapshot.json';
    private readonly genesisSnapshotPath: string;

    constructor(
        env: EnvService,
    ) {
        this.genesisSnapshotPath = path.join(
            env.getDefaultStorageFolderPath(),
            this.genesisSnapshotFileName
        );
    }
    
    async writeGenesisSnapshotInDisk(data: GenesisSnapshotDTO) {
        this.logger.verbose(`Writing genesis snapshot to ${this.genesisSnapshotPath}`);
        try {
            const dir = path.dirname(this.genesisSnapshotPath);
            await mkdir(dir, { recursive: true });
            const json = JSON.stringify(data, null, 2);
            await writeFile(this.genesisSnapshotPath, json, { encoding: 'utf8' });
        } catch (error) {
            const msg = error instanceof Error ? error.message : (typeof error === 'string' ? error : JSON.stringify(error));
            this.logger.error(`Failed to write genesis snapshot: ${msg}`);
            throw error;
        }
    }
    
    async readGenesisSnapshotFromDisk(): Promise<GenesisSnapshotDTO> {
        this.logger.verbose(`Reading genesis snapshot from ${this.genesisSnapshotPath}`);
        try {
            const content = await readFile(this.genesisSnapshotPath, { encoding: 'utf8' });
            const data: GenesisSnapshotDTO = JSON.parse(content);
            return data;
        } catch (error) {
            const msg = error instanceof Error ? error.message : (typeof error === 'string' ? error : JSON.stringify(error));
            this.logger.error(`Failed to read genesis snapshot: ${msg}`);
            throw error;
        }
    }
    

}