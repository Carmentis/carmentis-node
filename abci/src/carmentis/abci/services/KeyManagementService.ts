import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
    PrivateSignatureKey,
    Secp256k1PrivateSignatureKey,
    StringSignatureEncoder,
} from '@cmts-dev/carmentis-sdk/server';
import { NodeConfigService } from '../../config/services/NodeConfigService';

/**
 * This service is responsible for managing the critical keys
 * used by the ABCI server.
 */
@Injectable()
export class KeyManagementService implements OnModuleInit {

    private logger = new Logger(KeyManagementService.name);
    private privateKey: PrivateSignatureKey;

    constructor(private nodeConfig: NodeConfigService) {}

    onModuleInit() {
        // get the specified private key retrieval method for the genesis private key.
        const { sk, path } = this.nodeConfig.getSpecifiedGenesisPrivateKeyRetrievalMethod();
        const specifiedEncodedPrivateKey = sk;
        const specifiedPrivateKeyFilePath = path;

        // Launch the private key retrieval, either by recovering from specified private key or by loading
        // the private key from the specified file.
        let retrievedPrivateKey: PrivateSignatureKey;
        if (typeof specifiedEncodedPrivateKey === 'string') {
            this.logger.log(`Retrieving private key provided in the config file...`);
            retrievedPrivateKey = this.loadPrivateKeyFromEncodedPrivateKey(
                specifiedEncodedPrivateKey,
            );
        } else if (typeof specifiedPrivateKeyFilePath === 'string') {
            this.logger.log(`Retrieving private key from file ${specifiedPrivateKeyFilePath}...`);
            retrievedPrivateKey = this.loadPrivateKeyFromFilePath(specifiedPrivateKeyFilePath);
        }

        // log the success (or not) of the private key retrieval
        if (retrievedPrivateKey) {
            this.logger.log('Private key retrieved successfully.');
            this.privateKey = retrievedPrivateKey;
            const publicKey = retrievedPrivateKey.getPublicKey();
            const encoder = StringSignatureEncoder.defaultStringSignatureEncoder();
            this.logger.log(
                `Loaded genesis public key: ${encoder.encodePublicKey(publicKey)}`,
            );
        } else {
            this.logger.warn(
                'Genesis private key retrieval failed: Have you provided a private key retrieval method in the config file?',
            );
        }
    }

    private loadPrivateKeyFromEncodedPrivateKey(encodedPrivateKey: string): PrivateSignatureKey {
        const encoder = StringSignatureEncoder.defaultStringSignatureEncoder();
        return encoder.decodePrivateKey(encodedPrivateKey);
    }

    getIssuerPrivateKey(): PrivateSignatureKey | undefined {
        if (this.privateKey === undefined)
            throw new Error(
                'Issuer (genesis) private key is not defined: Have you specified a retrieval method in the config file?',
            );
        return this.privateKey;
    }

    private loadPrivateKeyFromFilePath(privateKeyFilePath: string): PrivateSignatureKey {
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
                    const encoder = StringSignatureEncoder.defaultStringSignatureEncoder();
                    return encoder.decodePrivateKey(privateKey);
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
