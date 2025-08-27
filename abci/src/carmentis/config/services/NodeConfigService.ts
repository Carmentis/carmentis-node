import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConfigSchema, NodeConfig } from '../types/NodeConfig';
import process from 'node:process';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as toml from '@iarna/toml';

@Injectable()
export class NodeConfigService {
    private nodeConfig: NodeConfig;
    private logger = new Logger(NodeConfigService.name);

    constructor() {
        // We use the TOML config file by default but allow the user to override it with an environment variable.
        const TOML_CONFIG_FILENAME =
            process.env['ABCI_CONFIG'] || process.env['NODE_CONFIG'] || 'abci-config.toml';

        try {
            const configPath = join(process.cwd(), TOML_CONFIG_FILENAME);
            this.logger.log(`Loading config file from ${configPath}`);
            const config = readFileSync(configPath, 'utf8');
            const parsedConfig = toml.parse(config) as Record<string, any>;
            this.nodeConfig = ConfigSchema.parse(parsedConfig);
        } catch (e) {
            if (e instanceof Error) {
                throw new Error(`Failed to parse config file: ${e.message}`);
            } else {
                throw new Error(`Failed to parse config file`);
            }
        }
    }


    /**
     * Retrieves the gRPC port specified in the node configuration. If the port is not defined or is invalid, returns the provided default port.
     *
     * @param {number} defaultPort - The default port to be used if no valid port is specified in the configuration.
     * @return {number} The gRPC port from the configuration, or the provided default port if the configuration does not specify a valid port.
     */
    getGrpcPortOrDefault(defaultPort: number): number {
        const specifiedGrpcPort = this.nodeConfig.abci.grpc.port;
        return typeof specifiedGrpcPort === 'number' ? specifiedGrpcPort : defaultPort;
    }

    /**
     * Retrieves the REST ABCI query port from the configuration, or returns the specified default port if none is configured.
     *
     * @param {number} defaultPort - The default port to return if no valid port is configured.
     * @return {number} The configured REST ABCI query port, or the provided default port.
     */
    getRestAbciQueryPortOrDefault(defaultPort: number): number {
        const specifiedPort = this.nodeConfig.abci.query.rest.port;
        return typeof specifiedPort === 'number' ? specifiedPort : defaultPort;
    }


    /**
     * Retrieves various storage paths configured for the application.
     *
     * @return {Object} An object containing the following paths:
     * - rootStoragePath: The root directory for storage.
     * - snapshotStoragePath: The directory for snapshot storage.
     * - dbStoragePath: The directory for database storage.
     * - microblocksStoragePath: The directory for microblocks storage.
     * - genesisSnapshotFilePath: The file path for the genesis snapshot.
     */
    getStoragePaths() {
        const specifiedPaths = this.nodeConfig.paths;
        const rootStoragePath = specifiedPaths.storage;
        const snapshotStoragePath = join(
            rootStoragePath,
            specifiedPaths.storage_relative_snapshots_folder,
        );
        const dbStoragePath = join(rootStoragePath, specifiedPaths.storage_relative_db_folder);
        const microblocksStoragePath = join(
            rootStoragePath,
            specifiedPaths.storage_relative_microblocks_folder,
        );
        const genesisSnapshotFilePath = join(
            rootStoragePath,
            specifiedPaths.storage_relative_genesis_snapshot_file,
        );

        return {
            rootStoragePath,
            snapshotStoragePath,
            dbStoragePath,
            microblocksStoragePath,
            genesisSnapshotFilePath,
        }
    }

    getCometBFTHome() {
        return this.nodeConfig.paths.cometbft_home;
    }


    /**
     * Retrieves the private key retrieval method from the genesis section of the node configuration,
     * if the genesis section is specified.
     *
     */
    getSpecifiedGenesisPrivateKeyRetrievalMethod(): { sk?: string, path?: string } {
        const unspecifiedPrivateKeyRetrievalMethod = { sk: undefined, path: undefined };
        const genesisSection = this.nodeConfig.genesis;
        const isGenesisSectionSpecified = genesisSection !== undefined;
        if (!isGenesisSectionSpecified) return unspecifiedPrivateKeyRetrievalMethod;
        return genesisSection.private_key;
    }

    /**
     * This method retrieves the RPC endpoint for the genesis snapshot from the node configuration.
     */
    getGenesisSnapshotRpcEndpoint() {
        return this.nodeConfig.genesis_snapshot.rpc_endpoint;
    }
}