import { Module } from '@nestjs/common';
import { NodeConfigService } from './services/NodeConfigService';

@Module({
    providers: [NodeConfigService],
    exports: [NodeConfigService],
})
export class NodeConfigModule {

}