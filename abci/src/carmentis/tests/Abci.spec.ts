// This file contains the tests which emulates the CometBFT server.

import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { RestABCIQueryModule } from '../rest-abci-query/RestABCIQueryModule';
import { HttpModule } from '@nestjs/axios';
import { AbciModule } from '../abci/AbciModule';
import { NodeConfigService } from '../config/services/NodeConfigService';
import { GrpcAbciController } from '../abci/controllers/GrpcAbciController';
import { CheckTxResponseCode } from '../abci/CheckTxResponseCode';
import { NodeConfig } from '../config/types/NodeConfig';
import { mkdtempSync, readFileSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as v from 'valibot';
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
    AbciRequestType,
    AbciResponseType,
    VirtualBlockchainType,
    AbciQueryEncoder,
    Utils,
    Sha256CryptographicHash,
    Secp256k1PrivateSignatureKey,
    PublicSignatureKey,
    PrivateSignatureKey,
    CryptoEncoderFactory,
    FeesCalculationFormulaFactory,
    AbciRequest,
} from '@cmts-dev/carmentis-sdk/server';
import { CheckTxResponse, CheckTxType, QueryRequest } from '../../proto-ts/cometbft/abci/v1/types';
import {
    AccountByPublicKeyHashAbciResponseSchema,
    AccountStateAbciResponseSchema,
} from "../../../../../carmentis-core/src/common/type/valibot/provider/abci/AbciResponse";

interface RunOffsAccountInterface {
    name: string,
    publicKey: string,
    privateKey?: string
}

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
            runoffFilePath: `.`,
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

    it('Should initialize as a genesis', async () => {
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
    }, 45000);

    it('Script', async () => {
        const scriptManager = new TestScriptManager(
            abci,
            2,
            Math.floor(Date.now() / 1000),
            './genesisRunoffs.json'
        );

        const sellerAccount = scriptManager.getAccountFromRunOffs('team-advisors');
        if(sellerAccount.privateKey === undefined) throw new Error(`Cannot retrieve private key of seller account`);
        const encodedSellerSk = sellerAccount.privateKey;
        const sigEncoder = CryptoEncoderFactory.defaultStringSignatureEncoder();
        const sellerSk = await sigEncoder.decodePrivateKey(encodedSellerSk);
        const sellerPk = await sellerSk.getPublicKey();
        const sellerAccountId = await scriptManager.getAccountByPublicKey(sellerPk);

        const invest2Account = scriptManager.getAccountFromRunOffs('invest-2');
        const encodedInvest2Pk = invest2Account.publicKey;
        const invest2Pk = await sigEncoder.decodePublicKey(encodedInvest2Pk);
        const invest2AccountId = await scriptManager.getAccountByPublicKey(invest2Pk);
        let invest2AccountState;

        invest2AccountState = await scriptManager.getAccountState(invest2AccountId);
        console.log('invest2AccountState', Utils.binaryToHexa(invest2AccountId), invest2AccountState);

        await (async () => {
            const mb = new Microblock(VirtualBlockchainType.ACCOUNT_VIRTUAL_BLOCKCHAIN);
            const sk = Secp256k1PrivateSignatureKey.gen();
            const pk = await sk.getPublicKey();

            mb.addSections([
                {
                    type: SectionType.ACCOUNT_PUBLIC_KEY,
                    publicKey: await pk.getPublicKeyAsBytes(),
                    schemeId: pk.getSignatureSchemeId()
                },
                {
                    type: SectionType.ACCOUNT_CREATION,
                    sellerAccount: sellerAccountId,
                    amount: 12,
                },
            ]);
            await scriptManager.addMicroblock(mb, sellerAccountId, sellerSk, 0);
        })();

        await (async () => {
            const mb = new Microblock(VirtualBlockchainType.ACCOUNT_VIRTUAL_BLOCKCHAIN);
            const sk = Secp256k1PrivateSignatureKey.gen();
            const pk = await sk.getPublicKey();

            mb.addSections([
                {
                    type: SectionType.ACCOUNT_PUBLIC_KEY,
                    publicKey: await pk.getPublicKeyAsBytes(),
                    schemeId: pk.getSignatureSchemeId()
                },
                {
                    type: SectionType.ACCOUNT_CREATION,
                    sellerAccount: sellerAccountId,
                    amount: 0,
                },
            ]);
            await scriptManager.addMicroblock(mb, sellerAccountId, sellerSk, 0);
        })();

        await scriptManager.processCometConsensus(0);

        for(let n = 0; n <= 11; n++) {
            await scriptManager.processCometConsensus(n * 24);

            invest2AccountState = await scriptManager.getAccountState(invest2AccountId);
            console.log(`invest2AccountState after ${n} days`, Utils.binaryToHexa(invest2AccountId), invest2AccountState);
        }
    }, 45000);
});

