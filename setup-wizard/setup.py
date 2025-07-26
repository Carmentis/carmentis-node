#!/usr/bin/env python3
# This file contains the carmentis node setup utility to easily install carmentis node

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

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[CometBFT Setup] %(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
logger = logging.getLogger('cometbft-setup')

class CometBFTRunner:
    """
    Class to manage CometBFT command execution in Docker.
    """
    def __init__(self, config_home):
        self.config_home = config_home

    def run_command(self, command, capture_output=False):
        """
        Run a CometBFT command in Docker.

        Args:
            command (str or list): The CometBFT command to run
            capture_output (bool): Whether to capture and return the command output

        Returns:
            str: Command output if capture_output is True, otherwise None
        """
        if isinstance(command, str):
            command = command.split()

        docker_command = [
            "cometbft",
        ] + command

        logger.info(f"Running command: {' '.join(docker_command)}")

        try:
            if capture_output:
                result = subprocess.run(
                    docker_command, 
                    check=True, 
                    stdout=subprocess.PIPE, 
                    stderr=subprocess.PIPE,
                )
                return result.stdout
            else:
                subprocess.run(docker_command, check=True)
                return None
        except subprocess.CalledProcessError as e:
            logger.error(f"Command failed with exit code {e.returncode}")
            if capture_output:
                logger.error(f"Error output: {e.stderr}")
            sys.exit(1)

    def run_init(self):
        self.run_command(f'init --home {self.config_home}')

def create_new_configuration_from_peer(peer_endpoint, home_dir):

    logger.info("Generate a new configuration")
    runner = CometBFTRunner(config_home=home_dir)
    runner.run_init()

    genesis_file_path = os.path.join(home_dir, "config", "genesis.json")
    config_file_path = os.path.join(home_dir, "config", "config.toml")

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
        sync_port = None

        # Try to get node ID from the response
        node_id = None
        if 'result' in data and 'node_info' in data.get('result', {}):
            node_id = data['result']['node_info'].get('id')

        # If node_id is not available in the response or we need to get the sync port, make another request to status endpoint
        status_data = None
        try:
            status_url = f"{peer_endpoint}status?"
            logger.info(f"Getting node status from {status_url}...")
            status_response = requests.get(status_url, timeout=10)
            status_response.raise_for_status()
            status_data = status_response.json()

            if 'result' in status_data and 'node_info' in status_data.get('result', {}):
                if not node_id:
                    node_id = status_data['result']['node_info'].get('id')

                # Extract the sync port from listen_addr
                if 'listen_addr' in status_data['result']['node_info']:
                    listen_addr = status_data['result']['node_info']['listen_addr']
                    logger.info(f"Found listen_addr: {listen_addr}")
                    # Extract port from format like "tcp://0.0.0.0:26656"
                    match = re.search(r':(\d+)$', listen_addr)
                    if match:
                        sync_port = match.group(1)
                        logger.info(f"Extracted sync port: {sync_port}")
                    else:
                        raise Exception('No port found in listen_addr')
        except Exception as e:
            logger.warning(f"Could not get information from status endpoint: {e}")
            # Continue with the process even if we can't get the node ID or sync port

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
                # If sync_port is available, use it instead of the original port
                if sync_port:
                    # Extract host without port
                    host_parts = peer_host.split(':')
                    if len(host_parts) > 1:
                        # Replace the port in peer_host with sync_port
                        peer_host_with_sync_port = f"{host_parts[0]}:{sync_port}"
                    else:
                        # If there's no port in the original peer_host, just append the sync_port
                        peer_host_with_sync_port = f"{peer_host}:{sync_port}"

                    updated_line = f'persistent_peers = "{node_id}@{peer_host_with_sync_port}"\n'
                else:
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


def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(
        description='CometBFT setup utility for initializing and managing CometBFT configurations'
    )

    # Add required home directory argument
    parser.add_argument('--home', type=str, required=True, help='Home directory for CometBFT configuration')

    # Add mutually exclusive group for --new and --from-peer options
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--new', action='store_true', help='Initialize a new CometBFT configuration')
    group.add_argument('--from-peer', type=str, metavar='PEER_ENDPOINT', 
                      help='Create configuration from peer (format: http(s)://host:ip)')

    # Parse arguments
    args = parser.parse_args()

    # Get home directory
    home_dir = args.home
    logger.info(f"Using home directory: '{home_dir}'")

    # Handle options
    if args.new:
        logger.info("Initializing CometBFT configuration...")
        runner = CometBFTRunner(config_home=home_dir)
        runner.run_init()
    elif args.from_peer:
        logger.info(f"Creating configuration from peer: {args.from_peer}")
        create_new_configuration_from_peer(args.from_peer, home_dir)
    else:
        # This should not happen due to required=True in the mutually exclusive group
        parser.print_help()

if __name__ == "__main__":
    main()
