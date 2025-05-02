# ABCI server

## Commands

- **Generate the .proto files from comet:**
```shell
pnpm buf export buf.build/cometbft/cometbft  --output proto
```

- **To run the ABCI server**:
```shell
pnpm run start # or start:dev for development
```

- **To install the CometBFT binary:**
```shell
go install github.com/cometbft/cometbft/cmd/cometbft@latest
```


- **To run the CometBFT server**:
```shell
cometbft start --home .cometbft --abci grpc --proxy_app localhost:26658
```