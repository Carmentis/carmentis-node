import axios from 'axios';
import { NodeProvider } from './carmentis/nodeProvider';
import { Crypto, Utils, Base64 } from '@cmts-dev/carmentis-sdk/server';

export class CometNodeProvider extends NodeProvider {
    constructor(db: any) {
        super(db);
    }

    async getMicroblock(identifier: Uint8Array) {
        const txHash = await this.getMicroblockTxHash(identifier);
        const url = `http://localhost:26657/tx?hash=0x${Utils.binaryToHexa(txHash)}`;
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
