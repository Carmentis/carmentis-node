<p align="center">
  <img src="assets/carmentis.svg" alt="Carmentis" width="360" />
</p>

<h1 align="center">Carmentis Node</h1>

<p align="center">
  The reference implementation of a Carmentis blockchain node — a CometBFT consensus engine
  paired with a TypeScript/NestJS ABCI application.
</p>

---

## Why this project

A Carmentis node is built on top of [CometBFT](https://docs.cometbft.com/) and the
**Application Blockchain Interface (ABCI)**. This separation of concerns is what makes the
node modular and maintainable:

- **CometBFT (consensus engine)** — an independent, battle-tested Byzantine-Fault-Tolerant
  consensus engine. It owns peer-to-peer networking, the mempool, block proposal/validation,
  finalization and block storage. CometBFT is deliberately agnostic about *what* the chain
  does; it only knows how to agree on an ordered log of transactions.
- **ABCI server (application logic)** — the brain of the Carmentis chain. It receives ordered
  transactions from CometBFT through the ABCI protocol and applies the Carmentis business
  rules: account and token management, transaction validation and execution, state and
  snapshot management, and custom queries.

CometBFT and the ABCI server talk to each other over **gRPC** (default port `26658`). Because
the consensus layer is decoupled from the application layer, the Carmentis-specific logic can
evolve without ever touching the consensus protocol.

## Project description

This repository contains the ABCI application that drives the Carmentis blockchain, written in
**TypeScript** with the [NestJS](https://nestjs.com/) framework, together with the CometBFT
configuration needed to run it. The two pieces together form a complete validator/full node.

```
carmentis-node/
├── src/                      # ABCI application source (NestJS)
│   ├── carmentis/            # Carmentis-specific business logic
│   │   └── config/           # Node configuration loading & schema
│   ├── proto/                # Generated protobuf TypeScript bindings
│   ├── app.module.ts         # NestJS root module
│   └── main.ts               # Entry point — boots the ABCI gRPC microservice
├── proto/                    # Source .proto definitions (tendermint, gogoproto, google)
├── scripts/                  # Utility scripts (e.g. key generation)
├── example-config.toml       # Documented, annotated node configuration template
├── Dockerfile                # Container image for the ABCI application
└── package.json
```

The node is configured through a `config.toml` file (see `example-config.toml` for the full,
annotated list of options). At startup the application searches, in order, for a config file
pointed to by `ABCI_CONFIG`/`NODE_CONFIG`, then for `config.toml`, `abci-config.toml` or
`node-config.toml` in the working directory.

## Prerequisites

- **Node.js** `>= 22.18.0`
- **pnpm** (the project ships a `pnpm-lock.yaml`; enable it with `corepack enable`)
- **Go** (only required if you want to install and run the CometBFT binary locally)
- **Docker** (for the containerized / production setup)

---

## Commands

All commands below are run from the repository root unless stated otherwise.

### Install dependencies

```shell
corepack enable
pnpm install --frozen-lockfile
```

### Generate the protobuf bindings

CometBFT's ABCI types are defined as Protocol Buffers under `proto/`. The TypeScript bindings
consumed by the application live in `src/proto/` and are generated with
[`ts-proto`](https://github.com/stephenh/ts-proto) via `protoc`:

```shell
npx protoc \
  --proto_path=proto \
  --ts_proto_opt=esModuleInterop=true \
  --ts_proto_opt=useDate=false \
  --ts_proto_opt=snakeToCamel=false \
  --plugin=protoc-gen-ts_proto=./node_modules/.bin/protoc-gen-ts_proto \
  --ts_proto_out=src/proto \
  proto/**/*.proto
```

- `esModuleInterop=true` — emit ES-module-compatible imports.
- `useDate=false` — keep protobuf timestamps as raw messages instead of JS `Date` objects.
- `snakeToCamel=false` — preserve the original `snake_case` field names (CometBFT relies on
  them being kept verbatim).

### Build

```shell
pnpm run build      # compiles the NestJS application into dist/
```

### Run the ABCI application

```shell
pnpm start          # production-style start
pnpm run start:dev  # watch mode for development
```

Once running, the ABCI server listens for CometBFT on gRPC port `26658` (configurable in
`config.toml`).

### Run the tests

```shell
pnpm test           # vitest
```

### Install and run CometBFT locally

The Carmentis node targets **CometBFT v0.38.x**. Install the binary with Go:

```shell
go install github.com/cometbft/cometbft/cmd/cometbft@v0.38.19
```

Then start CometBFT and point it at the ABCI application over gRPC:

```shell
cometbft start --home .cometbft --abci grpc --proxy_app localhost:26658
```

CometBFT exposes its RPC API at `http://localhost:26657` by default. Useful endpoints:

- Node status: `curl http://localhost:26657/status`
- Submit a transaction: `curl 'http://localhost:26657/broadcast_tx_commit?tx=<encoded_tx>'`
- Query application state: `curl 'http://localhost:26657/abci_query?path=<path>&data=<data>'`

---

## Build and run the ABCI application with Docker

The repository ships a `Dockerfile` that installs dependencies, builds the application and
starts it with `pnpm start`. **This image runs the ABCI application only** — it does *not*
contain CometBFT. On its own it is a server waiting for a consensus engine to connect; to get a
functional chain you pair it with CometBFT (see [the next section](#running-a-complete-node-with-docker-compose)).

Build the image:

```shell
docker build -t carmentis-node .
```

Run the ABCI container:

```shell
docker run --rm \
  --name carmentis-abci \
  -p 26658:26658 \
  -e ABCI_CONFIG=/app/config.toml \
  -v "$(pwd)/config.toml:/app/config.toml:ro" \
  -v "$(pwd)/.output:/app/.output" \
  carmentis-node
```

What each flag does:

| Flag | Purpose |
| --- | --- |
| `--rm` | Remove the container automatically when it stops (drop it for a long-lived deployment and use `--restart unless-stopped` instead). |
| `--name carmentis-abci` | Give the container a stable name so CometBFT — and you — can refer to it. |
| `-p 26658:26658` | Publish the **ABCI gRPC port** so CometBFT can drive the application (`hostPort:containerPort`). |
| `-e ABCI_CONFIG=/app/config.toml` | Tell the app exactly which config file to load (highest-priority lookup; avoids relying on the working-directory search). |
| `-v .../config.toml:/app/config.toml:ro` | Mount your node configuration into the container, **read-only** (`:ro`) so the container cannot alter it. |
| `-v .../.output:/app/.output` | Mount a host directory for the application's persistent state (the `[paths] storage` location) so data survives container restarts. |

> The ABCI gRPC port (`26658`) is configurable in `config.toml` under `[abci.grpc]`. If you
> change it there, adjust the `-p` mapping to match.

---

## Running a complete node with Docker Compose

A functional node = **ABCI application + CometBFT**, talking to each other over gRPC. The
recommended way to run both together is Docker Compose: it puts the two services on a shared
network where they can reach each other **by service name**, manages startup order, and keeps
their state on named volumes.

> **In production, use the published image rather than building locally.** Pull
> `ghcr.io/carmentis/node:<net>`, where `<net>` is the network you are joining — `devnet`,
> `testnet` or `mainnet`. Each tag ships the ABCI application built for that network, so you get
> the right configuration defaults and avoid drift between operators. Building from the local
> `Dockerfile` (`build: .`) is intended for development.

Create a `docker-compose.yml` at the repository root:

```yaml
services:
  abci:
    # Production: use the prebuilt image for the network you are joining
    # (devnet | testnet | mainnet). For development, replace with `build: .`
    image: ghcr.io/carmentis/node:mainnet
    container_name: carmentis-abci
    restart: unless-stopped
    environment:
      # Force the config path instead of relying on the working-directory search.
      ABCI_CONFIG: /app/config.toml
    volumes:
      - ./config.toml:/app/config.toml:ro   # node configuration (read-only)
      - abci-data:/app/.output              # persistent ABCI state ([paths] storage)
    expose:
      - "26658"                    # gRPC, reachable by CometBFT on the internal network

  cometbft:
    image: cometbft/cometbft:v0.38.19
    container_name: carmentis-cometbft
    restart: unless-stopped
    depends_on:
      - abci                       # start the application before the consensus engine
    # Point CometBFT at the ABCI service over gRPC, using the Compose service name "abci"
    # as the hostname (Docker's internal DNS resolves it to the abci container).
    command: >
      start
      --home /cometbft
      --abci grpc
      --proxy_app tcp://abci:26658
    volumes:
      - ./cometbft:/cometbft       # CometBFT home: genesis.json, priv_validator_key.json, config
    ports:
      - "26657:26657"              # publish the CometBFT RPC API to the host

volumes:
  abci-data:
```

Key points behind this configuration:

- **Service-name networking.** Compose creates a default network where every service is
  reachable by its name. That is why CometBFT uses `--proxy_app tcp://abci:26658`: `abci`
  resolves to the ABCI container. Because the two services share that network, the gRPC port
  only needs to be `expose`d (visible internally), not `ports`-published to the host.
- **`--abci grpc`** tells CometBFT to speak the ABCI protocol over gRPC — this must match the
  transport the ABCI application listens on (gRPC, port `26658`).
- **`depends_on: abci`** starts the application first. CometBFT will retry the connection if the
  application is not yet ready, so strict health-gating is optional.
- **Published vs. exposed ports.** Only `26657` (CometBFT RPC) is published to the host — that
  is the interface operators and clients use. The internal ABCI gRPC link stays on the private
  Compose network.
- **Persistent state.** `abci-data` (a named volume) holds the ABCI store, and `./cometbft`
  (a bind mount) holds the CometBFT home — including `genesis.json` and the validator key.
  Provision the CometBFT home before the first start (e.g. `cometbft init --home ./cometbft`,
  then drop in your network's `genesis.json`).

Before starting, copy and fill in the configuration:

```shell
cp example-config.toml config.toml
# Edit config.toml: [genesis.private_key] (prefer the `path`/`env` method over an inline
# secret), [cometbft] exposed_rpc_endpoint, and the [paths] section.
```

Then bring the whole node up:

```shell
docker compose up -d        # build images and start both services in the background
docker compose logs -f      # follow the logs of both services
docker compose down         # stop and remove the containers (named volumes are kept)
```

For a multi-validator network, run this stack once per validator (each with its own CometBFT
home and `genesis.json`) and wire the CometBFT instances together via the `persistent_peers` /
`seeds` settings in each node's CometBFT `config.toml`.

---

## License

This project is licensed under the **LGPL-3.0-or-later**. See [`LICENCE.txt`](LICENCE.txt) for
the full text.
