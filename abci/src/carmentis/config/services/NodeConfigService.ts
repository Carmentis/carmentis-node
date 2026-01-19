import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConfigSchema, NodeConfig } from '../types/NodeConfig';
import process from 'node:process';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as toml from '@iarna/toml';
import * as v from 'valibot';

@Injectable()
export class NodeConfigService implements OnModuleInit {
    private nodeConfig?: NodeConfig;
    private logger = new Logger(NodeConfigService.name);

    constructor() {}

    onModuleInit(): void {
        this.loadConfigFile();
    }

    private loadConfigFile() {
        this.logger.log('Initializing Node Config...');
        // for resilience, we search through multiple possible config files.
        // Some filenames might be undefined due to access to env variables that might be undefined./
        const candidatesConfigFilenames: (string | undefined)[] = [
            process.env['ABCI_CONFIG_FILENAME'],
            process.env['NODE_CONFIG_FILENAME'],
            'config.toml',
            'abci-config.toml',
            'node-config.toml',
        ];

        // we construct the candidates config file paths.
        // Be aware that the order of candidates is important since we accept the first valid one, other are ignored.
        const candidatesConfigFilePaths: string[] = [];

        // At the top priority, we check if the user has specified a config file path using an environment variable.
        const specifiedConfigPath =
            process.env['ABCI_CONFIG'] || process.env['NODE_CONFIG'] || undefined;
        if (specifiedConfigPath !== undefined) {
            candidatesConfigFilePaths.push(specifiedConfigPath);
        }

        // we exclude undefined filenames and appends the current working directory to each filename.
        const currentWorkDirectory = process.cwd();
        const filteredCurrentDirectoryCandidatesPaths = candidatesConfigFilenames
            .filter((filename) => filename !== undefined)
            .map((filename) => join(currentWorkDirectory, filename));
        candidatesConfigFilePaths.push(...filteredCurrentDirectoryCandidatesPaths);

        // we now search for the first config file that exists.
        for (const configPath of candidatesConfigFilePaths) {
            try {
                this.logger.log(`Loading config file from ${configPath}`);
                const config = readFileSync(configPath, 'utf8');
                const parsedConfig = toml.parse(config) as Record<string, any>;
                this.nodeConfig = v.parse(ConfigSchema, parsedConfig);
                return;
            } catch (e) {
                if (e instanceof Error) {
                    this.logger.warn(`Failed to load config file from ${configPath}: ${e.message}`);
                } else {
                    this.logger.warn(`Failed to load config file`);
                }
            }
        }

        // if we reach this point, we have not found a valid config file.
        // we throw an error.
        const formattedSearchedCandidates = candidatesConfigFilePaths.join(', ');
        throw new Error(
            `Failed to load config file from any of the following paths: ${formattedSearchedCandidates}`,
        );
    }

    /**
     * Retrieves the gRPC port specified in the node configuration. If the port is not defined or is invalid, returns the provided default port.
     *
     * @param {number} defaultPort - The default port to be used if no valid port is specified in the configuration.
     * @return {number} The gRPC port from the configuration, or the provided default port if the configuration does not specify a valid port.
     */
    getGrpcPortOrDefault(defaultPort: number): number {
        const specifiedGrpcPort = this.config.abci?.grpc?.port;
        return typeof specifiedGrpcPort === 'number' ? specifiedGrpcPort : defaultPort;
    }

    /**
     * Retrieves the REST ABCI query port from the configuration, or returns the specified default port if none is configured.
     *
     * @param {number} defaultPort - The default port to return if no valid port is configured.
     * @return {number} The configured REST ABCI query port, or the provided default port.
     */
    getRestAbciQueryPortOrDefault(defaultPort: number): number {
        const specifiedPort = this.config.abci?.query?.rest?.port;
        return typeof specifiedPort === 'number' ? specifiedPort : defaultPort;
    }

