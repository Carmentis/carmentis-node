import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ReflectionService } from '@grpc/reflection';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import getPort from 'get-port';

import { Logger } from '@nestjs/common';
import { NodeConfigModule } from './carmentis/config/NodeConfigModule';
import { NodeConfigService } from './carmentis/config/services/NodeConfigService';
import { configure, getConsoleSink, Sink } from '@logtape/logtape';
import { getFileSink } from "@logtape/file";
import { getOpenTelemetrySink } from '@logtape/otel';
import { SinkConfig } from './carmentis/config/types/NodeConfig';

const logger = new Logger('Carmentis Node/ABCI');

/**
 * Creates a Nest.js logger sink that integrates with the Nest.js logging system.
 */
function createNestSink(): Sink {
    return (record) => {
        const nestLogger = new Logger(record.category.join('/'));
        const message = record.message.map((m) => `${m}`).join('');
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
    };
}

/**
 * Creates a sink from the configuration.
 */
function createSink(
    config: SinkConfig
): Sink {
    switch (config.type) {
        case 'console':
            return createNestSink();
        case 'file':
            return getFileSink(config.path);
        case 'otel':
            return getOpenTelemetrySink({
                serviceName: config.serviceName,
                otlpExporterConfig: config.otlpExporterConfig,
            });
    }
}

async function bootstrap() {
    // we start by instantiating the NodeConfigModule containing the configuration for the node.
    const nodeConfigModule = await NestFactory.create(NodeConfigModule);
    await nodeConfigModule.init();
    const nodeConfigService = nodeConfigModule.get(NodeConfigService);

    // Get log configuration from NodeConfig or use defaults
    const config = nodeConfigService.getConfig();
    if (config.logs) {
        const logConfig = config.logs;

        // Create sinks based on configuration
        const sinks: Record<string, Sink> = {};
        if (logConfig.sinks) {
            for (const [name, sinkConfig] of Object.entries(logConfig.sinks)) {
                sinks[name] = createSink(sinkConfig);
            }
        }

        // Add default console sink if not already configured
        if (!sinks['console']) {
            sinks['console'] = createNestSink();
        }

        // Configure logtape

        await configure({
            sinks,
            loggers: logConfig.loggers || [],
        });
    } else {
        logger.log("No logs configuration found, using default log config")
        const defaultOtelUrl = 'http://localhost:4318/v1/logs';
        await configure<string, string>({
            sinks: {
                console: createNestSink(),
                otel: getOpenTelemetrySink({
                    serviceName: 'carmentis-node',
                    otlpExporterConfig: {
                        url: defaultOtelUrl,
                    },
                    objectRenderer: 'json',
                })
            },
            loggers: [
                { category: '@cmts-dev/carmentis-sdk', lowestLevel: 'debug', sinks: ['console', 'otel'] },
                { category: ['node'], lowestLevel: 'debug', sinks: ['console', 'otel'] },
                { category: ['node', 'perf'], lowestLevel: 'debug', sinks: ['otel'] },
            ],
        })
    }

    // define the port used by GRPC to communicate with CometBFT
    const defaultGrpcPort = await getPort({ port: 26658 });
    const grpcPort = nodeConfigService.getGrpcPortOrDefault(defaultGrpcPort);

    // log the chosen ports for the services
    logger.log(`GRPC listening at ${grpcPort}`);

    const grpcUrl = `0.0.0.0:${grpcPort}`;
    const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
        transport: Transport.GRPC,
        options: {
            //package: 'cometbft.abci.v1',
            //protoPath: 'cometbft/abci/v1/service.proto',
            package: 'tendermint.abci',
            protoPath: join(__dirname, '../proto/tendermint/abci/types.proto'),
            loader: {
                includeDirs: [join(__dirname, '../proto')],
                keepCase: true,
                longs: String, // TODO: check this because it might explains why CometBFT returns string
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

    await app.init();
    await app.listen();
}

bootstrap();
