import { Module } from '@nestjs/common';
import {AbciGateway} from "./abci.gateway";
import {AbciService} from "./abci.service";
import {AbciController} from "./abci.controller";

@Module({
  imports: [],
  controllers: [AbciController],
  providers: [AbciService, AbciGateway],
})
export class AppModule {}
