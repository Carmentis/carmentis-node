To launch the node in replication mode:
```shell
docker run -e NODE_MODE=replication -e PEER_ENDPOINT=http://localhost:26657 -e ABCI_ENDPOINT=localhost:26658 --network host --rm -it promise-node-cometbft
```