import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WsAdapter } from '@nestjs/platform-ws';
import { ReflectionService } from '@grpc/reflection';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import getPort from 'get-port';

import { Logger } from '@nestjs/common';
import { RestABCIQueryModule } from './carmentis/rest-abci-query/RestABCIQueryModule';
import { NodeConfigModule } from './carmentis/config/NodeConfigModule';
import { NodeConfigService } from './carmentis/config/services/NodeConfigService';
import { configure, getConsoleSink, Sink } from '@logtape/logtape';

const logger = new Logger('Carmentis Node/ABCI');
async function bootstrap() {

    const nestSink: Sink = (record) => {
        const nestLogger = new Logger(record.category.join('/'));
        const message = record.message.map((m) => `${m}`).join(
            ''
        );
        switch (record.level) {
            case 'debug':
                nestLogger.debug(message);
                break;
            case 'info':
                nestLogger.log(message);
                break;
            case 'warning':
                nestLogger.warn(message);
                break;
            case 'error':
                nestLogger.error(message);
                break;
            default:
                nestLogger.log(message);
                break;
        }
    }


    await configure({
        sinks: {
            nest: nestSink,
            //console: getConsoleSink(),
        },
        loggers: [
            { category: '@cmts-dev/carmentis-sdk', lowestLevel: 'debug', sinks: ['nest'] },
            { category: ['node'], lowestLevel: 'debug', sinks: ['nest'] },
            { category: ['node', 'perf'], lowestLevel: 'fatal' },
        ],
    });

    // we start by instantiating the NodeConfigModule containing the configuration for the node.
    const nodeConfigModule = await NestFactory.create(NodeConfigModule);
    const nodeConfigService = nodeConfigModule.get(NodeConfigService);

    // define the port used by GRPC to communicate with CometBFT
    const defaultGrpcPort = await getPort({ port: 26658 });
    const grpcPort = nodeConfigService.getGrpcPortOrDefault(defaultGrpcPort);

    // define the port used by the REST ABCI Query service
    const defaultRestAbciQueryPort = await getPort({ port: 26659 });
    const restAbciQueryPort = nodeConfigService.getRestAbciQueryPortOrDefault(
        defaultRestAbciQueryPort
    );

    // log the chosen ports for the services
    logger.log(`GRPC listening at ${grpcPort}`);
    logger.log(`REST ABCI Query listening at ${restAbciQueryPort}`);

    const grpcUrl = `0.0.0.0:${grpcPort}`;
    const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
        transport: Transport.GRPC,
        options: {
            package: 'cometbft.abci.v1',
            protoPath: 'cometbft/abci/v1/service.proto',
            loader: {
                includeDirs: [join(__dirname, '../proto')],
                keepCase: true,
                longs: String,
                enums: String,
                defaults: true,
                oneofs: true,
            },

            url: grpcUrl,
            onLoadPackageDefinition: (pkg, server) => {
                new ReflectionService(pkg).addToServer(server);
            },
        },
    });

    const restAbciQuery = await NestFactory.create(RestABCIQueryModule);
    await Promise.all([
        app.listen(),
        restAbciQuery.listen(restAbciQueryPort),
    ]);
}


bootstrap();
