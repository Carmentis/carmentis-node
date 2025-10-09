import * as z from "zod";

export const ConfigSchema = z.object({
    genesis: z
        .object({
            private_key: z
                .object({
                    sk: z
                        .string()
                        .optional()
                        .describe("The private key string used at genesis (optional if using env or path)"),
                    path: z
                        .string()
                        .optional()
                        .describe("Filesystem path to the private key file for genesis"),
                    env: z
                        .string()
                        .optional()
                        .describe("Environment variable name containing the private key for genesis"),
                })
                .describe("Private key configuration used for initializing the genesis state"),
        })
        .optional()
        .describe("Genesis block configuration. Optional if starting from a snapshot"),

    genesis_snapshot: z
        .object({
            path: z
                .string()
                .optional()
                .describe("Filesystem path to the genesis snapshot file"),
            rpc_endpoint: z
                .string()
                .optional()
                .describe("RPC endpoint used to retrieve or verify the genesis snapshot"),
        })
        .optional()
        .describe("Settings related to using a genesis snapshot instead of a fresh genesis"),

    snapshots: z
        .object({
            snapshot_block_period: z
                .number()
                .default(1)
                .describe("Number of blocks between taking snapshots (default: 1)"),
            block_history_before_snapshot: z
                .number()
                .default(0)
                .describe("Number of previous blocks to include before the snapshot block (default: 0)"),
            max_snapshots: z
                .number()
                .default(3)
                .describe("Maximum number of snapshots to keep before pruning (default: 3)"),
        })
        .optional()
        .describe("Snapshot strategy configuration"),

    cometbft: z
        .object({
            exposed_rpc_endpoint: z
                .string()
                .describe("Publicly exposed RPC endpoint for CometBFT"),
        })
        .describe("CometBFT configuration settings"),

    abci: z
        .object({
            grpc: z
                .object({
                    port: z
                        .number()
                        .optional()
                        .describe("Port number for the ABCI gRPC server"),
                })
                .optional()
                .describe("ABCI gRPC server configuration"),
            query: z
                .object({
                    rest: z
                        .object({
                            port: z
                                .number()
                                .optional()
                                .describe("Port number for the REST API used for ABCI queries"),
                        })
                        .optional()
                        .describe("REST API configuration for ABCI queries"),
                })
                .optional()
                .describe("ABCI query interfaces"),
        })
        .describe("ABCI (Application Blockchain Interface) configuration"),

    paths: z
        .object({
            cometbft_home: z
                .string()
                .describe("Base directory for CometBFT-related data"),
            storage: z
                .string()
                .describe("Root directory for node storage (snapshots, DB, microblocks)"),
            storage_relative_snapshots_folder: z
                .string()
                .default("snapshots")
                .describe("Relative path under storage for storing snapshots"),
            storage_relative_db_folder: z
                .string()
                .default("db")
                .describe("Relative path under storage for the main database"),
            storage_relative_microblocks_folder: z
                .string()
                .default("microblocks")
                .describe("Relative path under storage for microblock data"),
            storage_relative_genesis_snapshot_file: z
                .string()
                .default("genesis_snapshot.json")
                .describe("Relative path under storage for the genesis snapshot file"),
        })
        .describe("Filesystem paths for node data storage and CometBFT home"),
});

export type NodeConfig = z.infer<typeof ConfigSchema>;
