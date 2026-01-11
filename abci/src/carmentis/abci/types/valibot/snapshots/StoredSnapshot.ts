import * as v from 'valibot';

/*
{
            height,
            format: FORMAT,
            chunks,
            hash,
            metadata: {
                earliestFileDate,
                dbFile: path.basename(dbFilePath),
                dbFileSha256: Utils.binaryToHexa(dbFileSha256),
                chunksFile: path.basename(chunksFilePath),
                chunksFileSha256: Utils.binaryToHexa(chunksFileSha256),
                jsonFile: path.basename(jsonFilePath),
            },
        };
 */
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