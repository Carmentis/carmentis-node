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
import tomllib

from ansible_collections.community.network.plugins.modules.cv_server_provision import updated_configlet_content

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

class CometBFTConfigEditor:
    def __init__(self, config_home):
        self.genesis_file_path = os.path.join(config_home, "config", "genesis.json")
        self.config_file_path = os.path.join(config_home, "config", "config.toml")

        logger.info(f"Creating backup file for {self.config_file_path}...")
        # Create a backup of the original config file
        backup_file = f"{self.config_file_path}.bak"
        shutil.copy2(self.config_file_path, backup_file)


        with open(self.config_file_path, "r") as f:
            self.config_content = f.readlines()

    def set_moniker_name(self, moniker_name):
        self.edit_config('moniker', moniker_name)

    def set_cors_allowed_origin(self, cors_origins):
        self.edit_config('cors_allowed_origins', cors_origins)

    def set_persisten_peers(self, persistent_peers):
        self.edit_config('persistent_peers', persistent_peers)

    def set_rpc_laddr(self, laddr):
        self.edit_config('laddr', laddr, section='rpc')

    def set_p2p_laddr(self, laddr):
        self.edit_config('laddr', laddr, section='p2p')

    def enable_sync(self):
        self.edit_config('enable', True, section='statesync')

    def set_sync_peers(self, sync_endpoints: str):
        self.edit_config('rpc_servers', sync_endpoints, section='statesync')

    def set_sync_latest_state(self, latest_block_height, latest_block_hash):
        self.edit_config('trust_height', latest_block_height, section='statesync')
        self.edit_config('trust_hash', latest_block_hash, section='statesync')

    def edit_config(self, entry, value, section=None):
        current_section=None
        updated_content = []
        for line in self.config_content:
            if line.startswith('['):
                current_section = line.strip().replace('[', '').replace(']', '')


            if line.strip().startswith(entry + ' =') and (section is None or current_section == section):
                if isinstance(value, list):
                    updated_line = f'{entry} = {value}\n'
                elif isinstance(value, str):
                    updated_line = f'{entry} = "{value}"\n'
                elif isinstance(value, bool):
                    updated_line = f'{entry} = {str(value).lower()}\n'
                else:
                    raise Exception("Unsupported value type for config entry")

                updated_content.append(updated_line)
                logger.info(f"Updated {entry} to: {updated_line.strip()} " + (f"[{section}]" if section else "" ))
            else:
                updated_content.append(line)
        self.config_content = updated_content

    def persist_config(self):
        # Write the updated content back to the config file
        with open(self.config_file_path, "w") as f:
            logger.info(f"Writing updated config file at {self.config_file_path}...")
            for line in self.config_content:
                f.write(line)


class HttpNodeStatus:
    def __init__(self, peer_host, node_status):
        host_parts = peer_host.split(':')
        self.peer_host = peer_host if len(host_parts) == 1 else host_parts[0]
        self.status = node_status

    @staticmethod
    def create_from_peer_endpoint(peer_endpoint):
        parsed_url = urlparse(peer_endpoint)
        peer_host = parsed_url.netloc
        status_url = f"{peer_endpoint}/status?"
        logger.info(f"Getting node status from {status_url}...")
        status_response = requests.get(status_url, timeout=10)
        status_response.raise_for_status()
        status_data = status_response.json()
        return HttpNodeStatus(peer_host, status_data)

    def get_peer_host(self):
        return self.peer_host

    def get_node_id(self):
        return self.status['result']['node_info']['id']

    def get_sync_info(self):
        return self.status['result']['sync_info']

    def get_sync_port(self):
        listen_addr = self.status['result']['node_info']['listen_addr']
        logger.info(f"Found listen_addr: {listen_addr}")
        # Extract port from format like "tcp://0.0.0.0:26656"
        match = re.search(r':(\d+)$', listen_addr)
        if match:
            sync_port = match.group(1)
            logger.info(f"Extracted sync port: {sync_port}")
            return sync_port
        else:
            raise Exception('No port found in listen_addr')

    def get_rpc_port(self):
        listen_addr = self.status['result']['node_info']['other']['rpc_address']
        logger.info(f"Found listen_addr: {listen_addr}")
        # Extract port from format like "tcp://0.0.0.0:26656"
        match = re.search(r':(\d+)$', listen_addr)
        if match:
            rpc_port = match.group(1)
            logger.info(f"Extracted rpc port: {rpc_port}")
            return rpc_port
        else:
            raise Exception('No port found for rpc')

    def get_latest_block_hash(self):
        return self.status['result']['sync_info']['latest_block_hash']

    def get_latest_block_height(self):
        return self.status['result']['sync_info']['latest_block_height']

    def get_node_p2p_address_in_cometbft_format(self):
        sync_port = self.get_sync_port()
        node_id = self.get_node_id()
        peer_host = self.peer_host
        return f"{node_id}@{peer_host}:{sync_port}"

    def get_node_rpc_address_in_cometbft_format(self):
        rpc_port = self.get_rpc_port()
        node_id = self.get_node_id()
        peer_host = self.peer_host
        return f"{node_id}@{peer_host}:{rpc_port}"


