#!/usr/bin/env python3

import os
import sys
import json
import requests
import shutil
import subprocess
import logging
import argparse
import re
from urllib.parse import urlparse
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[Node launcher] %(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
logger = logging.getLogger('carmentis')

def create_new_chain():
    """
    Function to create a new blockchain.
    This function is called when GENESIS_FILE_LOCATION is defined.
    """
    pass

def join_existing_chain(peer_endpoint, comet_home):
    """
    Function to join an existing blockchain.
    This function is called when PEER_ENDPOINT is defined.

    Args:
        peer_endpoint (str): The endpoint of the peer to connect to
        comet_home (str): The home directory for CometBFT

    Steps:
    1. Contact peer_endpoint/genesis? to get a JSON response
    2. Extract the genesis JSON from result.genesis
    3. Save it to /app/config/genesis.json
    4. Update /app/config/config.toml by modifying the persistent_peers entry
    """
    genesis_file_path = f"{comet_home}/config/genesis.json"
    config_file_path = f"{comet_home}/config/config.toml"

    # Ensure the endpoint has a trailing slash if needed
    if not peer_endpoint.endswith('/'):
        peer_endpoint = peer_endpoint + '/'

    genesis_url = f"{peer_endpoint}genesis?"

    try:
        logger.info(f"Contacting peer at {genesis_url}...")
        response = requests.get(genesis_url, timeout=10)
        response.raise_for_status()  # Raise an exception for HTTP errors

        # Parse the JSON response
        data = response.json()

        # Extract the genesis JSON
        if 'result' not in data or 'genesis' not in data['result']:
            logger.error("Invalid response format. 'result.genesis' not found in the response.")
            sys.exit(1)

        genesis_json = data['result']['genesis']

        # Ensure the config directory exists
        config_dir = os.path.dirname(genesis_file_path)
        os.makedirs(config_dir, exist_ok=True)

        # Save the genesis JSON to file
        logger.info(f"Saving genesis file to {genesis_file_path}...")
        with open(genesis_file_path, 'w') as f:
            json.dump(genesis_json, f, indent=2)

        # Extract peer information for persistent_peers
        parsed_url = urlparse(peer_endpoint)
        peer_host = parsed_url.netloc

        # Try to get node ID from the response
        node_id = None
        if 'result' in data and 'node_info' in data.get('result', {}):
            node_id = data['result']['node_info'].get('id')

        # If node_id is not available in the response, make another request to status endpoint
        if not node_id:
            try:
                status_url = f"{peer_endpoint}status?"
                logger.info(f"Node ID not found in genesis response. Trying {status_url}...")
                status_response = requests.get(status_url, timeout=10)
                status_response.raise_for_status()
                status_data = status_response.json()

                if 'result' in status_data and 'node_info' in status_data.get('result', {}):
                    node_id = status_data['result']['node_info'].get('id')
            except Exception as e:
                logger.warning(f"Could not get node ID from status endpoint: {e}")
                # Continue with the process even if we can't get the node ID

        # If we still don't have a node ID, exit
        if not node_id:
            logger.error("Could not determine node ID. Using placeholder.")
            sys.exit(1)

        # Update the config.toml file
        if not os.path.exists(config_file_path):
            logger.error(f"Config file not found at {config_file_path}")
            sys.exit(1)

        logger.info(f"Updating config file at {config_file_path}...")
        # Create a backup of the original config file
        backup_file = f"{config_file_path}.bak"
        shutil.copy2(config_file_path, backup_file)

        # Read the config file
        with open(config_file_path, 'r') as f:
            config_content = f.readlines()

        # Update the persistent_peers entry
        updated_content = []
        for line in config_content:
            if line.strip().startswith('persistent_peers ='):
                updated_line = f'persistent_peers = "{node_id}@{peer_host}"\n'
                updated_content.append(updated_line)
                logger.info(f"Updated persistent_peers to: {updated_line.strip()}")
            else:
                updated_content.append(line)

        # Write the updated content back to the config file
        with open(config_file_path, 'w') as f:
            f.writelines(updated_content)

        logger.info("Successfully joined the existing blockchain.")

    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to connect to peer: {e}")
        sys.exit(1)
    except json.JSONDecodeError:
        logger.error("Failed to parse JSON response from peer.")
        sys.exit(1)
    except IOError as e:
        logger.error(f"File operation failed: {e}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"An unexpected error occurred: {e}")
        sys.exit(1)

def update_laddr_in_config(comet_home):
    """
    Function to update laddr entries in config.toml.
    This function replaces 'tcp://127.0.0.1:xxxx' with 'tcp://0.0.0.0:xxxx' in the config file.

    Args:
        comet_home (str): The home directory for CometBFT
    """
    config_file_path = f"{comet_home}/config/config.toml"

    try:
        logger.info(f"Updating laddr entries in {config_file_path}...")

        # Check if the config file exists
        if not os.path.exists(config_file_path):
            logger.error(f"Config file not found at {config_file_path}")
            sys.exit(1)

        # Create a backup of the original config file
        backup_file = f"{config_file_path}.bak"
        shutil.copy2(config_file_path, backup_file)

        # Read the config file
        updated_lines = []
        with open(config_file_path, 'r') as f:
            lines = f.readlines()
            for line in lines:
                if 'laddr' in line and '127.0.0.1' in line:
                    updated_line = line.replace('127.0.0.1', '0.0.0.0')
                    updated_lines.append(updated_line)
                    logger.info(f"Updated laddr entry: {updated_line.strip()}")
                else:
                    updated_lines.append(line)



        # Write the modified content back to the config file
        with open(config_file_path, 'w') as f:
            updated_content = ''.join(updated_lines)
            f.write(updated_content)

        logger.info("Successfully updated laddr entries in config.toml")

    except IOError as e:
        logger.error(f"File operation failed: {e}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"An unexpected error occurred while updating config: {e}")
        sys.exit(1)

def launch_cometbft(abci_endpoint, comet_home):
    """
    Function to launch CometBFT.
    This function runs the command: cometbft start --home <comet_home> --abci grpc --proxy_app abci_endpoint

    Args:
        abci_endpoint (str): The ABCI endpoint to connect to
        comet_home (str): The home directory for CometBFT (default: ".")
    """
    try:
        logger.info(f"Launching CometBFT with ABCI endpoint: {abci_endpoint} and home directory: {comet_home}")
        command = ["cometbft", "start", "--home", comet_home, "--abci", "grpc", "--proxy_app", abci_endpoint]

        # Run the command
        subprocess.run(command, check=True)
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to launch CometBFT: {e}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"An unexpected error occurred while launching CometBFT: {e}")
        sys.exit(1)

def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Carmentis Node Launcher')
    parser.add_argument('--comet_home', type=str, help='Home directory for CometBFT', required=True)
    args = parser.parse_args()

    # Get environment variables
    node_mode = os.environ.get('NODE_MODE')
    peer_endpoint = os.environ.get('PEER_ENDPOINT')
    abci_endpoint = os.environ.get('ABCI_ENDPOINT')

    # Check if NODE_MODE is undefined or defined with an invalid value
    if not node_mode:
        logger.warning("No mode provided: switching to replication mode.")
        node_mode = 'replication'
    elif node_mode not in ['genesis', 'replication']:
        logger.error(f"Invalid NODE_MODE value: {node_mode}")
        logger.error("NODE_MODE must be either 'genesis' or 'replication'.")
        sys.exit(1)


    # Check if ABCI_ENDPOINT is defined
    if not abci_endpoint:
        logger.error("ABCI_ENDPOINT environment variable is not defined.")
        logger.error("Please set the ABCI_ENDPOINT environment variable to the ABCI endpoint.")
        sys.exit(1)

    # Call the appropriate function based on NODE_MODE or legacy variables
    if node_mode == 'genesis':
        logger.info("Creating a new blockchain...")
        create_new_chain()
    elif node_mode == 'replication':
        logger.info("Joining an existing blockchain...")
        join_existing_chain(peer_endpoint, args.comet_home)
    else:
        logger.error("Internal error: Invalid NODE_MODE value. Please contact support.")
        sys.exit(1)

    # Update laddr entries in config.toml
    logger.info("Updating laddr entries in config.toml...")
    update_laddr_in_config(args.comet_home)

    # Launch CometBFT with the specified home directory
    logger.info("Launching CometBFT...")
    launch_cometbft(abci_endpoint, args.comet_home)

if __name__ == "__main__":
    main()
