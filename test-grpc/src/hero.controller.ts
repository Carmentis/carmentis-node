import {Controller} from "@nestjs/common";
import {GrpcMethod} from "@nestjs/microservices";
import {Metadata, ServerUnaryCall} from "@grpc/grpc-js";
import {Hero, HeroById, Message} from "./hero/hero";

@Controller()
export class HeroesController {
    @GrpcMethod('HeroesService', 'FindOne')
    findOne(data: HeroById, metadata: Metadata, call: ServerUnaryCall<any, any>): Hero {
        const items = [
            { id: 1, name: 'John' },
            { id: 2, name: 'Doe' },
        ];
        return items.find(({ id }) => id === data.id);
    }

    @GrpcMethod('HeroesService', 'Echo')
    echo(data: Message) {
        return { message: data.message };
    }
}