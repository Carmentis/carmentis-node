import { Module } from '@nestjs/common';
import { AbciService } from './carmentis/abci/AbciService';
import { GrpcAbciController } from './carmentis/abci/controllers/GrpcAbciController';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { RestABCIQueryModule } from './carmentis/rest-abci-query/RestABCIQueryModule';
import { NodeConfigModule } from './carmentis/config/NodeConfigModule';
import { AbciModule } from './carmentis/abci/AbciModule';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        ScheduleModule.forRoot(),
        RestABCIQueryModule,
        HttpModule,
        AbciModule,
    ],
    exports: [],
})
export class AppModule {}