def update_configuration_from_peer(config_editor: CometBFTConfigEditor, peer_endpoint, sync_endpoints, home_dir):
    genesis_file_path = os.path.join(home_dir, "config", "genesis.json")


    genesis_url = f"{peer_endpoint}/genesis?"

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
        peer_status = HttpNodeStatus.create_from_peer_endpoint(peer_endpoint)

        # we put the provided peer endpoint as a persistent peer
        updated_persistent_peer = peer_status.get_node_p2p_address_in_cometbft_format()
        config_editor.edit_config('persistent_peers', updated_persistent_peer)


        # handle synchronization when at least two peers are provided
        if 0 < len(sync_endpoints):
            if 2 <= len(sync_endpoints):
                # we fetch status for all nodes
                peers_status_list: list[HttpNodeStatus] = []
                for peer in sync_endpoints:
                    peers_status_list.append(HttpNodeStatus.create_from_peer_endpoint(peer))

                # enable state sync
                config_editor.enable_sync()

                # set the sync endpoints
                sync_endpoints_str = ','.join([
                    status.get_node_rpc_address_in_cometbft_format()
                    for status in peers_status_list
                ])
                config_editor.set_sync_peers(sync_endpoints_str)

                # we use the state of the first node to synchronize
                first_peer_stats = peers_status_list[0]
                latest_block_hash = first_peer_stats.get_latest_block_hash()
                latest_block_height = first_peer_stats.get_latest_block_height()
                logger.info(f"Latest block height: {latest_block_height}")
                logger.info(f"Latest block hash: {latest_block_hash}")
                config_editor.set_sync_latest_state(latest_block_height, latest_block_hash)


            else:
                logger.warning("At least two peers are needed to enable synchronisation")
        else:
            logger.info("No sync peers provided, skipping synchronisation")


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
    parser.add_argument('--node-name', type=str, help='Name of the node')
    parser.add_argument('--cors-allowed-origins', type=str, help='Comma-separated list of CORS allowed origins', default='*')
    parser.add_argument('--rpc-laddr', type=str, help='Address where CometBFT is exposing RPC', default='tcp://0.0.0.0:26657')
    parser.add_argument('--p2p-laddr', type=str, help='Address where CometBFT is exposing P2P', default='tcp://0.0.0.0:26656')
    parser.add_argument('--prometheus-laddr', type=str, help='Address where CometBFT is exposing instrumentation.', default=":26660")

    # Add mutually exclusive group for --new and --from-peer options
    group = parser.add_mutually_exclusive_group(required=True)

    group.add_argument('--new', action='store_true', help='Initialize a new CometBFT configuration')

    sub_group = group.add_argument_group()
    group.add_argument('--from-peer', type=str, metavar='PEER_ENDPOINT',
                      help='Create configuration from peer (format: http(s)://host:ip)')
    sub_group.add_argument('--sync-peers', type=str,  help="""
    Should be used only in combination with --from-peer, otherwise not effective. 
    Uses two servers to sync the blockchain.
    Example: --sync-servers=http://192.168.1.1:26657,http://192.168.1.2:26657
    """)

    # Parse arguments
    args = parser.parse_args()

    # Get home directory
    if args.new or args.from_peer:
        home_dir = args.home
        logger.info(f"Using home directory: '{home_dir}'")


        logger.info("Initializing CometBFT configuration...")
        runner = CometBFTRunner(config_home=home_dir)
        runner.run_init()

        # apply common updates in the config
        config_editor = CometBFTConfigEditor(config_home=home_dir)
        config_editor.set_cors_allowed_origin(args.cors_allowed_origins.split(','))
        config_editor.set_rpc_laddr(args.rpc_laddr)
        config_editor.set_p2p_laddr(args.p2p_laddr)
        if args.node_name:
            config_editor.set_moniker_name(args.node_name)

        # Handle options
        if args.from_peer:
            logger.info(f"Updating configuration from remote peer: {args.from_peer}")
            sync_endpoints = [] if args.sync_peers is None else args.sync_peers.split(',')
            update_configuration_from_peer(config_editor, args.from_peer, sync_endpoints, home_dir)

        # persist the configuration
        config_editor.persist_config()
    else:
        # This should not happen due to required=True in the mutually exclusive group
        parser.print_help()

if __name__ == "__main__":
    main()
