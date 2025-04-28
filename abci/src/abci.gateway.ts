import {MessageBody, SubscribeMessage, WebSocketGateway} from "@nestjs/websockets";

@WebSocketGateway(5000, { transports: ['websocket'] })
export class AbciGateway {

    @SubscribeMessage('echo')
    handleEvent(@MessageBody() data: string): string {
        console.log("Echo receiving data:", data);
        return data;
    }
}