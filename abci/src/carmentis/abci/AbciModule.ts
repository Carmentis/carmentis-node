import { Module } from '@nestjs/common';
import { GrpcAbciController } from './controllers/GrpcAbciController';
import { GenesisSnapshotStorageService } from './GenesisSnapshotStorageService';
import { CometBFTNodeConfigService } from './CometBFTNodeConfigService';
import { KeyManagementService } from './services/KeyManagementService';
import { AbciService } from './AbciService';
import { NodeConfigModule } from '../config/NodeConfigModule';

@Module({
    imports: [NodeConfigModule],
    controllers: [GrpcAbciController],
    providers: [
        GenesisSnapshotStorageService,
        CometBFTNodeConfigService,
        KeyManagementService,
        AbciService,
    ],
})
export class AbciModule {

}