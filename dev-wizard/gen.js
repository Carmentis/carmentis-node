const fs = require('fs');
const path = require('path');
const TOML = require('@iarna/toml');

const N_NODES = 4;
const EMPTY_BLOCKS_INTERVAL = 10;
const SNAPSHOT_BLOCK_PERIOD = 5;
const BLOCK_HISTORY_BEFORE_SNAPSHOT = 0;
const MAX_SNAPSHOTS = 20;

const rootPath = path.join(__dirname, "..");
const abciPath = path.join(rootPath, "abci");
const cometConfigRootPath = path.join(rootPath, ".cometbft");
const defaultConfigToml = fs.readFileSync('./templates/default-config.toml').toString();

// genesis.json
const genesis = JSON.parse(fs.readFileSync('./templates/genesis.json').toString());

genesis.genesis_time = (new Date).toJSON();
genesis.consensus_params.validator.pub_key_types = [ 'ed25519' ];

const genesisJson = JSON.stringify(genesis, null, 2);

for(let n = 1; n <= N_NODES; n++) {
  const portOffset = (n - 1) * 10;
  const p2pPort = 26656 + portOffset;
  const rpcPort = 26657 + portOffset;
  const proxyPort = 26658 + portOffset;
  const abciQueryPort = 26659 + portOffset;
  const prometheusPort = 26660 + portOffset;

  // configX.toml (ABCI configuration)
  const abciConfig = {};

  if(n > 1) {
    abciConfig.genesis_snapshot = {
      rpc_endpoint: "http://localhost:26657"
    };
  }

  if(n == 1) {
    abciConfig.genesis = {
      private_key: {
        sk: "SIG:SECP256K1:SK{45442c1a60b8927965d791a448f1942183fcdd3452ac091512916afb6d933cf3}"
      }
    };
  }

  abciConfig.abci = {
    grpc: {
      port: proxyPort
    },
    query: {
      rest: {
        port: abciQueryPort
      }
    }
  };

  abciConfig.snapshots = {
    snapshot_block_period: SNAPSHOT_BLOCK_PERIOD,
    block_history_before_snapshot: BLOCK_HISTORY_BEFORE_SNAPSHOT,
    max_snapshots: MAX_SNAPSHOTS
  };

  abciConfig.cometbft = {
    exposed_rpc_endpoint: `http://127.0.0.1:${rpcPort}`
  };

  abciConfig.paths = {
    cometbft_home: `C:/www/carmentis-node/.cometbft/node${n}`,
    storage: `C:/www/carmentis-node/.carmentis/node${n}`
  };

  const abciConfigToml = TOML.stringify(abciConfig);

  // config.toml (Comet configuration)
  const cometConfig = TOML.parse(defaultConfigToml);

  cometConfig.moniker = `carmentis-test-node${n}`;
  cometConfig.abci = "grpc";

  // [consensus]
  cometConfig.consensus.create_empty_blocks_interval = `${EMPTY_BLOCKS_INTERVAL}s`;

  // [proxy_app]
  cometConfig.proxy_app = `127.0.0.1:${proxyPort}`;

  // [rpc]
  cometConfig.rpc.laddr = `tcp://127.0.0.1:${rpcPort}`;
  cometConfig.rpc.cors_allowed_origins = ["*"];

  // [p2p]
  cometConfig.p2p.laddr = `tcp://0.0.0.0:${p2pPort}`;
  cometConfig.p2p.external_address = `127.0.0.1:${p2pPort}`;
  cometConfig.p2p.allow_duplicate_ip = true;
  cometConfig.p2p.addr_book_strict = false;

  if(n == 1) {
    cometConfig.p2p.persistent_peers = "";
  }
  else {
    cometConfig.p2p.persistent_peers = `8f1eb7f72082b70d800da273791eceb3ecd848ef@127.0.0.1:26656`;
  }

  // [instrumentation]
  cometConfig.instrumentation.prometheus_listen_addr = `:${prometheusPort}`;

  const cometConfigToml = TOML.stringify(cometConfig);

  // cometX.bat
  const cometScript =
    `@echo off\n` +
    `if not "%1"=="r" if not "%1"=="-r" goto run\n` +
    `setlocal\n` +
    `:PROMPT\n` +
    `SET /P AREYOUSURE=Clear all Comet data (Y/[N])? \n` +
    `IF /I "%AREYOUSURE%" NEQ "Y" GOTO run\n` +
    `cometbft unsafe-reset-all --home ".cometbft/node${n}"\n` +
    `:run\n` +
    `endlocal\n` +
    `title Node ${n} - Comet\n` +
    `cometbft --home ./.cometbft/node${n} --log_level "debug" start > log${n}.txt 2>&1\n`;

  // abciX.bat
  const abciScript =
    `@echo off\n` +
    `if not "%1"=="r" if not "%1"=="-r" goto run\n` +
    `setlocal\n` +
    `:PROMPT\n` +
    `SET /P AREYOUSURE=Clear all ABCI data (Y/[N])? \n` +
    `IF /I "%AREYOUSURE%" NEQ "Y" GOTO run\n` +
    `del /q "${rootPath}\\.carmentis\\node${n}\\*"\n` +
    `rd /s /q "${rootPath}\\.carmentis\\node${n}"\n` +
    `md "${rootPath}\\.carmentis\\node${n}"\n` +
    `:run\n` +
    `endlocal\n` +
    `title Node ${n} - ABCI\n` +
    `SET NODE_CONFIG=${rootPath}\\abci\\config${n}.toml\n` +
    `npm run start:debug\n`;

  const cometConfigPath = path.join(cometConfigRootPath, `node${n}`, "config");

  fs.writeFileSync(path.join(abciPath, `config${n}.toml`), abciConfigToml);
  fs.writeFileSync(path.join(cometConfigPath, "config.toml"), cometConfigToml);
  fs.writeFileSync(path.join(cometConfigPath, "genesis.json"), genesisJson);
  fs.writeFileSync(path.join(rootPath, `comet${n}.bat`), cometScript);
  fs.writeFileSync(path.join(abciPath, `abci${n}.bat`), abciScript);
}
