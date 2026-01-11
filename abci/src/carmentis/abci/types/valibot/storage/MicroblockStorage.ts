import * as v from 'valibot';

export const MicroblockStorageSchema = v.object({
    fileIdentifier: v.number(),
    offset: v.number(),
    size: v.number(),
});
export type MicroblockStorage = v.InferOutput<typeof MicroblockStorageSchema>;
