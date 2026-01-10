import {
    InitChainRequest,
} from '../../proto-ts/cometbft/abci/v1/types';

import {
    ECO,
    CMTSToken,
    Microblock,
    MicroblockConsistencyChecker,
    PrivateSignatureKey,
    SectionType,
    VirtualBlockchainType,
    Utils,
} from '@cmts-dev/carmentis-sdk/server';

import { getLogger } from '@logtape/logtape';
import { NodeConfigService } from '../config/services/NodeConfigService';
import { MicroblockCheckResult } from './types/MicroblockCheckResult';
import { GlobalState } from './state/GlobalState';
import { GlobalStateUpdaterFactory } from './state/GlobalStateUpdaterFactory';
import { GenesisRunoff } from './GenesisRunoff';
import { GenesisRunoffTransactionsBuilder } from './GenesisRunoffTransactionsBuilder';

export class GenesisInitialTransactionsBuilder {
    private logger = getLogger(['node', 'genesis', GenesisInitialTransactionsBuilder.name]);
    private nodeConfig: NodeConfigService;
    private globalState: GlobalState;
    private genesisRunoffs: GenesisRunoff;

    constructor(nodeConfig: NodeConfigService, globalState: GlobalState, genesisRunoffs: GenesisRunoff) {
        this.globalState = globalState;
        this.nodeConfig = nodeConfig;
        this.genesisRunoffs = genesisRunoffs;
    }

