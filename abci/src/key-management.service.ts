import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
    PrivateSignatureKey,
    Secp256k1PrivateSignatureKey,
    StringSignatureEncoder,
} from '@cmts-dev/carmentis-sdk/server';


/**
 * This service is responsible for managing the critical keys
 * used by the ABCI server.
 */
@Injectable()
export class KeyManagementService implements OnModuleInit {
    private static KEY_FILENAME = "node-key.json";
    private static KEY_PATH_VAR_ENV_NAME = "NODE_ABCI_KEY_PATH";

    private logger = new Logger(KeyManagementService.name);
    private keyFolderPath: string;
    private keyFilename: string;
    private privateKey: PrivateSignatureKey;

    constructor(private config: ConfigService) {
        this.keyFilename = KeyManagementService.KEY_FILENAME;
    }

    onModuleInit() {
        // ensure that the folder exists
        this.keyFolderPath = this.getKeyFolderPath();
        mkdirSync(this.keyFolderPath, { recursive: true });
        this.logger.log(`Key folder path: ${this.keyFolderPath}`);

        // load or generate key pair for the issuer
        this.privateKey = this.loadKeysFromKeyFile();
        const publicKey = this.privateKey.getPublicKey();
        this.logger.log(`Node keys are ready (publicKey length=${publicKey.getPublicKeyAsBytes().length} bytes).`);
    }

    getIssuerPrivateKey(): PrivateSignatureKey {
        return this.privateKey;
    }

    private loadKeysFromKeyFile(): PrivateSignatureKey {
        const keyFilePath = path.join(this.keyFolderPath, this.keyFilename);
        this.logger.log(`Loading keys from file: ${keyFilePath}`);

        // try to read existing keys
        try {
            if (existsSync(keyFilePath)) {
                const content = readFileSync(keyFilePath, { encoding: 'utf8' });
                const parsed = JSON.parse(content);
                const privateKey: unknown = parsed?.privateKey;
                const publicKey: unknown = parsed?.publicKey;
                if (typeof privateKey === 'string' && typeof publicKey === 'string' && privateKey.length > 0 && publicKey.length > 0) {
                    const encoder = StringSignatureEncoder.defaultStringSignatureEncoder();
                    return encoder.decodePrivateKey(privateKey);
                } else {
                    this.logger.warn(`Key file found but missing required fields 'privateKey'/'publicKey' or invalid format. Regenerating keys.`);
                }
            } else {
                this.logger.warn(`Key file does not exist. It will be created with a new key pair.`);
            }
        } catch (e) {
            this.logger.error(`Error while reading/parsing key file: ${(e as Error).message}. A new pair will be generated.`);
        }

        // fallback: generate and save new keys
        return this.generateAndSaveKeys(keyFilePath);
    }

    private generateAndSaveKeys(keyFilePath: string): PrivateSignatureKey {
        this.logger.log('Generating new key pair...');
        const privateKey = Secp256k1PrivateSignatureKey.gen();
        const publicKey = privateKey.getPublicKey();
        const encoder = StringSignatureEncoder.defaultStringSignatureEncoder();

        // export key pair in JSON
        const payload = JSON.stringify({
            privateKey: encoder.encodePrivateKey(privateKey),
            publicKey: encoder.encodePublicKey(publicKey),
        }, null, 2);
        writeFileSync(keyFilePath, payload, { encoding: 'utf8' });
        this.logger.log(`New key pair generated and saved to ${keyFilePath}`);
        return privateKey;
    }
    
    private getKeyFolderPath() {
        // The path where keys are retrieved/stored is defined by the most specialized input, namely
        // the NODE_ABCI_KEY_PATH environment variable. If not defined, then a new folder is used
        const defaultKeyFolderPath = this.getDefaultKeyFolderPath();
        return this.config.get<string>(KeyManagementService.KEY_PATH_VAR_ENV_NAME) ??
            defaultKeyFolderPath;
            
    }

    private getDefaultKeyFolderPath() {
        const homePath =
            this.config.get<string>('HOME') ??
            (process.platform === 'win32' ? process.env.USERPROFILE : process.env.HOME) ??
            homedir();
        return join(homePath, '.carmentis', 'keys');
    }


}