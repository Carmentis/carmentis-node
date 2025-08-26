import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EnvService {
    private readonly abciStorage: string;
    constructor(
        private readonly config: ConfigService,
    ) {
        this.abciStorage = this.config.getOrThrow<string>('NODE_ABCI_STORAGE');
    }

    getDefaultStorageFolderPath(): string {
        return this.abciStorage;
    }

}