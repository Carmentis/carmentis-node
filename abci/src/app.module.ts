import { Module } from '@nestjs/common';
import {AbciGateway} from "./abci.gateway";
import {AbciService} from "./abci.service";
import {AbciController} from "./abci.controller";
import {HttpModule} from "@nestjs/axios";
import {RandomNumberService} from "./random-number/RandomNumberService";

@Module({
  imports: [HttpModule],
  controllers: [AbciController],
  providers: [AbciService, AbciGateway, RandomNumberService],
})
export class AppModule {}
