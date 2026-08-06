import crypto from 'node:crypto';

export const NodeCrypto = {
    Hashes: {
        sha256,
        sha256AsBinary
    }
};

function sha256(data: Uint8Array): string {
    const hash = crypto.createHash('sha256').update(data).digest('hex');

    return hash.toUpperCase();
}

function sha256AsBinary(data: Uint8Array): Uint8Array {
    const hash = crypto.createHash('sha256').update(data).digest();

    return new Uint8Array(hash);
}