    /**
     * Retrieves the file path for the genesis runoff configuration.
     *
     * @return {string} The file path to the genesis runoff file as defined in the node configuration.
     */
    getGenesisRunoffFilePath(): string {
        return this.genesisConfig.runoffFilePath;
    }

    /**
     * Retrieves the exposed RPC endpoint used by CometBFT.
     *
     * The RPC endpoint shows a page listing all operations performed by CometBFT.
     */
    getCometbftExposedRpcEndpoint(): string {
        return this.cometbftConfig.exposed_rpc_endpoint;
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
        const specifiedPaths = this.pathsConfig;
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
        };
    }

    getCometBFTHome() {
        return this.pathsConfig.cometbft_home;
    }

    isGenesisPrivateKeyRetrievalMethodSpecified(): boolean {
        const genesisSection = this.config.genesis;
        return genesisSection !== undefined;
    }

    /**
     * Retrieves the private key retrieval method from the genesis section of the node configuration,
     * if the genesis section is specified.
     *
     */
    getSpecifiedGenesisPrivateKeyRetrievalMethod(): { sk?: string; path?: string; env?: string } {
        const unspecifiedPrivateKeyRetrievalMethod = { sk: undefined, path: undefined };
        const genesisSection = this.config.genesis;
        const isGenesisSectionSpecified = genesisSection !== undefined;
        if (!isGenesisSectionSpecified) return unspecifiedPrivateKeyRetrievalMethod;
        return genesisSection.private_key;
    }

    /**
     * This method retrieves the RPC endpoint for the genesis snapshot from the node configuration.
     */
    getGenesisSnapshotRpcEndpoint() {
        return this.genesisSnapshotConfig.rpc_endpoint;
    }

    getSnapshotBlockPeriod() {
        return this.snapshotConfig.snapshot_block_period;
    }

    getMaxSnapshots() {
        return this.snapshotConfig.max_snapshots;
    }

    getBlockHistoryBeforeSnapshot() {
        return this.snapshotConfig.block_history_before_snapshot;
    }

    /**
     * Retrieves the complete node configuration.
     *
     * @return {NodeConfig} The complete node configuration object.
     */
    getConfig(): NodeConfig {
        if (this.nodeConfig === undefined) throw new Error('Node config is not initialized yet.');
        return this.nodeConfig;
    }

    private get pathsConfig() {
        const pathsConfig = this.config.paths;
        if (pathsConfig === undefined) throw new Error('Paths config is not initialized yet.');
        return pathsConfig;
    }

    private get snapshotConfig() {
        const snapshotConfig = this.config.snapshots;
        if (snapshotConfig === undefined)
            throw new Error('Snapshot config is not initialized yet.');
        return snapshotConfig;
    }

    private get genesisConfig() {
        const genesisConfig = this.config.genesis;
        if (genesisConfig === undefined) throw new Error('Genesis config is not initialized yet.');
        return genesisConfig;
    }

    private get genesisSnapshotConfig() {
        const genesisSnapshotConfig = this.config.genesis_snapshot;
        if (genesisSnapshotConfig === undefined)
            throw new Error('Genesis snapshot config is not initialized yet.');
        return genesisSnapshotConfig;
    }

    private get cometbftConfig() {
        const cometbftConfig = this.config.cometbft;
        if (cometbftConfig === undefined)
            throw new Error('CometBFT config is not initialized yet.');
        return cometbftConfig;
    }

    private get config() {
        if (this.nodeConfig === undefined) throw new Error('Node config is not initialized yet.');
        return this.nodeConfig;
    }

    static createFromConfig(genesisNodeConfig: NodeConfig) {
        const config = new NodeConfigService();
        config.nodeConfig = genesisNodeConfig;
        return config;
    }

    isGenesisRunoffFilePathSpecified() {
        return this.config.genesis !== undefined && this.config.genesis.runoffFilePath !== undefined;
    }
}
