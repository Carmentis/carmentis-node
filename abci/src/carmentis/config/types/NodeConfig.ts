import * as z from "zod";

// Sink configurations
const ConsoleSinkConfigSchema = z.object({
    type: z.literal("console"),
});

const FileSinkConfigSchema = z.object({
    type: z.literal("file"),
    path: z.string(),
});

const OtelSinkConfigSchema = z.object({
    type: z.literal("otel"),
    serviceName: z.string(),
    otlpExporterConfig: z.object({
        url: z.string(),
        headers: z.record(z.string(), z.string()).optional(),
    }),
});

const SinkConfigSchema = z.union([
    ConsoleSinkConfigSchema,
    FileSinkConfigSchema,
    OtelSinkConfigSchema,
]);

// Log category configuration
const LogCategoryConfigSchema = z.object({
    category: z.union([z.string(), z.array(z.string())]),
    lowestLevel: z.enum(["debug", "info", "warning", "error", "fatal"]).default("info"),
    sinks: z.array(z.string()),
});

export const ConfigSchema = z.object({
    genesis: z.object({
        runoffFilePath: z.string().default("genesisRunoffs.json"),
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
    }),
    logs: z.object({
        sinks: z.record(z.string(), SinkConfigSchema),
        loggers: z.array(LogCategoryConfigSchema),
    }).optional(),
});

export type NodeConfig = z.infer<typeof ConfigSchema>;
export type SinkConfig = z.infer<typeof SinkConfigSchema>;
export type LogCategoryConfig = z.infer<typeof LogCategoryConfigSchema>;