    async publishInitialBlockchainState(
        issuerPrivateKey: PrivateSignatureKey,
        request: InitChainRequest,
    ) {
        // define variables used below
        const issuerPublicKey = await issuerPrivateKey.getPublicKey();

        // we first create the issuer account
        this.logger.info('Creating microblock for issuer account creation');
        const issuerAccountCreationMicroblock = Microblock.createGenesisAccountMicroblock();
        issuerAccountCreationMicroblock.addSections([
            {
                type: SectionType.ACCOUNT_PUBLIC_KEY,
                publicKey: await issuerPublicKey.getPublicKeyAsBytes(),
                schemeId: issuerPublicKey.getSignatureSchemeId(),
            },
            {
                type: SectionType.ACCOUNT_TOKEN_ISSUANCE,
                amount: ECO.INITIAL_OFFER,
            },
        ]);
        await issuerAccountCreationMicroblock.seal(issuerPrivateKey);
        const {
            microblockData: issuerAccountCreationSerializedMicroblock,
            microblockHash: issuerAccountHash,
        } = issuerAccountCreationMicroblock.serialize();

        // we now create the Carmentis Governance organization
        this.logger.info('Creating governance organization microblock');
        const governanceOrganizationMicroblock = Microblock.createGenesisOrganizationMicroblock();
        governanceOrganizationMicroblock.addSections([
            {
                type: SectionType.ORG_CREATION,
                accountId: issuerAccountHash,
            },
            {
                type: SectionType.ORG_DESCRIPTION,
                name: 'Carmentis Governance',
                website: '',
                countryCode: 'FR',
                city: '',
            },
        ]);
        await governanceOrganizationMicroblock.seal(issuerPrivateKey);
        const { microblockData: governanceOrganizationData, microblockHash: governanceOrgId } =
            governanceOrganizationMicroblock.serialize();
        this.logger.debug(governanceOrganizationMicroblock.toString());

        // we now create the Carmentis SAS organization
        this.logger.info('Creating Carmentis SAS organization microblock');
        const carmentisOrganizationMicroblock = Microblock.createGenesisOrganizationMicroblock();
        carmentisOrganizationMicroblock.addSections([
            {
                type: SectionType.ORG_CREATION,
                accountId: issuerAccountHash,
            },
            {
                type: SectionType.ORG_DESCRIPTION,
                name: 'Carmentis SAS',
                website: '',
                countryCode: 'FR',
                city: '',
            },
        ]);
        await carmentisOrganizationMicroblock.seal(issuerPrivateKey);
        const { microblockData: carmentisOrganizationData, microblockHash: carmentisOrgId } =
            carmentisOrganizationMicroblock.serialize();

        // we create the (single) protocol virtual blockchain
        this.logger.info('Creating protocol microblock');
        const protocolMicroblock = Microblock.createGenesisProtocolMicroblock();
        protocolMicroblock.addSection({
            type: SectionType.PROTOCOL_CREATION,
            organizationId: governanceOrgId,
        });
        await protocolMicroblock.seal(issuerPrivateKey);
        const { microblockData: protocolInitialUpdate } = protocolMicroblock.serialize();

        // We now declare the running node as the genesis node.
        this.logger.info('Creating genesis validator node microblock');
        const genesisNodeMb = Microblock.createGenesisValidatorNodeMicroblock();
        const genesisValidator = request.validators[0];
        const rpcEndpoint = this.nodeConfig.getCometbftExposedRpcEndpoint();
        this.logger.info(Utils.binaryToHexa(genesisValidator.pub_key_bytes));
        this.logger.info(`RPC endpoint: ${rpcEndpoint}`);
        genesisNodeMb.addSections([
            {
                type: SectionType.VN_CREATION,
                organizationId: carmentisOrgId,
            },
            {
                type: SectionType.VN_COMETBFT_PUBLIC_KEY_DECLARATION,
                cometPublicKey: Utils.binaryToHexa(genesisValidator.pub_key_bytes),
                cometPublicKeyType: 'tendermint/PubKeyEd25519',
            },
            {
                type: SectionType.VN_RPC_ENDPOINT,
                rpcEndpoint,
            },
        ]);
        await genesisNodeMb.seal(issuerPrivateKey);
        const { microblockData: carmentisNodeMicroblock, microblockHash: genesisNodeId } = genesisNodeMb.serialize();
        this.logger.debug(genesisNodeMb.toString());

        // We stake the tokens for the genesis node
        this.logger.info('Creating staking for genesis validator node');
        const genesisNodeStakingMb = Microblock.createGenesisAccountMicroblock();
        genesisNodeStakingMb.addSection({
            type: SectionType.ACCOUNT_STAKE,
            amount: CMTSToken.createCMTS(1_000_000).getAmount(),
            objectType: VirtualBlockchainType.NODE_VIRTUAL_BLOCKCHAIN,
            objectIdentifier: genesisNodeId
        });
        genesisNodeStakingMb.setAsSuccessorOf(issuerAccountCreationMicroblock);
        await genesisNodeStakingMb.seal(issuerPrivateKey);
        const { microblockData: genesisNodeStaking } = genesisNodeStakingMb.serialize();

        // We emit the approval of the governance for the genesis node as a validator
        const validatorNodeVotingPowerUpdateMb = Microblock.createGenesisValidatorNodeMicroblock();
        validatorNodeVotingPowerUpdateMb.addSections([
            {
                type: SectionType.VN_APPROVAL,
                status: true,
            },
        ]);
        validatorNodeVotingPowerUpdateMb.setAsSuccessorOf(genesisNodeMb);
        await validatorNodeVotingPowerUpdateMb.seal(issuerPrivateKey);
        const { microblockData: serializedVnVotingPowerUpdateMb } =
            validatorNodeVotingPowerUpdateMb.serialize();
        this.logger.debug(validatorNodeVotingPowerUpdateMb.toString());

        // we now proceed to the runoff
        const transactions: Uint8Array[] = [
            issuerAccountCreationSerializedMicroblock,
            governanceOrganizationData,
            protocolInitialUpdate,
            carmentisOrganizationData,
            carmentisNodeMicroblock,
            genesisNodeStaking,
            serializedVnVotingPowerUpdateMb,
        ];
        const runoffTransactionsBuilder = new GenesisRunoffTransactionsBuilder(
            this.genesisRunoffs,
            issuerAccountHash,
            issuerPrivateKey,
            issuerPublicKey,
            [ issuerAccountCreationMicroblock, genesisNodeStakingMb ],
        );
        const runoffsTransactions = await runoffTransactionsBuilder.createRunoffTransactions();
        transactions.push(...runoffsTransactions);

        await this.publishGenesisTransactions(transactions, 1);

        const { appHash } = await this.globalState.getApplicationHash();
        return appHash;
    }

