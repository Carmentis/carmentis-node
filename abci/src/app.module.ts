import { Module } from '@nestjs/common';
import {AbciGateway} from "./abci.gateway";
import {AbciService} from "./abci.service";

@Module({
  imports: [],
  controllers: [],
  providers: [AbciService, AbciGateway],
})
export class AppModule {}
