import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {MicroserviceOptions, Transport} from "@nestjs/microservices";
import { join } from 'path';
import { ReflectionService } from '@grpc/reflection';


async function bootstrap() {

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: {
      package: 'cometbft.abci.v1',
      protoPath: 'cometbft/abci/v1/service.proto',
      loader: {
        includeDirs: [join(__dirname, '../src/proto')],
      },
      url: '0.0.0.0:8080',
      onLoadPackageDefinition: (pkg, server) => {
        new ReflectionService(pkg).addToServer(server);
      },
    },
  });

  await app.listen();
}
bootstrap();
