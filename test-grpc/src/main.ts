import {NestFactory} from '@nestjs/core';
import {AppModule} from './app.module';
import {MicroserviceOptions, Transport} from '@nestjs/microservices';
import {join} from 'path';
import {ReflectionService} from "@grpc/reflection";

async function bootstrap() {
    const app = await NestFactory.createMicroservice<MicroserviceOptions>(
        AppModule,
        {
            transport: Transport.GRPC,
            options: {
                url: 'localhost:5000',
                package: 'hero',
                protoPath: join(__dirname, 'hero/hero.proto'),
                loader: {
                    includeDirs: [join(__dirname, 'hero')],
                },
                onLoadPackageDefinition: (pkg, server) => {
                    new ReflectionService(pkg).addToServer(server);
                },
            },

        },
    );
    await app.listen(); // No need to specify a port number for microservices
}

bootstrap();