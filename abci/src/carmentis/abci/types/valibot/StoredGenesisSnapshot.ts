import * as v from 'valibot';
import { uint8array } from './db/db';

export const StoredGenesisSnapshotSchema = v.object({
    base64EncodedChunks: v.array(v.string()),
});
export type StoredGenesisSnapshot = v.InferOutput<typeof StoredGenesisSnapshotSchema>;