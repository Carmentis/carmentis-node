import {Injectable, Logger} from '@nestjs/common';
import {HttpService} from '@nestjs/axios';
import {catchError, firstValueFrom} from 'rxjs';

@Injectable()
export class RandomNumberService {
    private readonly logger = new Logger(RandomNumberService.name);

    constructor(private readonly httpService: HttpService) {
    }

    async sendRandomNumber(): Promise<void> {
        const randomNumber = Math.floor(Math.random() * 1000000);

        const buffer: Buffer = Buffer.from(randomNumber.toString(), "utf-8");

// Conversion en Uint8Array
        const urlBroadcast = `http://localhost:26657/broadcast_tx_sync?tx=0x${buffer}`;
        const urlTx = `http://localhost:26657/tx?prove=true&hash=0x`

        console.log('Call', `http://localhost:26657/broadcast_tx_sync?tx=0x${buffer}`)

        try {
            const response = await firstValueFrom(
                this.httpService.post<object>(urlBroadcast).pipe(
                    catchError((error) => {
                        throw error;
                    }),
                ),
            );
            this.logger.log(`Sent random number: ${randomNumber}, Status: ${response.status}, Hash: ${response.data['result']['hash']}`);

            setTimeout(async () => {
                const tx = await firstValueFrom(
                    this.httpService.post<object>(
                        urlTx + response.data['result']['hash']
                    ).pipe(
                        catchError((error) => {
                            throw error;
                        }),
                    ));

                this.logger.log(tx?.data);
            }, 5000);

        } catch (error) {
/*
            this.logger.error(`Error sending random number: ${randomNumber}`);
            this.logger.error(`Status: ${error.response?.status}`);
            this.logger.error(`Status Text: ${error.response?.statusText}`);
            this.logger.error(`Response Body:`, error.response?.data);
            this.logger.error(`Headers:`, error.response?.headers);
*/
            console.error(error);
        }
    }

    startSendingRandomNumbers(intervalMs: number = 5000): void {
        setInterval(async () => {
            await this.sendRandomNumber();
        }, intervalMs);
        this.logger.log(`Started sending random numbers every ${intervalMs}ms`);
    }
}
