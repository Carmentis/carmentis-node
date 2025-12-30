// This file contains the tests which emulates the CometBFT server.

import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { RestABCIQueryModule } from '../rest-abci-query/RestABCIQueryModule';
import { HttpModule } from '@nestjs/axios';
import { AbciModule } from '../abci/AbciModule';
import { NodeConfigService } from '../config/services/NodeConfigService';
import { GrpcAbciController } from '../abci/controllers/GrpcAbciController';
import { NodeConfig } from '../config/types/NodeConfig';
import { mkdtempSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
    CometBFTNodeConfigService,
    Genesis,
    TendermintPublicKey,
} from '../abci/CometBFTNodeConfigService';
import { configure, getConsoleSink } from '@logtape/logtape';
import {
    EncoderFactory,
    Microblock,
    SectionType,
    Utils,
    VirtualBlockchainType,
} from '@cmts-dev/carmentis-sdk/server';
import { CheckTxResponse, CheckTxType } from '../../proto-ts/cometbft/abci/v1/types';

describe('Abci', () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'node'));
    const genesisNodeConfig: NodeConfig = {
        abci: {
            grpc: {
                port: 443,
            },
        },
        cometbft: {
            exposed_rpc_endpoint: '',
        },
        paths: {
            cometbft_home: `${tmpDir}`,
            storage: `${tmpDir}`,
            storage_relative_snapshots_folder: 'snapshots',
            storage_relative_db_folder: 'db',
            storage_relative_microblocks_folder: 'microblocks',
            storage_relative_genesis_snapshot_file: 'genesis_snapshot.json',
        },
        genesis: {
            private_key: {
                sk: 'SIG:SECP256K1:SK{cd42ad5f7a7823f3ab4da368ea4f807fa8246526ea4ea7eeb4879c42048916a5}',
            },
            runoffFilePath: `${tmpDir}/runoff.json`,
        },
    };
    const nodeConfigService = NodeConfigService.createFromConfig(genesisNodeConfig);

    const pkBytes = new Uint8Array([1, 2, 3]);
    const encoder = EncoderFactory.bytesToBase64Encoder();
    const pk: TendermintPublicKey = {
        type: '',
        value: encoder.encode(pkBytes),
    };
    const genesis: Genesis = {
        app_hash: '',
        chain_id: '',
        genesis_time: '',
        initial_height: '',
        validators: [
            {
                address: '123',
                pub_key: pk,
                power: '10',
                name: 'genesis',
            },
        ],
    };

    let abci: GrpcAbciController;
    beforeAll(async () => {
        await configure<string, string>({
            sinks: {
                console: getConsoleSink(),
            },
            loggers: [
                { category: '@cmts-dev/carmentis-sdk', lowestLevel: 'debug', sinks: ['console'] },
                { category: ['node'], lowestLevel: 'debug', sinks: ['console'] },
                { category: ['node', 'perf'], lowestLevel: 'fatal', sinks: [] },
            ],
        });

        const moduleFixture = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({
                    isGlobal: true,
                }),
                RestABCIQueryModule,
                HttpModule,
                AbciModule,
            ],
        })
            .overrideProvider(NodeConfigService)
            .useValue(nodeConfigService)
            .overrideProvider(CometBFTNodeConfigService)
            .useValue(
                CometBFTNodeConfigService.createFromGenesisAndTandermintPublicKey(
                    nodeConfigService,
                    genesis,
                    pk,
                ),
            )
            .compile();
        await moduleFixture.init();
        abci = moduleFixture.get(GrpcAbciController);
    });

    it('Should echo', async () => {
        const message = 'Hello world!';
        const response = await abci.Echo({
            message,
        });
        expect(response.message).toEqual(`Echo: ${message}`);
    });

    it('Should Init as a genesis', async () => {
        const response = await abci.InitChain({
            app_state_bytes: Utils.getNullHash(),
            chain_id: 'cmts:testchain',
            initial_height: 1,
            validators: [
                {
                    power: 0,
                    pub_key_bytes: pkBytes,
                    pub_key_type: 'Ed25519',
                },
            ],
        });
        expect(response.app_hash).toBeDefined()
    });

    it('Should verify a valid transaction', async () => {
        const mb = new Microblock(VirtualBlockchainType.ACCOUNT_VIRTUAL_BLOCKCHAIN);
        mb.addSections([
            {
                type: SectionType.ACCOUNT_CREATION,
                sellerAccount: new Uint8Array([1]),
                amount: 12,
            },
        ]);
        const response = await abci.CheckTx({
            tx: mb.serialize().microblockData,
            type: CheckTxType.CHECK_TX_TYPE_CHECK,
        });
        expect(response.code).toEqual(1)
    });
});