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
    Hash,
    Sha256CryptographicHash,
    Secp256k1PrivateSignatureKey,
    PublicSignatureKey,
    PrivateSignatureKey,
    CryptoEncoderFactory,
    AbciRequest,
    AccountByPublicKeyHashAbciResponseSchema,
    AccountStateAbciResponseSchema,
    VirtualBlockchainStateAbciResponseSchema,
    ValidatorNodeByAddressAbciResponseSchema,
    CMTSToken,
    CometBFTPublicKeyConverter, BlockchainUtils,
} from '@cmts-dev/carmentis-sdk/server';
import { CheckTxType } from '../../proto/tendermint/abci/types';

interface RunOffsAccountInterface {
    id: string,
    publicKey: string,
    privateKey?: string,
}

interface NodeMisbehavior {
    type: number,
    address: Uint8Array,
}

const GENESIS_NODE_PUBKEY = new Uint8Array(Array(32).keys());
const GENESIS_NODE_ADDRESS = CometBFTPublicKeyConverter.convertRawPublicKeyIntoAddress(GENESIS_NODE_PUBKEY);
const NODE2_PUBKEY = new Uint8Array([
    0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55,
    0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55
]);
const NODE2_ADDRESS = CometBFTPublicKeyConverter.convertRawPublicKeyIntoAddress(NODE2_PUBKEY);

describe('Abci', () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'node'));
    const genesisNodeConfig: NodeConfig = {
        abci: {
            grpc: {
                port: 443,
            },
            min_microblock_gas_in_atomic_accepted: 1,
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

    const pkBytes = GENESIS_NODE_PUBKEY;
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
                address: Utils.binaryToHexa(GENESIS_NODE_ADDRESS),
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
        const time = TestScriptManager.getProtobufTimestamp(Math.floor(Date.now() / 1000));
        const response = await abci.InitChain({
            time,
            consensus_params: {
                block: undefined,
                evidence: undefined,
                validator: undefined,
                version: undefined,
                abci: undefined,
            },
            app_state_bytes: Utils.getNullHash(),
            chain_id: 'cmts:testchain',
            initial_height: 1,
            validators: [
                {
                    power: 0,
                    pub_key: { ed25519: pkBytes },
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

        const invest1AccountId = await scriptManager.getAccountHashByAccountId('invest-1')
        let invest1AccountState;
        const invest2AccountId = await scriptManager.getAccountHashByAccountId('invest-2')
        let invest2AccountState;

        invest2AccountState = await scriptManager.getAccountState(invest2AccountId);
        console.log('invest2AccountState', Utils.binaryToHexa(invest2AccountId), invest2AccountState);

        let hours = 0;

        // create a 1st account
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
            await scriptManager.addMicroblock(mb, sellerAccountId, sellerSk, hours);
        })();

        // create a 2nd account
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
            await scriptManager.addMicroblock(mb, sellerAccountId, sellerSk, hours);
        })();

        await scriptManager.processCometConsensus(0);

        // check linear vesting
        for(let n = 0; n <= 11; n++) {
            await scriptManager.processCometConsensus(hours);
            hours += 24;

            invest1AccountState = await scriptManager.getAccountState(invest1AccountId);
            console.log(`invest1AccountState after ${n} days`, Utils.binaryToHexa(invest1AccountId), invest1AccountState);
            expect(invest1AccountState.locks[0]?.lockedAmountInAtomics || 0).toEqual(Math.max(0, 1_000_000 - Math.max(0, n - 6) * (1_000_000 / 5)));

            invest2AccountState = await scriptManager.getAccountState(invest2AccountId);
            console.log(`invest2AccountState after ${n} days`, Utils.binaryToHexa(invest2AccountId), invest2AccountState);
            expect(invest2AccountState.locks[0]?.lockedAmountInAtomics || 0).toEqual(Math.max(0, 2_000_000 - n * (2_000_000 / 10)));
        }

        // simulate misbehavior, followed by effective slashing
        await scriptManager.processCometConsensus(hours, { type: 1, address: GENESIS_NODE_ADDRESS });
        hours += 30 * 24;
        await scriptManager.processCometConsensus(hours);
        hours += 24;

        // simulate misbehavior, followed by slashing cancellation
        await scriptManager.processCometConsensus(hours, { type: 1, address: NODE2_ADDRESS });
        hours += 24;

        await (async () => {
            const node2Id = (await scriptManager.getValidatorNodeIdByAddress(NODE2_ADDRESS)).validatorNodeHash;
            const node2VbState = await scriptManager.getVirtualBlockchainState(node2Id);
            const governanceAccountId = await scriptManager.getAccountHashByAccountId('governance')
            const governanceAccount = scriptManager.getAccountFromRunOffs('governance');
            if(governanceAccount.privateKey === undefined) throw new Error(`Cannot retrieve private key of governance account`);
            const encodedGovernanceSk = governanceAccount.privateKey;
            const governanceSk = await sigEncoder.decodePrivateKey(encodedGovernanceSk);
            const mb = new Microblock(VirtualBlockchainType.NODE_VIRTUAL_BLOCKCHAIN);

            mb.addSections([
                {
                    type: SectionType.VN_SLASHING_CANCELLATION,
                    reason: 'This was a bug.',
                },
            ]);
            mb.setPreviousHash(Hash.from(node2VbState.lastMicroblockHash));
            mb.setHeight(node2VbState.height + 1);
            await scriptManager.addMicroblock(mb, governanceAccountId, governanceSk, hours);
        })();
        await scriptManager.processCometConsensus(hours);
    }, 45000);
});