class TestScriptManager {
    abci: GrpcAbciController;
    height: number;
    referenceTimestamp: number;
    runOffsFile: string;
    txs: Uint8Array[];

    constructor(abci: GrpcAbciController, initialHeight: number, referenceTimestamp: number, runOffsFile: string) {
        this.abci = abci;
        this.height = initialHeight;
        this.referenceTimestamp = referenceTimestamp;
        this.runOffsFile = runOffsFile;
        this.txs = [];
    }

    async addMicroblock(mb: Microblock, payerAccountHash: Uint8Array, payerSk: PrivateSignatureKey, elapsedHours: number) {
        const feesFormulaVersion = 1;
        const feesFormula = FeesCalculationFormulaFactory.getFeesCalculationFormulaByVersion(feesFormulaVersion);
        const timestampInSeconds = this.referenceTimestamp + elapsedHours * 3600;

        mb.setFeesPayerAccount(payerAccountHash);
        mb.setGas(await feesFormula.computeFees(payerSk.getSignatureSchemeId(), mb));
        mb.setTimestamp(timestampInSeconds);
        await mb.seal(payerSk);

        const response = await this.abci.CheckTx(
            {
                tx: mb.serialize().microblockData,
                type: CheckTxType.CHECK_TX_TYPE_CHECK,
            },
            timestampInSeconds
        );
        expect(response.code).toEqual(CheckTxResponseCode.OK)

        this.txs.push(mb.serialize().microblockData);
    }

    async processCometConsensus(elapsedHours: number) {
        const timestampInSeconds = this.referenceTimestamp + elapsedHours * 3600;
        const time = {
            seconds: timestampInSeconds,
            nanos: 0
        };

        const prepareProposalResponse = await this.abci.PrepareProposal({
            txs: this.txs,
            max_tx_bytes: 2 ** 24,
            misbehavior: [],
            height: this.height,
            proposer_address: new Uint8Array,
            next_validators_hash: new Uint8Array,
            time
        });

        expect(prepareProposalResponse.txs.length).toEqual(this.txs.length);

        const lastCommit = {
            round: 1,
            votes: []
        };

        const processProposalResponse = await this.abci.ProcessProposal({
            txs: this.txs,
            proposed_last_commit: lastCommit,
            misbehavior: [],
            hash: new Uint8Array,
            height: this.height,
            proposer_address: new Uint8Array,
            next_validators_hash: new Uint8Array,
            time
        });

        expect(processProposalResponse.status).toEqual(1);

        const finalizeBlockResponse = await this.abci.FinalizeBlock({
            txs: this.txs,
            decided_last_commit: lastCommit,
            misbehavior: [],
            hash: new Uint8Array,
            height: this.height,
            proposer_address: new Uint8Array,
            next_validators_hash: new Uint8Array,
            time,
            syncing_to_height: this.height
        });

        expect(finalizeBlockResponse.tx_results.length).toEqual(this.txs.length);
        expect(finalizeBlockResponse.tx_results.every((result) => result.code == 0)).toEqual(true);

        const commitResponse = await this.abci.Commit({});
        this.txs = [];
        this.height++;
    }

    async getAccountByPublicKey(pk: PublicSignatureKey) {
        const hashScheme = new Sha256CryptographicHash();
        const publicKeyHash = hashScheme.hash(await pk.getPublicKeyAsBytes());
        const answer = await this.query({
            requestType: AbciRequestType.GET_ACCOUNT_BY_PUBLIC_KEY_HASH,
            publicKeyHash
        });

        const response = v.parse(AccountByPublicKeyHashAbciResponseSchema, answer);
        return response.accountHash;
    }

    async getAccountState(accountHash: Uint8Array) {
        const answer = await this.query({
            requestType: AbciRequestType.GET_ACCOUNT_STATE,
            accountHash
        });

        const response = v.parse(AccountStateAbciResponseSchema, answer);
        return response;
    }

    async query(request: AbciRequest) {
        const abciQuery = {
            data: AbciQueryEncoder.encodeAbciRequest(request),
            path: '',
            height: 0,
            prove: false
        };

        const response = await this.abci.Query(abciQuery);
        const abciResponse = AbciQueryEncoder.decodeAbciResponse(response.value);

        if (abciResponse.responseType == AbciResponseType.ERROR) {
            const errorMsg = abciResponse.error;
            throw new Error(errorMsg);
        }

        return abciResponse;
    }

    getAccountFromRunOffs(name: string): RunOffsAccountInterface {
        const data = readFileSync(this.runOffsFile);
        const object = JSON.parse(data.toString()) as { accounts: RunOffsAccountInterface[] };
        const account = object.accounts.find((account) => account.name == name);

        if(account === undefined) {
            throw new Error(`account '${name}' not found in runOffs file`);
        }
        return account;
    }
}
