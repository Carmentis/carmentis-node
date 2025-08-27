import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import path from 'node:path';
import fs from 'node:fs/promises';
import { NodeConfigService } from '../config/services/NodeConfigService';

export interface TendermintPublicKey {
    type: string;
    value: string;
}

export interface GenesisValidator {
    address: string;
    pub_key: TendermintPublicKey;
    power: string;
    name: string;
}

export interface Genesis {
    genesis_time: string;
    chain_id: string;
    initial_height: string;
    validators: GenesisValidator[];
    app_hash: string;
}

/**
 * This service allows access to the CometBFT node configuration.
 * It is responsible for loading the validator public key and genesis information.
 */
@Injectable()
export class CometBFTNodeConfigService implements OnModuleInit {
    private readonly logger = new Logger(CometBFTNodeConfigService.name);
    private readonly nodeHome: string;
    private readonly genesisPath: string;
    private readonly cometbftKeyPath: string;

    private validatorPublicKey?: TendermintPublicKey;
    private genesis?: Genesis;

    constructor(private readonly nodeConfig: NodeConfigService) {
        this.nodeHome = this.nodeConfig.getCometBFTHome();
        this.genesisPath = path.join(this.nodeHome, 'config', 'genesis.json');
        this.cometbftKeyPath = path.join(this.nodeHome, 'config', 'priv_validator_key.json');
    }

    async onModuleInit(): Promise<void> {
        await Promise.all([this.loadValidatorPublicKey(), this.loadGenesis()]);
    }

    getPublicKey(): TendermintPublicKey {
        if (!this.validatorPublicKey) {
            throw new Error('Validator public key has not been loaded yet.');
        }
        return this.validatorPublicKey;
    }

    getGenesis(): Genesis {
        if (!this.genesis) {
            throw new Error('Genesis has not been loaded yet.');
        }
        return this.genesis;
    }

    private async loadValidatorPublicKey(): Promise<void> {
        const file = this.cometbftKeyPath;
        try {
            const jsonText = await fs.readFile(file, 'utf8');
            const parsed = JSON.parse(jsonText) as {
                pub_key?: { type?: string; value?: string };
            };
            if (!parsed.pub_key || !parsed.pub_key.type || !parsed.pub_key.value) {
                throw new Error(`File '${path.basename(file)}' is missing pub_key type/value.`);
            }
            this.validatorPublicKey = {
                type: parsed.pub_key.type,
                value: parsed.pub_key.value,
            };
            this.logger.log(`Loaded validator public key from ${file}`);
            return;
        } catch (e) {
            this.logger.error(
                `Failed to load validator public key from ${file}`,
            );
            throw new Error('Unable to load validator public key.');
        }
    }

    private async loadGenesis(): Promise<void> {
        try {
            const jsonText = await fs.readFile(this.genesisPath, 'utf8');
            const parsed = JSON.parse(jsonText) as Genesis;
            // Basic sanity checks
            if (!parsed.chain_id || !parsed.genesis_time) {
                this.logger.warn('Genesis file parsed but missing expected top-level fields.');
            }
            this.genesis = parsed;
            this.logger.log(`Loaded genesis from ${this.genesisPath}`);
        } catch (e) {
            this.logger.error(`Failed to load genesis from ${this.genesisPath}`);
            this.logger.debug(e instanceof Error ? e.message : JSON.stringify(e));
            throw e;
        }
    }
}
