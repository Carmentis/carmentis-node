import * as v from "valibot";

// Sink configurations
const ConsoleSinkConfigSchema = v.object({
    type: v.literal("console"),
});

const FileSinkConfigSchema = v.object({
    type: v.literal("file"),
    path: v.string(),
});

const OtelSinkConfigSchema = v.object({
    type: v.literal("otel"),
    serviceName: v.string(),
    otlpExporterConfig: v.object({
        url: v.string(),
        headers: v.optional(v.record(v.string(), v.string())),
    }),
});

const SinkConfigSchema = v.union([
    ConsoleSinkConfigSchema,
    FileSinkConfigSchema,
    OtelSinkConfigSchema,
]);

// Log category configuration
const LogCategoryConfigSchema = v.object({
    category: v.union([v.string(), v.array(v.string())]),
    lowestLevel: v.fallback(
        v.enum({
            debug: 'debug',
            info: 'info',
            warning: 'warning',
            error: 'error',
            fatal: 'fatal',
        }),
        'info'
    ),
    sinks: v.array(v.string()),
});

export const ConfigSchema = v.object({
    genesis: v.optional(v.object({
        runoffFilePath: v.fallback(v.string(), "genesisRunoffs.json"),
        private_key: v.union([
            v.object({
                sk: v.string(),
            }),
            v.object({
                path: v.string(),
            }),
            v.object({
                env: v.string(),
            })
        ])
    })),
    genesis_snapshot: v.optional(v.object({
        path: v.optional(v.string()),
        rpc_endpoint: v.optional(v.string()),
    })),
    snapshots: v.optional(v.object({
        snapshot_block_period: v.fallback(v.number(), 1),
        block_history_before_snapshot: v.fallback(v.number(), 0),
        max_snapshots: v.fallback(v.number(), 3),
    })),
    cometbft: v.object({
        exposed_rpc_endpoint: v.string(),
    }),
    abci: v.object({
        grpc: v.optional(v.object({
            port: v.optional(v.number()),
        })),
        query: v.optional(v.object({
            rest: v.optional(v.object({
                port: v.optional(v.number()),
            })),
        })),
    }),
    paths: v.object({
        cometbft_home: v.string(),
        storage: v.string(),
        storage_relative_snapshots_folder: v.fallback(v.string(), 'snapshots'),
        storage_relative_db_folder: v.fallback(v.string(), 'db'),
        storage_relative_microblocks_folder: v.fallback(v.string(), 'microblocks'),
        storage_relative_genesis_snapshot_file: v.fallback(v.string(), 'genesis_snapshot.json'),
    }),
    logs: v.optional(v.object({
        sinks: v.record(v.string(), SinkConfigSchema),
        loggers: v.array(LogCategoryConfigSchema),
    })),
});

export type NodeConfig = v.InferOutput<typeof ConfigSchema>;
export type SinkConfig = v.InferOutput<typeof SinkConfigSchema>;
export type LogCategoryConfig = v.InferOutput<typeof LogCategoryConfigSchema>;