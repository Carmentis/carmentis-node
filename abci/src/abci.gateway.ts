import {
    MessageBody,
    OnGatewayConnection,
    OnGatewayInit,
    SubscribeMessage,
    WebSocketGateway,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { AbciService } from './abci.service';
import {
    EchoRequest,
    EchoResponse,
    InfoRequest,
    InfoResponse,
    QueryRequest,
    QueryResponse,
} from './proto-ts/cometbft/abci/v1/types';
import { Socket } from 'ws';
import { BinaryReader } from '@bufbuild/protobuf/wire';

interface Rpc {
    request(service: string, method: string, data: Uint8Array): Promise<Uint8Array>;
}

@WebSocketGateway(26659)
export class AbciGateway implements OnGatewayInit, OnGatewayConnection {
    private readonly logger: Logger = new Logger('AbciGateway');

    private readonly rpc: Rpc;
    private readonly service: string = 'cometbft.abci.v1.ABCIService';

    constructor(private abciService: AbciService) {}

    afterInit(server: any): any {
        this.logger.debug('AbciGateway initialized');
    }

    handleConnection(client: Socket): any {
        console.log(client);
        this.logger.log('Someone connected to the abci server');
    }

    @SubscribeMessage('query')
    onQuery(request: QueryRequest): Promise<QueryResponse> {
        this.logger.log('coucou');
        const data = QueryRequest.encode(request).finish();
        const promise = this.rpc.request(this.service, 'Query', data);
        return promise.then((data) => QueryResponse.decode(new BinaryReader(data)));
    }

    @SubscribeMessage('echo')
    onEcho(@MessageBody() request: EchoRequest): Promise<EchoResponse> {
        this.logger.log('coucou');
        const data = EchoRequest.encode(request).finish();
        const promise = this.rpc.request(this.service, 'Echo', data);
        return promise.then((data) => EchoResponse.decode(new BinaryReader(data)));
    }

    @SubscribeMessage('Info')
    onInfo(@MessageBody() request: InfoRequest): Promise<InfoResponse> {
        this.logger.log('coucou');
        const data = InfoRequest.encode(request).finish();
        const promise = this.rpc.request(this.service, 'Info', data);
        return promise.then((data) => InfoResponse.decode(new BinaryReader(data)));
    }

    @SubscribeMessage('*')
    catchAll(@MessageBody() data: any): void {
        this.logger.log(`Caught unhandled message: ${JSON.stringify(data)}`);
    }
}
