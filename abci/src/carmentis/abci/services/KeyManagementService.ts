import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
    CryptoEncoderFactory,
    PrivateSignatureKey,
    Secp256k1PrivateSignatureKey,
} from '@cmts-dev/carmentis-sdk/server';
import { NodeConfigService } from '../../config/services/NodeConfigService';
import process from 'node:process';

/**
 * This service is responsible for managing the critical keys
 * used by the ABCI server.
 */
@Injectable()
export class KeyManagementService implements OnModuleInit {

    private logger = new Logger(KeyManagementService.name);
    private privateKey?: PrivateSignatureKey;

    constructor(private nodeConfig: NodeConfigService) {}

    async onModuleInit() {
        // get the specified private key retrieval method for the genesis private key.
        const { sk, path, env} = this.nodeConfig.getSpecifiedGenesisPrivateKeyRetrievalMethod();
        const specifiedEncodedPrivateKey = sk;
        const specifiedPrivateKeyFilePath = path;
        const specifiedEnvVarName= env;

        // Launch the private key retrieval, either by recovering from specified private key or by loading
        // the private key from the specified file, or by loading the private key from the specified environment variable.
        let retrievedPrivateKey: PrivateSignatureKey;
        if (typeof specifiedEncodedPrivateKey === 'string') {
            this.logger.log(`Retrieving private key provided in the config file...`);
            retrievedPrivateKey = await this.loadPrivateKeyFromEncodedPrivateKey(
                specifiedEncodedPrivateKey,
            );
        } else if (typeof specifiedPrivateKeyFilePath === 'string') {
            this.logger.log(`Retrieving private key from file ${specifiedPrivateKeyFilePath}...`);
            retrievedPrivateKey = await this.loadPrivateKeyFromFilePath(specifiedPrivateKeyFilePath);
        } else if (typeof specifiedEnvVarName === 'string') {
            this.logger.log(`Retrieving private key from env variable ${specifiedEnvVarName}...`);
            retrievedPrivateKey = await this.loadPrivateKeyFromEnvVar(specifiedEnvVarName);
        } else {
            const errorMsg = "No private key source provided"
            this.logger.error(errorMsg);
            throw new Error(errorMsg);
        }

        // log the success (or not) of the private key retrieval
        if (retrievedPrivateKey) {
            this.logger.log('Private key retrieved successfully.');
            this.privateKey = retrievedPrivateKey;
            const publicKey = await retrievedPrivateKey.getPublicKey();
            const encoder = CryptoEncoderFactory.defaultStringSignatureEncoder();
            this.logger.log(
                `Loaded genesis public key: ${await encoder.encodePublicKey(publicKey)}`,
            );
        } else {
            this.logger.warn(
                'Genesis private key retrieval failed: Have you provided a private key retrieval method in the config file?',
            );
        }
    }

    private async loadPrivateKeyFromEnvVar(envVarName: string): Promise<PrivateSignatureKey> {
        this.logger.log(`Loading private key from env variable ${envVarName}...`);
        const envVarValue = process.env[envVarName];
        if (envVarValue === undefined) throw new Error(`Cannot load private key from env variable ${envVarName}: undefined value.`);
        const encoder = CryptoEncoderFactory.defaultStringSignatureEncoder();
        try {
            return await encoder.decodePrivateKey(envVarValue);
        } catch (e) {
            if (e instanceof Error) {
                this.logger.error(
                    `Error while decoding private key from env variable ${envVarName}: ${e.message}.`,
                );
            }
            throw new Error(`Unable to load private key from env variable ${envVarName}.`);
        }
    }

    private async loadPrivateKeyFromEncodedPrivateKey(encodedPrivateKey: string): Promise<PrivateSignatureKey> {
        this.logger.log(`Loading private key from encoded private key...`);
        const encoder = CryptoEncoderFactory.defaultStringSignatureEncoder();
        return await encoder.decodePrivateKey(encodedPrivateKey);
    }

    getIssuerPrivateKey(): PrivateSignatureKey {
        if (this.privateKey === undefined)
            throw new Error(
                'Issuer (genesis) private key is not defined: Have you specified a retrieval method in the config file?',
            );
        return this.privateKey;
    }

    private async loadPrivateKeyFromFilePath(privateKeyFilePath: string): Promise<PrivateSignatureKey> {
        const keyFilePath = privateKeyFilePath;
        this.logger.log(`Loading keys from file: ${keyFilePath}`);

        // try to read existing keys
        try {
            if (existsSync(keyFilePath)) {
                const content = readFileSync(keyFilePath, { encoding: 'utf8' });
                const parsed = JSON.parse(content);
                const privateKey: unknown = parsed?.privateKey;
                const publicKey: unknown = parsed?.publicKey;
                if (
                    typeof privateKey === 'string' &&
                    typeof publicKey === 'string' &&
                    privateKey.length > 0 &&
                    publicKey.length > 0
                ) {
                    const encoder = CryptoEncoderFactory.defaultStringSignatureEncoder();
                    return await encoder.decodePrivateKey(privateKey);
                } else {
                    this.logger.error(
                        `Key file found but missing required fields 'privateKey'/'publicKey' or invalid format.`,
                    );
                }
            } else {
                this.logger.error(
                    `File containing genesis private key not found at ${privateKeyFilePath}.`,
                );
            }
            throw new Error(`Cannot recover genesis private key from ${privateKeyFilePath}.`);
        } catch (e) {
            this.logger.error(
                `Error while reading/parsing key file: ${(e as Error).message}. A new pair will be generated.`,
            );
            throw new Error(`Unable to load keys from file ${privateKeyFilePath}.`);
        }
    }
}
