const fs = require('fs');
const path = require('path');
const TOML = require('@iarna/toml');

const PERSISTENT_PEERS = [ 1, 2, 3 ];
const RPC_SERVERS = [ 1, 2, 3 ];
const NODES_TO_SYNC = [ 4 ];
const TRUSTED_NODE = 1;
const TRUSTED_HEIGHT = 3;

const rootPath = path.join(__dirname, "..");
const abciPath = path.join(rootPath, "abci");
const cometConfigRootPath = path.join(rootPath, ".cometbft");

(async function() {
  const persistentPeerList = [];

  // retrieve the identifiers of the persistent peers
  for(const n of PERSISTENT_PEERS) {
    const response = await nodeQuery(n, `status`);
    const id = response.result.node_info.id;
    persistentPeerList.push(`${id}@127.0.0.1:${26656 + (n - 1) * 10}`);
  }

  // build the list of RPC servers
  const rpcServerList = RPC_SERVERS.map((n) => `http://127.0.0.1:${26657 + (n - 1) * 10}`);

  // get the hash of the block at the trusted height from the trusted node
  const response = await nodeQuery(TRUSTED_NODE, `block?height=${TRUSTED_HEIGHT}`);
  const trustedHash = response.result.block_id.hash;

  // update the Comet configuration of each node that we want to synchronized with state sync.
  for(const n of NODES_TO_SYNC) {
    const cometConfigPath = path.join(cometConfigRootPath, `node${n}`, "config");
    const configTomlPath = path.join(cometConfigPath, "config.toml");
    const configToml = fs.readFileSync(configTomlPath).toString();
    const cometConfig = TOML.parse(configToml);

    // [p2p]
    cometConfig.p2p.persistent_peers = persistentPeerList.join(",");

    // [statesync]
    cometConfig.statesync.enable = true;
    cometConfig.statesync.rpc_servers = rpcServerList.join(",");
    cometConfig.statesync.trust_height = TRUSTED_HEIGHT;
    cometConfig.statesync.trust_hash = trustedHash;

    const updatedConfigToml = TOML.stringify(cometConfig);
    fs.writeFileSync(configTomlPath, updatedConfigToml);
  }
})();

async function nodeQuery(n, query) {
  const url = `http://127.0.0.1:${26657 + (n - 1) * 10}/`;
  const response = await fetch(url + query);
  return await response.json();
}