class TestScriptManager {
    abci: GrpcAbciController;
    height: number;
    referenceTimestamp: number;
    runOffsFile: string;
    txs: Uint8Array[];
    blockTimestamp: number[];

    constructor(abci: GrpcAbciController, initialHeight: number, referenceTimestamp: number, runOffsFile: string) {
        this.abci = abci;
        this.height = initialHeight;
        this.referenceTimestamp = referenceTimestamp;
        this.runOffsFile = runOffsFile;
        this.txs = [];
        this.blockTimestamp = [];
    }

    async addMicroblock(mb: Microblock, payerAccountHash: Uint8Array, payerSk: PrivateSignatureKey, elapsedHours: number) {
        const feesFormulaVersion = 1;
//      const feesFormula = FeesCalculationFormulaFactory.getFeesCalculationFormulaByVersion(feesFormulaVersion);
//      const maxFees = await feesFormula.computeFees(payerSk.getSignatureSchemeId(), mb);
        const maxFees = CMTSToken.createCMTS(100);
        const timestampInSeconds = this.referenceTimestamp + elapsedHours * 3600;

        mb.setFeesPayerAccount(payerAccountHash);
        mb.setMaxFees(maxFees);
        mb.setTimestamp(timestampInSeconds);
        await mb.seal(payerSk);

        const response = await this.abci.CheckTx(
            {
                tx: mb.serialize().microblockData,
                type: CheckTxType.RECHECK,
            },
            timestampInSeconds
        );
        expect(response.code).toEqual(CheckTxResponseCode.OK)

        this.txs.push(mb.serialize().microblockData);
    }

    async processCometConsensus(elapsedHours: number, nodeMisbehavior: NodeMisbehavior|undefined = undefined) {
        const timestampInSeconds = this.referenceTimestamp + elapsedHours * 3600;
        const time = TestScriptManager.getProtobufTimestamp(timestampInSeconds);

        this.blockTimestamp[this.height] = timestampInSeconds;

        const misbehavior = [];

        if (nodeMisbehavior) {
            misbehavior.push({
                type: nodeMisbehavior.type,
                validator: {
                    address: nodeMisbehavior.address,
                    power: 100000000000
                },
                height: this.height - 1,
                time: TestScriptManager.getProtobufTimestamp(this.blockTimestamp[this.height - 1]),
                total_voting_power: 100000000000
            });
        }

        const prepareProposalResponse = await this.abci.PrepareProposal({
            txs: this.txs,
            max_tx_bytes: 2 ** 24,
            misbehavior,
            height: this.height,
            proposer_address: new Uint8Array,
            next_validators_hash: new Uint8Array,
            local_last_commit: undefined,
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
            misbehavior,
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
            misbehavior,
            hash: new Uint8Array,
            height: this.height,
            proposer_address: new Uint8Array,
            next_validators_hash: new Uint8Array,
            time,
        });

        expect(finalizeBlockResponse.tx_results.length).toEqual(this.txs.length);
        expect(finalizeBlockResponse.tx_results.every((result) => result.code == 0)).toEqual(true);

        const commitResponse = await this.abci.Commit({});
        this.txs = [];
        this.height++;
    }

    async getAccountHashByAccountId(id: string) {
        const account = this.getAccountFromRunOffs(id);
        const encodedPk = account.publicKey;
        const sigEncoder = CryptoEncoderFactory.defaultStringSignatureEncoder();
        const pk = await sigEncoder.decodePublicKey(encodedPk);
        const accountHash = await this.getAccountByPublicKey(pk);
        return accountHash;
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

    async getVirtualBlockchainState(vbId: Uint8Array) {
        const answer = await this.query({
            requestType: AbciRequestType.GET_VIRTUAL_BLOCKCHAIN_STATE,
            virtualBlockchainId: vbId,
        });

        const response = v.parse(VirtualBlockchainStateAbciResponseSchema, answer);
        const state = BlockchainUtils.decodeVirtualBlockchainState(response.serializedVirtualBlockchainState);
        return state;
    }

    async getValidatorNodeIdByAddress(address: Uint8Array) {
        const answer = await this.query({
            requestType: AbciRequestType.GET_VALIDATOR_NODE_BY_ADDRESS,
            address: address
        });

        const response = v.parse(ValidatorNodeByAddressAbciResponseSchema, answer);
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

    getAccountFromRunOffs(id: string): RunOffsAccountInterface {
        const data = readFileSync(this.runOffsFile);
        const object = JSON.parse(data.toString()) as { accounts: RunOffsAccountInterface[] };
        const account = object.accounts.find((account) => account.id == id);

        if(account === undefined) {
            throw new Error(`account '${id}' not found in runOffs file`);
        }
        return account;
    }

    static getProtobufTimestamp(seconds: number) {
        return {
            seconds,
            nanos: 0,
        };
    }
}