    private async publishGenesisTransactions(
        transactions: Uint8Array[],
        publishedBlockHeight: number,
    ) {
        // Since we are publishing transactions at the genesis, publication timestamp is at the lowest possible value.
        // The proposer address is undefined since we do not have published this node.
        const logger = getLogger(['node', 'genesis']);
        const blockTimestamp = Utils.getTimestampInSeconds();
        const globalStateUpdater = GlobalStateUpdaterFactory.createGlobalStateUpdater();
        let txIndex = 0;

        // we create working state to check the transaction
        const workingState = this.globalState;

        for (const tx of transactions) {
            txIndex += 1;
            logger.debug(`Handling transaction ${txIndex} on ${transactions.length}`);
            try {
                const serializedMicroblock = tx;
                const parsedMicroblock =
                    Microblock.loadFromSerializedMicroblock(serializedMicroblock);
                logger.info(
                    `Transaction parsed successfully: microblock ${parsedMicroblock.getHash().encode()} (type ${parsedMicroblock.getType()})`,
                );
                logger.debug(parsedMicroblock.toString());

                const checkResult = await this.checkMicroblockLocalStateConsistency(
                    workingState,
                    parsedMicroblock,
                );
                if (checkResult.checked) {
                    const vb = checkResult.vb;
                    // we now check the consistency of the working state with the global state
                    const updatedVirtualBlockchain = checkResult.vb;
                    await globalStateUpdater.updateGlobalStateOnMicroblockDuringGenesis(
                        workingState,
                        updatedVirtualBlockchain,
                        parsedMicroblock,
                        {
                            blockHeight: publishedBlockHeight,
                            blockTimestamp,
                            blockMisbehaviors: [],
                        },
                        tx,
                    );
                } else {
                    logger.warn(`Microblock ${parsedMicroblock.getHash().encode()} rejected`);
                }
            } catch (e) {
                logger.error(`An error occurred during handling of genesis microblock: ${e}`);
                if (e instanceof Error) {
                    logger.debug(e.stack ?? 'No stack provided');
                }
            }
        }

        // finalize the working state
        this.logger.info(
            `Finalizing publication of ${transactions.length} transactions at height ${publishedBlockHeight}`,
        );
        await globalStateUpdater.finalizeBlockApproval(workingState, {
            hash: Utils.getNullHash(),
            height: publishedBlockHeight,
            misbehavior: [],
            next_validators_hash: Utils.getNullHash(),
            proposer_address: Utils.getNullHash(),
            syncing_to_height: publishedBlockHeight,
            txs: transactions,
        });

        // commit the state
        this.logger.info(`Committing state at height ${publishedBlockHeight}`);
        await this.globalState.commit();

        const { appHash } = await this.globalState.getApplicationHash();
        return appHash;
    }

    private async checkMicroblockLocalStateConsistency(
        workingState: GlobalState,
        checkedMicroblock: Microblock,
        referenceTimestamp = Utils.getTimestampInSeconds()
    ): Promise<MicroblockCheckResult> {
        this.logger.debug(
            `Checking microblock local state consistency (genesis mode)`,
        );
        try {
            const checker = new MicroblockConsistencyChecker(workingState, checkedMicroblock);

            // loading and checking virtual blockchain consistency when adding the microblock
            this.logger.debug(`Checking virtual blockchain consistency...`);
            await checker.checkVirtualBlockchainConsistencyOrFail();

            // check the consistency of the timestamp defined in the microblock
            this.logger.debug('Checking timestamp consistency...');
            checker.checkTimestampOrFail(referenceTimestamp);

            // gas consistency is not checked during genesis
            this.logger.debug('Running in genesis mode, skipping gas consistency check');

            this.logger.debug('Checks are done');
            const vb = checker.getVirtualBlockchain();
            return { checked: true, vb: vb };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Microblock rejected: ${errorMessage}`);
            if (error instanceof Error) {
                this.logger.debug(`Error details: ${error}`);
                this.logger.debug(error.stack || 'No stack trace available');
            }
            return {
                checked: false,
                error: errorMessage,
            };
        }
    }
}
