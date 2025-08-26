import { Module } from '@nestjs/common';
import { AbciGateway } from './abci.gateway';
import { AbciService } from './abci.service';
import { GrpcAbciController } from './GrpcAbciController';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { KeyManagementService } from './key-management.service';
import { CometBFTNodeConfigService } from './carmentis/CometBFTNodeConfigService';
import { EnvService } from './carmentis/EnvService';
import { GenesisSnapshotStorageService } from './carmentis/genesis-snapshot-storage.service';

@Module({
    imports: [HttpModule, ConfigModule.forRoot()],
    controllers: [GrpcAbciController],
    providers: [EnvService, GenesisSnapshotStorageService, CometBFTNodeConfigService, KeyManagementService, AbciService, AbciGateway],
})
export class AppModule {}
