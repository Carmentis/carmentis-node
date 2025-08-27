# Carmentis Node

This repository contains the implementation of a Carmentis blockchain node. A blockchain node in the Carmentis network is composed of two main components:

1. **CometBFT** - The consensus server responsible for block creation, validation, and network communication
2. **ABCI Server** - The Application Blockchain Interface server that contains the internal logic of the Carmentis blockchain

## Architecture

### CometBFT (Consensus Engine)

CometBFT is an independent consensus engine that handles:
- Peer-to-peer networking with other nodes
- Transaction broadcasting and mempool management
- Consensus protocol (block proposal, validation, and finalization)
- Block storage and state synchronization

CometBFT communicates with the application logic through the ABCI protocol, which allows the consensus engine to be agnostic to the specific application being run.

### ABCI Server (Application Logic)

The ABCI server implements the business logic of the Carmentis blockchain:
- Account management and token operations
- Transaction validation and execution
- State management and storage
- Custom query handling

The ABCI server is implemented in TypeScript using the NestJS framework and communicates with CometBFT over a TCP socket.

## Repository Structure

```
carmentis-node/
├── abci/                  # ABCI server implementation
│   ├── src/               # Source code
│   │   ├── carmentis/     # Carmentis-specific business logic
│   │   ├── proto-ts/      # Protocol buffer definitions
│   │   ├── AbciService.ts # ABCI protocol implementation
│   │   └── ...
│   ├── Dockerfile         # Docker configuration for ABCI server
│   └── ...
├── cometbft/              # CometBFT configuration
│   ├── config/            # Configuration files
│   │   ├── config.toml    # Main configuration
│   │   ├── genesis.json   # Genesis state
│   │   └── ...
│   └── ...
└── docker-compose.yml     # Docker configuration for the entire node
```

## Setup and Installation

### Prerequisites

- Docker and Docker Compose
- Node.js (for development)

### Running the Node

1. Clone the repository:
   ```
   git clone https://github.com/your-org/carmentis-node.git
   cd carmentis-node
   ```

2. Start the node using Docker Compose:
   ```
   docker-compose up
   ```

This will start both the CometBFT consensus server and the ABCI application server.

### Development Setup

For development of the ABCI server:

1. Navigate to the ABCI directory:
   ```
   cd abci
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the development server:
   ```
   npm run start:dev
   ```

## Usage

### Interacting with the Node

You can interact with the node using the CometBFT RPC API, which is available at `http://localhost:26657` by default.

Example commands:
- Get node status: `curl http://localhost:26657/status`
- Submit a transaction: `curl http://localhost:26657/broadcast_tx_commit?tx=encoded_tx`
- Query the application state: `curl http://localhost:26657/abci_query?path=custom_query&data=encoded_data`

### Custom Queries

The Carmentis blockchain supports custom queries through the ABCI interface. These queries are handled by the ABCI server and can be used to retrieve information about accounts, transactions, and other blockchain state.

## License

[License information]