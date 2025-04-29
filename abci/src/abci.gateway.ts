import {MessageBody, OnGatewayConnection, OnGatewayInit, SubscribeMessage, WebSocketGateway} from "@nestjs/websockets";
import {Logger} from "@nestjs/common";
import {AbciService} from "./abci.service";
import {
    EchoRequest,
    EchoResponse,
    InfoRequest,
    InfoResponse,
    QueryRequest,
    QueryResponse
} from "./proto-ts/cometbft/abci/v1/types";
import {Socket} from "ws";

@WebSocketGateway(26658, {path: "/"})
export class AbciGateway implements OnGatewayInit, OnGatewayConnection {

    private readonly logger: Logger = new Logger("AbciGateway");

    constructor(private abciService: AbciService) {}

    afterInit(server: any): any {
        this.logger.debug("AbciGateway initialized");
    }

    handleConnection(client: Socket): any {
        this.logger.log("Someone connected to the abci server");
    }

    @SubscribeMessage('query')
    onQuery(request: QueryRequest): QueryResponse {
        return {
            code: 0,
            /** bytes data = 2, // use "value" instead. */
            log: "hey",
            /** nondeterministic */
            info: "oui",
            index: 0,
            key: new Uint8Array(),
            value: new Uint8Array(),
            proofOps: undefined,
            height: 0,
            codespace: "abci",
        }
    }

    @SubscribeMessage('echo')
    onEcho(@MessageBody() data: EchoRequest): Promise<EchoResponse> {
        this.logger.log(`Received ${data}`);

        return this.abciService.Echo(data);
    }

    @SubscribeMessage('Info')
    onInfo(@MessageBody() data: InfoRequest): Promise<InfoResponse> {
        this.logger.log(`Received ${data}`);

        return this.abciService.Info(data);
    }

    @SubscribeMessage('*')
    catchAll(@MessageBody() data: any): void {
        this.logger.log(`Caught unhandled message: ${JSON.stringify(data)}`);
    }
}
