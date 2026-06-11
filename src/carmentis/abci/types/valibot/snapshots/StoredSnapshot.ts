import * as v from 'valibot';

export const StoredSnapshotSchema = v.object({
    height: v.number(),
    format: v.number(),
    chunks: v.number(),
    hash: v.string(),
    metadata: v.object({
        earliestFileDate: v.string(),
        dbFile: v.string(),
        dbFileSha256: v.string(),
        chunksFile: v.string(),
        chunksFileSha256: v.string(),
        jsonFile: v.string(),
    })
})
export type StoredSnapshot = v.InferOutput<typeof StoredSnapshotSchema>