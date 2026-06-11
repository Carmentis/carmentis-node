import { DynamicModule, Module } from '@nestjs/common';
import { RestAbciQueryController } from './controllers/RestAbciQueryController';
import { RestABCIQueryModuleOptions } from './types/RestABCIQueryModuleOptions';

@Module({
    controllers: [RestAbciQueryController]
})
export class RestABCIQueryModule {

}