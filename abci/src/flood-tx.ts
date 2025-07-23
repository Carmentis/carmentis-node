import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WsAdapter } from '@nestjs/platform-ws';
import { ReflectionService } from '@grpc/reflection';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { RandomNumberService } from './random-number/RandomNumberService';

const grpc = true;

async function bootstrap() {
    const buffer: Buffer = Buffer.from('Hello, World!', 'utf-8');

    // Conversion en Uint8Array
    const uint8Array: Uint8Array = new Uint8Array(buffer);

    console.log(buffer, uint8Array);

    let app;

    app = await NestFactory.create(AppModule);

    const randomNumberService = app.get(RandomNumberService);
    randomNumberService.startSendingRandomNumbers(300);
}
bootstrap();
