import * as z from "zod";

export const ConfigSchema = z.object({
    genesis: z.object({
        runoffFilePath: z.string().default("genesisRunoffs.yml"),
        private_key: z.union([
            z.object({
                sk: z.string(),
            }),
            z.object({
                path: z.string(),
            }),
            z.object({
                env: z.string(),
            })
        ])
    }).optional(),
    genesis_snapshot: z.object({
        path: z.string().optional(),
        rpc_endpoint: z.string().optional(),
    }).optional(),
    snapshots: z.object({
        snapshot_block_period: z.number().default(1),
        block_history_before_snapshot: z.number().default(0),
        max_snapshots: z.number().default(3),
    }).optional(),
    cometbft: z.object({
        exposed_rpc_endpoint: z.string(),
    }),
    abci: z.object({
        grpc: z.object({
            port: z.number().optional(),
        }).optional(),
        query: z.object({
            rest: z.object({
                port: z.number().optional(),
            }).optional(),
        }).optional(),
    }),
    paths: z.object({
        cometbft_home: z.string(),
        storage: z.string(),
        storage_relative_snapshots_folder: z.string().default('snapshots'),
        storage_relative_db_folder: z.string().default('db'),
        storage_relative_microblocks_folder: z.string().default('microblocks'),
        storage_relative_genesis_snapshot_file: z.string().default('genesis_snapshot.json'),
    })
});

export type NodeConfig = z.infer<typeof ConfigSchema>;