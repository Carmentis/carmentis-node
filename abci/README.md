# ABCI server

## Commands

- **Generate the .proto files from comet**
All protobuf files are already correctly placed. The following command should be executed in the `abci` folder:
```shell
npx protoc \
  --proto_path=proto \
  --ts_proto_opt=esModuleInterop=true \
  --ts_proto_opt=outputServices=grpc-js \
  --plugin=protoc-gen-ts_proto=./node_modules/.bin/protoc-gen-ts_proto \
  --ts_proto_out=src/proto \
  proto/**/*.proto
```

Maybe this one? 
```shell
px protoc \   
  --proto_path=proto \
  --ts_proto_opt=esModuleInterop=true \
  --plugin=protoc-gen-ts_proto=./node_modules/.bin/protoc-gen-ts_proto \
  --ts_proto_out=src/proto \
  proto/**/*.proto
```

Better?

```shell
npx protoc \
--proto_path=proto \
--ts_proto_opt=esModuleInterop=true \
--ts_proto_opt=useDate=false \
--plugin=protoc-gen-ts_proto=./node_modules/.bin/protoc-gen-ts_proto \
--ts_proto_out=src/proto \
proto/**/*.proto
```

- **To install the CometBFT binary:**
```shell
go install github.com/cometbft/cometbft/cmd/cometbft@latest
```


- **To run the CometBFT server**:
```shell
cometbft start --home .cometbft --abci grpc --proxy_app localhost:26658
```