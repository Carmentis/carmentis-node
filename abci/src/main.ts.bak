import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WsAdapter } from '@nestjs/platform-ws';
import {ReflectionService} from "@grpc/reflection";
import {MicroserviceOptions, Transport} from "@nestjs/microservices";
import {join} from 'path';

const grpc = true;

async function bootstrap() {

  const buffer: Buffer = Buffer.from("Hello, World!", "utf-8");

// Conversion en Uint8Array
  const uint8Array: Uint8Array = new Uint8Array(buffer);

  console.log(buffer, uint8Array);

  let app;

  if(grpc) {
    app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
      transport: Transport.GRPC,
      options: {
        package: 'cometbft.abci.v1',
        protoPath: 'cometbft/abci/v1/service.proto',
        loader: {
          includeDirs: [
            join(__dirname, '../src/proto'),
          ],
          keepCase: true,
          longs: String,
          enums: String,
          defaults: true,
          oneofs: true,
        },
        url: '0.0.0.0:26658',
        onLoadPackageDefinition: (pkg, server) => {
          new ReflectionService(pkg).addToServer(server);
        },
      },
    });

    await app.listen();
  } else {
    app = await NestFactory.create(AppModule);
    app.useWebSocketAdapter(new WsAdapter(app));
    await app.listen(3000);
  }
}
bootstrap();
