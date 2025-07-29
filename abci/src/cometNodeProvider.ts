import axios from 'axios';
import { NodeProvider } from './carmentis/nodeProvider';
import { Crypto, Utils, Base64 } from '@cmts-dev/carmentis-sdk/server';

export class CometNodeProvider extends NodeProvider {
    private host: string;
    constructor(db: any) {
        super(db);
        this.host = process.env.COMET_NODE_HOST;
        if (this.host === undefined) { // TODO, use configService
            throw new Error("Missing COMET_NODE_HOST environment variable.")
        }
    }

    async getMicroblock(identifier: Uint8Array) {
        const txHash = await this.getMicroblockTxHash(identifier);
        const url = `${this.host}/tx?hash=0x${Utils.binaryToHexa(txHash)}`; // TODO: http://localhost:26657
        let data = new Uint8Array();

        try {
            const result = await axios.get(url);
            data = Base64.decodeBinary(result.data.result.tx);
        } catch (error) {
            console.error(error);
        }
        return data;
    }

    async setMicroblock(identifier: Uint8Array, headerData: Uint8Array, bodyData: Uint8Array) {
        const txData = Utils.binaryFrom(headerData, bodyData);
        const txHash = Crypto.Hashes.sha256AsBinary(txData);

        return await this.setMicroblockTxHash(identifier, txHash);
    }
}
