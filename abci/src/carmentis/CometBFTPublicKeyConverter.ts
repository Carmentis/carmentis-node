import { Crypto } from '@cmts-dev/carmentis-sdk/server';

export class CometBFTPublicKeyConverter {
    public static convertRawPublicKeyIntoAddress(publicKey: Uint8Array): Uint8Array {
        return Crypto.Hashes.sha256AsBinary(publicKey).slice(0, 20);
    }
}