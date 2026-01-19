import {
    InitChainRequest,
} from '../../proto-ts/cometbft/abci/v1/types';

import {
    Microblock,
    MicroblockConsistencyChecker,
    PrivateSignatureKey,
    CryptoEncoderFactory,
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
        const issuerPublicKey = await issuerPrivateKey.getPublicKey();
        const genesisValidator = request.validators[0];
        const genesisNodePubKey = genesisValidator.pub_key_bytes;
        const genesisNodeRpcEndpoint = this.nodeConfig.getCometbftExposedRpcEndpoint();
        const encoder = CryptoEncoderFactory.defaultStringSignatureEncoder();

        const runoffTransactionsBuilder = new GenesisRunoffTransactionsBuilder(
            this.genesisRunoffs,
            await encoder.encodePrivateKey(issuerPrivateKey),
            await encoder.encodePublicKey(issuerPublicKey),
            Utils.binaryToHexa(genesisNodePubKey),
            genesisNodeRpcEndpoint,
        );
        const runoffsTransactions = await runoffTransactionsBuilder.createRunoffTransactions();

        await this.publishGenesisTransactions(runoffsTransactions, 1);

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
