import {
    Secp256k1PrivateSignatureKey,
    CryptoEncoderFactory,
} from '@cmts-dev/carmentis-sdk/server';

(async function(): Promise<void> {
    const encoder = CryptoEncoderFactory.defaultStringSignatureEncoder();
    const sk = Secp256k1PrivateSignatureKey.gen();
    const pk = await sk.getPublicKey();
    console.log(await encoder.encodePrivateKey(sk));
    console.log(await encoder.encodePublicKey(pk));
})();
