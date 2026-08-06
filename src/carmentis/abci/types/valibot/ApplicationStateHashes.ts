import * as v from 'valibot';

function uint8array() {
    return v.instance(Uint8Array<ArrayBuffer | ArrayBufferLike>)
}

export const ApplicationStateHashesSchema = v.object({
    vbRadixHash: uint8array(),
    tokenRadixHash: uint8array(),
    radixHash: uint8array(),
    storageHash: uint8array(),
    appHash: uint8array(),
});
export type ApplicationStateHashes = v.InferOutput<typeof ApplicationStateHashesSchema>;
