import { Module } from '@nestjs/common';
import {AbciController} from "./abci.controller";
import {AbciGateway} from "./abci.gateway";

@Module({
  imports: [],
  controllers: [AbciController],
  providers: [AbciGateway],
})
export class AppModule {}
