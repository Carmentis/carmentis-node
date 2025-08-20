import { Module } from '@nestjs/common';
import { AbciGateway } from './abci.gateway';
import { AbciService } from './abci.service';
import { AbciController } from './abci.controller';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { KeyManagementService } from './key-management.service';

@Module({
    imports: [HttpModule, ConfigModule.forRoot()],
    controllers: [AbciController],
    providers: [KeyManagementService, AbciService, AbciGateway],
})
export class AppModule {}
