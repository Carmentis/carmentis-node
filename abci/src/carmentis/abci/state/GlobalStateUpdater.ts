import {
    AccountInformation,
    AccountVb,
    Base64,
    CHAIN,
    CMTSToken,
    ECO,
    Economics,
    FeesCalculationFormulaFactory,
    Hash,
    Microblock,
    ProtocolVb,
    SectionType,
    Utils,
    ValidatorNodeCometbftPublicKeyDeclarationSection,
    ValidatorNodeVb,
    ValidatorNodeVotingPowerUpdateSection,
    VirtualBlockchain,
    BalanceAvailability,
    VirtualBlockchainType,
} from '@cmts-dev/carmentis-sdk/server';
import { CometBFTPublicKeyConverter } from '../CometBFTPublicKeyConverter';
import { getLogger } from '@logtape/logtape';
import { AccountManager, Transfer } from '../accounts/AccountManager';
import { GlobalState } from './GlobalState';
import { RequestFinalizeBlock } from '../../../proto/tendermint/abci/types';
import { GlobalStateUpdateCometParameters } from '../types/GlobalStateUpdateCometParameters';
import { ProcessedMicroblock } from '../types/ProcessBlockResult';
import { LevelDb } from '../database/LevelDb';
import { CometValidatorSetUpdate, ValidatorSetUpdate } from '../types/ValidatorSetUpdate';
import { BlockIDFlag } from '../../../proto/tendermint/types/validator';
import { LevelDbTable } from '../database/LevelDbTable';
import { FeesDispatcher } from '../accounts/FeesDispatcher';
import { CometBFTUtils } from '../CometBFTUtils';

const KEY_TYPE_MAPPING: Record<string, string> = {
    'tendermint/PubKeyEd25519': 'ed25519',
};

export class GlobalStateUpdater {
    static createUpdater() {
        return new GlobalStateUpdater();
    }

    // map of validator set updates
    private validatorSetUpdates: Map<string, ValidatorSetUpdate> = new Map();

    // we use these values for statistics purpose
    private newObjectCounts = Array(CHAIN.N_VIRTUAL_BLOCKCHAINS).fill(0);
    private processedAndAcceptedMicroblocks: ProcessedMicroblock[] = [];
    private totalFees = 0;
    private blockSizeInBytes = 0;
    private blockSectionCount = 0;

    private logger = getLogger(['node', 'state', GlobalStateUpdater.name]);

    async updateGlobalStateOnBlock(
        globalState: GlobalState,
        cometParameters: GlobalStateUpdateCometParameters
    ) {
        const blockHeight = cometParameters.blockHeight;
        const database = globalState.getCachedDatabase();
        const existingBlock = await database.getBlockContent(blockHeight);
        if (existingBlock !== undefined) {
            if (blockHeight == 1) {
                throw new Error(`duplicate block at height 1: make sure initial_height is set to "2" in genesis.json`);
            }
            else {
                throw new Error(`duplicate block at height ${blockHeight}`);
            }
        }
        const previousBlockInformation = await database.getBlockInformation(blockHeight - 1);
        const previousBlockDayTs = previousBlockInformation ?
            Utils.addDaysToTimestamp(previousBlockInformation.timestamp, 0) :
            0;
        const currentBlockDayTs = Utils.addDaysToTimestamp(cometParameters.blockTimestamp, 0);

        // process misbehaviors
        for(const misbehavior of cometParameters.blockMisbehaviors) {
            // retrieve node address and node hash
            if (misbehavior.validator === undefined) throw new Error(`Misbehavior of type ${misbehavior.type} detected, but no validator specified`);
            const validatorNodeAddress = misbehavior.validator.address;
            this.logger.error(`MISBEHAVIOR OF TYPE ${misbehavior.type} DETECTED FOR NODE '${Utils.binaryToHexa(validatorNodeAddress)}'`);
            const dataObject = await database.getValidatorNodeByAddress(validatorNodeAddress);
            if (dataObject === undefined) throw new Error(`Validator node with address ${Utils.binaryToHexa(validatorNodeAddress)} not found`);
            const validatorNodeHash = dataObject.validatorNodeHash;
            const validatorNode = await globalState.loadValidatorNodeVirtualBlockchain(new Hash(validatorNodeHash));
            const accountId = await this.getAccountIdFromValidatorNode(validatorNode);
        }

        // if this is the first block of the day, apply daily updates
        if (currentBlockDayTs != previousBlockDayTs) {
            this.logger.info('First block of the day: applying daily updates');
            globalState.setNewDayTimestamp(currentBlockDayTs);
            await this.updateVestingLocks(globalState, cometParameters);
            await this.updateEscrowLocks(globalState, cometParameters);
            await this.applyNodeStakingUnlocks(globalState, cometParameters);
            await this.purgeDataFileTable(globalState, cometParameters);
        }
    }

    /**
     * Updates vesting locks: applies linear vesting.
     */
    private async updateVestingLocks(globalState: GlobalState, cometParameters: GlobalStateUpdateCometParameters) {
        const database = globalState.getCachedDatabase();
        const currentBlockDayTs = Utils.addDaysToTimestamp(cometParameters.blockTimestamp, 0);
        const accountsWithVestingLocksIdentifiers = await database.getKeys(LevelDbTable.ACCOUNTS_WITH_VESTING_LOCKS);

        for(const accountHash of accountsWithVestingLocksIdentifiers) {
            this.logger.info(`Applying linear vesting for account ${Utils.binaryToHexa(accountHash)}`);

            const accountState = await this.getAccountStateOrFail(globalState, accountHash);
            const balanceAvailability = new BalanceAvailability(
                accountState.balance,
                accountState.locks,
            );

            if(balanceAvailability.applyLinearVesting(currentBlockDayTs) > 0) {
                accountState.locks = balanceAvailability.getLocks();
                await database.putAccountState(accountHash, accountState);

                if(!balanceAvailability.hasVestingLocks()) {
                    this.logger.info(`No more vesting locks on account ${Utils.binaryToHexa(accountHash)}: removing entry from ACCOUNTS_WITH_VESTING_LOCKS`);
                    await database.del(LevelDbTable.ACCOUNTS_WITH_VESTING_LOCKS, accountHash);
                }
            }
        }
    }

    /**
     * Updates escrow locks: sends back the funds in case of expiration.
     */
    private async updateEscrowLocks(globalState: GlobalState, cometParameters: GlobalStateUpdateCometParameters) {
        const database = globalState.getCachedDatabase();
        const blockHeight = cometParameters.blockHeight;
        const currentBlockDayTs = Utils.addDaysToTimestamp(cometParameters.blockTimestamp, 0);
        const accountManager = globalState.getAccountManager();
        const escrowIdentifiers = await database.getKeys(LevelDbTable.ESCROWS);

        for(const id of escrowIdentifiers) {
            // TODO: it would be more efficient to have a method that directly returns all objects of a table
            const escrow = await database.getEscrow(id);
            if (escrow == null) {
                throw new Error(`Escrow ${id.toString()} not found`);
            }

            const accountState = await this.getAccountStateOrFail(globalState, escrow.payeeAccount);
            const balanceAvailability = new BalanceAvailability(
                accountState.balance,
                accountState.locks,
            );
            const escrowLocks = balanceAvailability.getEscrowLocks();

            for(const lock of escrowLocks) {
                const isEscrowLockExpired = currentBlockDayTs > Utils.addDaysToTimestamp(
                    lock.parameters.startTimestamp,
                    lock.parameters.durationDays
                );
                if (isEscrowLockExpired) {
                    // the escrow has expired: the funds are sent back from payee to payer
                    this.logger.info(`Escrow has expired`);
                    const tokenTransfer: Transfer = {
                        type: ECO.BK_SENT_EXPIRED_ESCROW,
                        payerAccount: escrow.payeeAccount,
                        payeeAccount: escrow.payerAccount,
                        amount: lock.lockedAmountInAtomics
                    };
                    const chainReference = {
                        height: blockHeight
                    };

                    await accountManager.tokenTransfer(
                        tokenTransfer,
                        chainReference,
                        cometParameters.blockTimestamp
                    );
                }
            }
        }
    }

    /**
     * Updates node staking locks: unlocks the funds in case of expiration of the unstaking period.
     */
    private async applyNodeStakingUnlocks(globalState: GlobalState, cometParameters: GlobalStateUpdateCometParameters) {
        const database = globalState.getCachedDatabase();
        const currentBlockDayTs = Utils.addDaysToTimestamp(cometParameters.blockTimestamp, 0);
        const accountsWithStakingLocksIdentifiers = await database.getKeys(LevelDbTable.ACCOUNTS_WITH_STAKING_LOCKS);

        for(const accountHash of accountsWithStakingLocksIdentifiers) {
            const accountState = await this.getAccountStateOrFail(globalState, accountHash);
            const balanceAvailability = new BalanceAvailability(
                accountState.balance,
                accountState.locks,
            );
            if(balanceAvailability.applyNodeStakingUnlocks(currentBlockDayTs) > 0) {
                accountState.locks = balanceAvailability.getLocks();
                await database.putAccountState(accountHash, accountState);

                if(!balanceAvailability.hasNodeStakingLocks()) {
                    this.logger.info(`No more staking locks on account ${Utils.binaryToHexa(accountHash)}: removing entry from ACCOUNTS_WITH_STAKING_LOCKS`);
                    await database.del(LevelDbTable.ACCOUNTS_WITH_STAKING_LOCKS, accountHash);
                }
            }
        }
    }

    private async getAccountStateOrFail(globalState: GlobalState, accountHash: Uint8Array) {
        const database = globalState.getCachedDatabase();
        const state = await database.getAccountStateByAccountId(accountHash);
        if (state == undefined) {
            throw new Error(`Account state for account ${accountHash.toString()} not found`);
        }
        return state;
    }

    /**
     * Removes expired entries in the DATA_FILE table.
     * Unlike the physical removal of data files which is performed in commit() and only serves to free up disk space,
     * this operation is part of the consensus as it modifies the set of files used in the storage challenges.
     */
    private async purgeDataFileTable(globalState: GlobalState, cometParameters: GlobalStateUpdateCometParameters) {
        const currentBlockDayTs = Utils.addDaysToTimestamp(cometParameters.blockTimestamp, 0);
        const cachedStorage = globalState.getCachedStorage();
        await cachedStorage.purgeDataFileTable(currentBlockDayTs);
    }

    async updateGlobalStateOnMicroblockDuringGenesis(
        globalState: GlobalState,
        virtualBlockchain: VirtualBlockchain,
        microblock: Microblock,
        cometParameters: GlobalStateUpdateCometParameters,
        transaction: Uint8Array
    ) {
        if (virtualBlockchain instanceof AccountVb) {
            // we handle the token issuance case explicitly here
            const accountManager = globalState.getAccountManager();
            const accountVb = virtualBlockchain;
            const hasTokenIssuanceSection = microblock.hasSection(
                SectionType.ACCOUNT_TOKEN_ISSUANCE,
            );
            if (hasTokenIssuanceSection) {
                await this.handleTokenIssuance(accountManager, accountVb, microblock);
            }

            // we handle other cases using the shared account update method
            await this.handleAccountUpdate(globalState, virtualBlockchain, microblock);
        } else if (virtualBlockchain instanceof ValidatorNodeVb) {
            await this.handleValidatorNodeUpdate(globalState, virtualBlockchain, microblock);
        }

        if (virtualBlockchain instanceof ProtocolVb) {
            await this.handleProtocolUpdate(virtualBlockchain, microblock);
        }

        // update the statistics
        const numberOfSectionsInMicroblock: number = microblock.getNumberOfSections();
        this.blockSectionCount += numberOfSectionsInMicroblock;
        this.blockSizeInBytes += transaction.length;
        this.totalFees += 0;
        if (virtualBlockchain.getHeight() == 1) {
            this.newObjectCounts[virtualBlockchain.getType()] += 1;
        }
        this.processedAndAcceptedMicroblocks.push({
            hash: microblock.getHashAsBytes(), //vb.currentMicroblock.hash,
            vbId: virtualBlockchain.getId(),
            vbType: virtualBlockchain.getType(),
            height: virtualBlockchain.getHeight(),
            size: transaction.length,
            sectionCount: numberOfSectionsInMicroblock,
        });

        // store the virtual blockchain local state and microblock in buffer
        await globalState.storeVirtualBlockchainState(virtualBlockchain);
        await globalState.storeMicroblock(
            virtualBlockchain.getExpirationDay(),
            virtualBlockchain,
            microblock,
            transaction,
        );
        await globalState.indexVirtualBlockchain(virtualBlockchain);
    }

    /**
     * Note: this method SHOULD not be called except for the genesis block processing.
     * @private
     */
    private async handleTokenIssuance(
        accountManager: AccountManager,
        accountVb: AccountVb,
        microblock: Microblock,
    ) {
        // recover the public key defined in the account
        const issuerPublicKey = await accountVb.getPublicKey();

        // we ensure the public key is available, otherwise raise an exception (implicit)
        await accountManager.checkPublicKeyAvailabilityOrFail(
            await issuerPublicKey.getPublicKeyAsBytes(),
        );

        // we now perform the token transfer ex nihilo
        for (const [sectionIndex, section] of microblock.getAllSections().entries()) {
            if (section.type !== SectionType.ACCOUNT_TOKEN_ISSUANCE) continue;
            const { amount } = section;
            const accountId = accountVb.getId();
            const tokenTransfer: Transfer = {
                type: ECO.BK_SENT_ISSUANCE,
                payerAccount: null,
                payeeAccount: accountId,
                amount,
            };
            const chainReference = {
                mbHash: microblock.getHash().toBytes(),
                sectionIndex,
            };

            this.logger.debug(`Proceeding to token issuance of ${CMTSToken.createAtomic(amount).toString()} for account ${Utils.binaryToHexa(accountId)}`)
            await accountManager.tokenTransfer(
                tokenTransfer,
                chainReference,
                microblock.getTimestamp(), //context.timestamp,
            );

            await accountManager.saveAccountByPublicKey(
                accountId,
                await issuerPublicKey.getPublicKeyAsBytes(),
            );
        }
    }

    private async handleProtocolUpdate(virtualBlockchain: ProtocolVb, microblock: Microblock) {
        // we currently have nothing to do with the protocol virtual blockchain state,
    }

    async updateGlobalStateOnMicroblock(
        globalState: GlobalState,
        virtualBlockchain: VirtualBlockchain,
        microblock: Microblock,
        cometParameters: GlobalStateUpdateCometParameters,
        transaction: Uint8Array,
    ) {
        this.logger.info(`Updating global state with microblock: ${microblock.getHash().encode()}`);

        // we ignore the microblock if it declares a new protocol VB state and there is already one defined
        const isDeclaringNewProtocolVb = microblock.hasSection(SectionType.PROTOCOL_CREATION);
        if (isDeclaringNewProtocolVb) {
            const isProtocolVbAlreadyDefined = await globalState.isProtocolVbDefined();
            if (isProtocolVbAlreadyDefined) {
                this.logger.warn(
                    `Skipping microblock ${microblock.getHash().encode()} because it declares a new protocol VB state but there is already one defined.`,
                );
                return;
            }
        }

        // we reject the microblock if the microblock does not define the fees payer account
        // or if the fees payer account does not have enough tokens to publish the microblock
        if (!microblock.isFeesPayerAccountDefined()) {
            throw new Error(
                `Microblock ${microblock.getHash().encode()} does not specify fees payer account`,
            );
        }

        // we reject the microblock if one of the following cases fails:
        const feesPayerAccountId = microblock.getFeesPayerAccount();
        const accountManager = globalState.getAccountManager();

        // case 1: The fees payer account is defined in the microblock but does not exist (fast case)
        const feesPayerAccountExists = await accountManager.isAccountDefinedByAccountId(feesPayerAccountId);
        if (!feesPayerAccountExists) {
            throw new Error('Specified fees payer account does not exist');
        }

        // case 2: The fees payer account does not have enough tokens to pay (fast case)
        const feesPayerAccountBalance = await accountManager.getAccountBalanceByAccountId(feesPayerAccountId);
        const feesToPay = await globalState.computeMicroblockFees(
            microblock,
            { referenceTimestampInSeconds: cometParameters.blockTimestamp }
        )

        // the expiration day is a timestamp in seconds
        const expirationDay = virtualBlockchain.getExpirationDay();
        if (expirationDay !== 0) {
            const virtualBlockchainType = virtualBlockchain.getType();
            if (virtualBlockchainType !== VirtualBlockchainType.APP_LEDGER_VIRTUAL_BLOCKCHAIN) {
                throw new Error(`Virtual blockchains other than application ledgers may not have an expiration day`);
            }
            if (cometParameters.blockTimestamp > expirationDay) {
                throw new Error(`This virtual blockchain has expired: no more microblock can be added`);
            }
        }
        const hasEnoughTokensToPublish = feesPayerAccountBalance.isGreaterThan(feesToPay);
        this.logger.debug(`# of days: ${expirationDay}, fees to pay: ${feesToPay.toString()}`);
        if (!hasEnoughTokensToPublish) {
            throw new Error(
                `Insufficient funds to publish microblock: expected at least ${feesToPay.toString()}, got ${feesPayerAccountBalance.toString()} on account`,
            );
        }

        // Case 3: The fees payer account does not have signed the microblock (possibly slower case)
        const feesPayerAccountPublicKey = await globalState.getAccountPublicKeyByAccountId(feesPayerAccountId);
        const hasFeesPayerAccountSignedMicroblock = await microblock.verify(feesPayerAccountPublicKey);
        if (!hasFeesPayerAccountSignedMicroblock) {
            throw new Error('Specified fees payer account did not sign the microblock');
        }

        // Case 4: The fees payer account is allowed to write on the virtual blockchain
        const isAllowedToWrite = await this.isAccountIdAllowedToWriteOnVirtualBlockchain(
            feesPayerAccountId,
            virtualBlockchain,
            microblock,
            globalState
        );
        if (!isAllowedToWrite) {
            const errMsg = `Fees payer account ${Utils.binaryToHexa(feesPayerAccountId)} is not allowed to write on virtual blockchain ${virtualBlockchain.getType()}`;
            this.logger.info(errMsg);
            throw new Error(errMsg);
        }

        if (virtualBlockchain instanceof AccountVb) {
            await this.handleAccountUpdate(globalState, virtualBlockchain, microblock);
        } else if (virtualBlockchain instanceof ValidatorNodeVb) {
            await this.handleValidatorNodeUpdate(globalState, virtualBlockchain, microblock);
        } else if (virtualBlockchain instanceof ProtocolVb) {
            await this.handleProtocolUpdate(virtualBlockchain, microblock);
        }

        // we are now sure that the fees payer account has enough tokens, so we proceed to the transfer of tokens
        // to the fees payer account.
        const feesPayeeAccount = Economics.getSpecialAccountTypeIdentifier(ECO.ACCOUNT_BLOCK_FEES);
        this.logger.debug(
            `Send fees from ${Utils.binaryToHexa(feesPayerAccountId)} to ${Utils.binaryToHexa(feesPayeeAccount)}`,
        );
        const sentAt = cometParameters.blockTimestamp;
        await accountManager.tokenTransfer(
            {
                type: ECO.BK_PAID_TX_FEES,
                payerAccount: feesPayerAccountId,
                payeeAccount: feesPayeeAccount,
                amount: feesToPay.getAmountAsAtomic(),
            },
            {
                mbHash: microblock.getHash().toBytes(),
            },
            sentAt,
        );

        // update the statistics
        const numberOfSectionsInMicroblock: number = microblock.getNumberOfSections();
        this.blockSectionCount += numberOfSectionsInMicroblock;
        this.blockSizeInBytes += transaction.length;
        this.totalFees += feesToPay.getAmountAsAtomic();
        if (virtualBlockchain.getHeight() == 1) {
            this.newObjectCounts[virtualBlockchain.getType()] += 1;
        }
        this.processedAndAcceptedMicroblocks.push({
            hash: microblock.getHashAsBytes(), //vb.currentMicroblock.hash,
            vbId: virtualBlockchain.getId(),
            vbType: virtualBlockchain.getType(),
            height: virtualBlockchain.getHeight(),
            size: transaction.length,
            sectionCount: numberOfSectionsInMicroblock,
        });

        // store the virtual blockchain local state and microblock in buffer
        await globalState.storeVirtualBlockchainState(virtualBlockchain);
        await globalState.storeMicroblock(
            virtualBlockchain.getExpirationDay(),
            virtualBlockchain,
            microblock,
            transaction,
        );
        await globalState.indexVirtualBlockchain(virtualBlockchain);
    }

    async finalizeBlockApproval(globalState: GlobalState, request: RequestFinalizeBlock) {
        const blockHeight: number = Number(request.height);
        const blockTimestamp: number = CometBFTUtils.convertDateInTimestamp(request.time);//Number(request.time?.seconds ?? 0);

        // Extract the votes of validators involved in the publishing of this block.
        // Then proceed to the payment of the validators.
        await this.dispatchFeesAmongValidators(globalState, request);
        await this.storeBlockInformationInBuffer(
            globalState,
            blockHeight,
            request.hash,
            blockTimestamp,
            request.proposer_address,
            this.blockSizeInBytes,
            request.txs.length,
        );

        await this.storeBlockContentInBuffer(
            globalState,
            blockHeight,
            this.processedAndAcceptedMicroblocks,
        );

        await this.storeModifiedAccountsInBuffer(
            globalState,
            blockHeight,
        );

        const database = globalState.getCachedDatabase();

        for (const [key, entry] of this.validatorSetUpdates) {
            const update = entry.cometValidatorSetUpdate;
            const cometAddress = Utils.binaryFromHexa(key);
            const existingEntry = await database.getValidatorNodeByAddress(cometAddress);
            const existingPower = existingEntry === undefined ? 0 : existingEntry.votingPower;

            this.logger.info(
                `validatorSet update: pub_key=[${update.pub_key_type}]${Base64.encodeBinary(update.pub_key_bytes)}, power=${update.power}`,
            );

            // If there is no actual change, remove this update from the set.
            // This is especially important if both the existing voting power and the new voting power are set to 0 because
            // Comet is likely to erroneously consider that 'applying the validator changes would result in empty set'.
            // (see updateWithChangeSet() in types/validator_set.go)
            if (existingPower == update.power) {
                this.logger.info(`no actual voting power change -> removed from validatorSet update`);
                this.validatorSetUpdates.delete(key);
            }

            await database.putValidatorNodeByAddress(cometAddress, entry.validatorNodeId, update.power);
        }

        const chainInfoObject = await database.getChainInformation();
        chainInfoObject.height = blockHeight;
        chainInfoObject.lastBlockTimestamp = blockTimestamp;
        chainInfoObject.microblockCount += this.processedAndAcceptedMicroblocks.length;
        // TODO: update the chain information object with the protocol vbid
        chainInfoObject.objectCounts = chainInfoObject.objectCounts.map(
            (count, ndx) => count + this.newObjectCounts[ndx],
        );
        await database.putChainInformation(chainInfoObject);
    }

    /**
     * This method checks whether the specified account is allowed to write on the specified virtual blockchain.
     * @param accountId The account id to check
     * @param vb The virtual blockchain to check
     * @private
     */
    private async isAccountIdAllowedToWriteOnVirtualBlockchain(accountId: Uint8Array, vb: VirtualBlockchain, mb: Microblock, globalState: GlobalState) {
        // Case 1 - Account creation
        // Anyone can create an account, the only limitation is to have enough fees but this verification
        // is not performed here.
        if (vb instanceof AccountVb) {
            const containsAccountCreationSection = mb.hasSection(SectionType.ACCOUNT_CREATION);
            const isFirstBlock = mb.getHeight() == 1;
            if (containsAccountCreationSection && isFirstBlock) return true;
            // other cases are handled by the following check
        }

        // Case 2 - Validator node approval update
        if (vb instanceof ValidatorNodeVb) {
            const protocolState = await globalState.getProtocolState();
            const protocolStateObject = protocolState.toObject();
            const governanceOrgID = protocolStateObject.organizationId;
            const governanceOrgVb = await globalState.loadOrganizationVirtualBlockchain(Hash.from(governanceOrgID));
            const governanceAccountId = governanceOrgVb.getAccountId();
            const isGovernanceAccount = Utils.binaryIsEqual(governanceAccountId.toBytes(), accountId);
            const isApproving: boolean = mb.containsOnlyTheseSections([
                SectionType.VN_APPROVAL,
                SectionType.SIGNATURE,
            ]);
            if (isGovernanceAccount && isApproving) return true;
        }

        // Case 3 (default) - The virtual blockchain decides
        return vb.isAccountIdAllowedToWrite(Hash.from(accountId))
    }

    getCometValidatorSetUpdates(): CometValidatorSetUpdate[] {
        return [...this.validatorSetUpdates.values()].map((obj) => obj.cometValidatorSetUpdate);
    }

    private async storeBlockInformationInBuffer(
        state: GlobalState,
        height: number,
        hash: Uint8Array,
        timestamp: number,
        proposerAddress: Uint8Array,
        size: number,
        microblockCount: number,
    ) {
        const db = state.getCachedDatabase();
        await db.putBlockInformation(
            height,
            {
                hash,
                timestamp,
                proposerAddress,
                size,
                microblockCount,
            }
        )
        //await db.putObject(LevelDbTable.BLOCK_INFORMATION, this.heightToTableKey(height), );
    }

    private async storeBlockContentInBuffer(
        state: GlobalState,
        height: number,
        microblocks: ProcessedMicroblock[],
    ) {
        const db = state.getCachedDatabase();
        await db.putBlockContent(height, { microblocks });
    }

    private async storeModifiedAccountsInBuffer(
        state: GlobalState,
        height: number,
    ) {
        const db = state.getCachedDatabase();
        const accountManager = state.getAccountManager();
        const modifiedAccounts = accountManager.getModifiedAccounts();
        this.logger.info(`${modifiedAccounts.length} accounts were modified`);
        await db.putBlockModifiedAccounts(height, { modifiedAccounts });
    }

    private heightToTableKey(height: number) {
        return LevelDb.convertHeightToTableKey(height);
    }

    private async dispatchFeesAmongValidators(state: GlobalState, request: RequestFinalizeBlock) {
        this.logger.info(`Dispatch fees among validators`);
        const feesAccountIdentifier = Economics.getSpecialAccountTypeIdentifier(
            ECO.ACCOUNT_BLOCK_FEES,
        );
        const accountManager = state.getAccountManager();
        const feesAccountInfo: AccountInformation =
            await accountManager.loadAccountInformation(feesAccountIdentifier);
        const pendingFees = feesAccountInfo.state.balance;

        // we stop if there is no fees to pay
        if (!pendingFees) {
            this.logger.info('No fees to dispatch: Done');
            return;
        }

        const validatorAccounts: Uint8Array[] = [];
        const validatorStakes : number[] = [];
        const votes = request.decided_last_commit?.votes || [];
        const stateDb = state.getCachedDatabase();

        this.logger.debug(`${votes.length} vote(s)`);

        for (const vote of votes) {
            // TODO: figure out why vote.block_id_flag is not an integer
            // if (vote.block_id_flag === BlockIDFlag.BLOCK_ID_FLAG_COMMIT ) {
            if ((vote.block_id_flag).toString() == 'BLOCK_ID_FLAG_COMMIT') {
                // skip if validator field not set in the vote
                if (vote.validator == null) {
                    this.logger.warn(`Received undefined validator in commit vote: skipping vote`);
                    continue;
                }

                // TODO: clean
                const address = Utils.bufferToUint8Array(vote.validator.address);
                const nodeByAddress = await stateDb.getValidatorNodeByAddress(address);
                if(nodeByAddress == undefined) throw new Error('Invalid validator address');
                const validatorNodeHash = nodeByAddress.validatorNodeHash;
//              const validatorNodeHash = await stateDb.getRaw(
//                  LevelDbTable.VALIDATOR_NODE_BY_ADDRESS,
//                  address,
//              );

                if (!validatorNodeHash) {
                    this.logger.error(`unknown validator address ${Utils.binaryToHexa(address)}`);
                } else if (Utils.binaryIsEqual(validatorNodeHash, Utils.getNullHash())) {
                    this.logger.warn(
                        `validator address ${Utils.binaryToHexa(address)} is not yet linked to a validator node VB`,
                    );
                } else {
                    const validatorNode = await state.loadValidatorNodeVirtualBlockchain(
                        new Hash(validatorNodeHash),
                    );

                    //const validatorPublicKey: PublicSignatureKey = await validatorNode.getOrganizationPublicKey();
                    const accountId = await this.getAccountIdFromValidatorNode(validatorNode);
                    this.logger.debug(`adding validator node with account ${accountId.encode()}`);
                    //const validatorAccountHash = accountManager.loadAccountByPublicKey(validatorPublicKey);

                    const validatorId = accountId.toBytes();
                    validatorAccounts.push(validatorId);
                    validatorStakes.push(await accountManager.getStakedAmount(accountId))
                }
            }
        }

        // ensure that we have enough validators
        const nValidators = validatorAccounts.length;
        if (nValidators === 0) {
            this.logger.warn('empty list of validator accounts: fees payment is delayed');
            return;
        }


        //const feesRest = pendingFees % nValidators;
        //const feesQuotient = (pendingFees - feesRest) / nValidators;
        const blockHeight: number = Number(request.height);
        this.logger.info(
            `${pendingFees} to be dispatched among ${nValidators} validators (height=${blockHeight})`,
        );
        const feesDispatcher = new FeesDispatcher(pendingFees, validatorStakes, blockHeight);
        const timeInRequest: number = CometBFTUtils.convertDateInTimestamp(request.time);//Number(request.time?.seconds ?? defaultTimestamp);
        const feesInAtomisToDispatchForEachValidator = feesDispatcher.dispatch();
        for (let index = 0; index < nValidators; index++) {
            // get the fees to pay to this validator
            const feesToSendToThisValidator = feesInAtomisToDispatchForEachValidator[index];
            if (!Number.isInteger(feesToSendToThisValidator)) {
                this.logger.fatal(`Fees to send to validator #${index} is not an integer: ${feesToSendToThisValidator}`);
                continue;
            }

            if (feesToSendToThisValidator < 0) {
                this.logger.fatal(`feesAccountIdentifier is negative: ${feesToSendToThisValidator}`);
                continue;
            }

            const validatorAccountId = validatorAccounts[index];
            this.logger.info(`paying ${feesToSendToThisValidator} to validator ${Utils.binaryToHexa(validatorAccountId)}`);

            await accountManager.tokenTransfer(
                {
                    type: ECO.BK_PAID_BLOCK_FEES,
                    payerAccount: feesAccountIdentifier,
                    payeeAccount: validatorAccounts[index],
                    amount: feesToSendToThisValidator,
                },
                {
                    height: blockHeight - 1,
                },
                timeInRequest,
            );
        }
    }

    private async getAccountIdFromValidatorNode(validatorNode: ValidatorNodeVb) {
        const orgVb = await validatorNode.getOrganizationVirtualBlockchain();
        return orgVb.getAccountId();
    }

    private async handleAccountUpdate(
        globalState: GlobalState,
        accountVb: AccountVb,
        microblock: Microblock,
    ): Promise<void> {
        const accountManager = globalState.getAccountManager();

        for (const [sectionIndex, section] of microblock.getAllSections().entries()) {
            const sectionType = section.type;

            // check account creation
            if (sectionType === SectionType.ACCOUNT_CREATION) {
                // checking the availability of the public key
                const accountPublicKey = await accountVb.getPublicKey();
                await accountManager.checkPublicKeyAvailabilityOrFail(
                    await accountPublicKey.getPublicKeyAsBytes(),
                );

                const { sellerAccount, amount } = section;
                const createdAccountId = accountVb.getId();
                this.logger.debug(`Creating account ${Utils.binaryToHexa(createdAccountId)} with ${CMTSToken.createAtomic(amount).toString()} from account ${Utils.binaryToHexa(sellerAccount)}`);
                await accountManager.tokenTransfer(
                    {
                        type: ECO.BK_SALE,
                        payerAccount: sellerAccount,
                        payeeAccount: createdAccountId,
                        amount,
                    },
                    {
                        mbHash: microblock.getHash().toBytes(),
                        sectionIndex,
                    },
                    microblock.getTimestamp(),
                );

                await accountManager.saveAccountByPublicKey(
                    createdAccountId,
                    await accountPublicKey.getPublicKeyAsBytes(),
                );
            }

            // check token standard transfers
            if (sectionType === SectionType.ACCOUNT_TRANSFER) {
                const { account, amount } = section;
                const accountIdSendingTokens = accountVb.getId();
                this.logger.debug(`Transferring ${CMTSToken.createAtomic(amount).toString()} from account ${Utils.binaryToHexa(accountIdSendingTokens)} to account ${Utils.binaryToHexa(account)}`)
                await accountManager.tokenTransfer(
                    {
                        type: ECO.BK_SENT_PAYMENT,
                        payerAccount: accountVb.getId(),
                        payeeAccount: account,
                        amount,
                    },
                    {
                        mbHash: microblock.getHash().toBytes(),
                        sectionIndex,
                    },
                    microblock.getTimestamp(),
                );
            }

            // check staking
            if (sectionType === SectionType.ACCOUNT_STAKE) {
                const { amount, objectType, objectIdentifier } = section;
                const protocolState = await globalState.getProtocolState();
                await accountManager.stake(
                    accountVb.getId(),
                    amount,
                    objectType,
                    objectIdentifier,
                    protocolState
                );
            }

            // check unstaking
            // TODO: it would be better to use the Comet block timestamp instead of the MB timestamp
            // (for the MB timestamp may already be pointing at the next day)
            if (sectionType === SectionType.ACCOUNT_UNSTAKE) {
                const { amount, objectType, objectIdentifier } = section;
                const protocolState = await globalState.getProtocolState();
                await accountManager.planUnstake(
                    accountVb.getId(),
                    amount,
                    objectType,
                    objectIdentifier,
                    microblock.getTimestamp(),
                    protocolState
                );
            }

            // check token escrow transfers
            if (sectionType === SectionType.ACCOUNT_ESCROW_TRANSFER) {
                const { account, amount, escrowIdentifier, agentAccount, durationDays } = section;
                await accountManager.tokenTransfer(
                    {
                        type: ECO.BK_SENT_ESCROW,
                        payerAccount: accountVb.getId(),
                        payeeAccount: account,
                        amount,
                        escrowParameters: {
                            escrowIdentifier,
                            fundEmitterAccountId: account,
                            transferAuthorizerAccountId: agentAccount,
                            startTimestamp: microblock.getTimestamp(),
                            durationDays
                        }
                    },
                    {
                        mbHash: microblock.getHash().toBytes(),
                        sectionIndex,
                    },
                    microblock.getTimestamp(),
                );
            }

            // check token escrow settlements
            if (sectionType === SectionType.ACCOUNT_ESCROW_SETTLEMENT) {
                const { escrowIdentifier, confirmed } = section;
                const chainReference = {
                    mbHash: microblock.getHash().toBytes(),
                    sectionIndex
                };
                await accountManager.escrowSettlement(accountVb.getId(), escrowIdentifier, confirmed, microblock.getTimestamp(), chainReference);
            }

            // check token vesting transfers
            if (sectionType === SectionType.ACCOUNT_VESTING_TRANSFER) {
                const { account, amount, cliffDurationDays, vestingDurationDays } = section;
                await accountManager.tokenTransfer(
                    {
                        type: ECO.BK_SENT_VESTING,
                        payerAccount: accountVb.getId(),
                        payeeAccount: account,
                        amount,
                        vestingParameters: {
                            initialVestedAmountInAtomics: amount,
                            cliffStartTimestamp: microblock.getTimestamp(),
                            cliffDurationDays,
                            vestingDurationDays
                        }
                    },
                    {
                        mbHash: microblock.getHash().toBytes(),
                        sectionIndex,
                    },
                    microblock.getTimestamp(),
                );
            }
        }
    }

    private async handleValidatorNodeUpdate(
        globalState: GlobalState,
        virtualBlockchain: ValidatorNodeVb,
        microblock: Microblock,
    ) {
        for (const section of microblock.getAllSections()) {
            const sectionType = section.type;
            if (sectionType === SectionType.VN_COMETBFT_PUBLIC_KEY_DECLARATION) {
                await this.validatorNodePublicKeyDeclarationCallback(
                    globalState,
                    virtualBlockchain,
                    section,
                );
            } else if (sectionType === SectionType.VN_APPROVAL) {
                await this.validatorNodeApprovalCallback(
                    globalState,
                    virtualBlockchain,
                    section,
                );
            }
        }
    }

    private async validatorNodePublicKeyDeclarationCallback(
        globalState: GlobalState,
        vb: ValidatorNodeVb,
        section: ValidatorNodeCometbftPublicKeyDeclarationSection,
    ) {
        const database = globalState.getCachedDatabase();
        const { cometPublicKeyType, cometPublicKey } = section;
        const cometPublicKeyBytes = Base64.decodeBinary(cometPublicKey);
        const cometAddress = CometBFTPublicKeyConverter.convertRawPublicKeyIntoAddress(cometPublicKeyBytes);

        this.logger.debug(`declaration of node public key ${cometPublicKey} -> address ${Utils.binaryToHexa(cometAddress)}`);

        const existingNode = await database.getValidatorNodeByAddress(cometAddress);

        if (existingNode === undefined) {
            // we search for the last known voting power from the internal VB state
            const localState = vb.getInternalState();
            const approvalStatus = localState.getLastKnownApprovalStatus();

            await this.processValidatorSetUpdate(
                globalState,
                vb,
                approvalStatus,
                cometPublicKeyType,
                cometPublicKeyBytes,
            );
        }
        else {
            this.logger.warn(`this address is already in use: aborting`);
        }
    }

    private async processValidatorSetUpdate(
        globalState: GlobalState,
        validatorNode: ValidatorNodeVb,
        approvalStatus: boolean,
        publicKeyType: string,
        publicKeyBytes: Uint8Array,
    ) {
        const validatorNodeId = validatorNode.getId();
        this.logger.debug(`Processing validator set update for node ${Utils.binaryToHexa(validatorNodeId)}`);

        let votingPower: number;

        if (approvalStatus) {
            const stakingAmount = await this.getValidatorNodeStakingAmount(globalState, validatorNode);
            if (stakingAmount == 0) {
                this.logger.warn(`No staking for validator node ${Utils.binaryToHexa(validatorNodeId)}`);
            }
            else {
                this.logger.debug(`Staking of ${stakingAmount} for validator node ${Utils.binaryToHexa(validatorNodeId)}`);
            }
            votingPower = stakingAmount;
        }
        else {
            votingPower = 0;
        }

        if(votingPower == 0) {
            this.logger.warn(`Validator node ${Utils.binaryToHexa(validatorNodeId)} has no voting power`);
        }

        this.addValidatorSetUpdate(
            validatorNodeId,
            votingPower,
            publicKeyType,
            publicKeyBytes,
        );
    }

    private addValidatorSetUpdate(
        validatorNodeId: Uint8Array,
        votingPower: number,
        pubKeyType: string,
        pubKeyBytes: Uint8Array,
    ) {
        // ensure the public key type is correct
        const translatedPubKeyType = KEY_TYPE_MAPPING[pubKeyType];
        if (!translatedPubKeyType) {
            this.logger.error(`Aborting validator set update: Invalid key type '${pubKeyType}' for validator set update`);
            return false;
        }

        const validatorSetUpdateEntry: ValidatorSetUpdate = {
            validatorNodeId,
            cometValidatorSetUpdate: {
                power: votingPower,
                pub_key_type: translatedPubKeyType,
                pub_key_bytes: pubKeyBytes,
            }
        };

        const cometAddress = CometBFTPublicKeyConverter.convertRawPublicKeyIntoAddress(pubKeyBytes);
        const key = Utils.binaryToHexa(cometAddress);

        this.logger.info(`Validator set update: Public key ${Utils.binaryToHexa(pubKeyBytes)} -> voting power at ${votingPower}`)
        this.validatorSetUpdates.set(key, validatorSetUpdateEntry);
        return true;
    }

    private async validatorNodeApprovalCallback(
        globalState: GlobalState,
        vb: ValidatorNodeVb,
        section: ValidatorNodeVotingPowerUpdateSection,
    ) {
        const publicKeyDeclaration = await vb.getCometbftPublicKeyDeclaration();
        const cometPublicKeyType = publicKeyDeclaration.cometbftPublicKeyType;
        const cometPublicKeyBytes = Base64.decodeBinary(publicKeyDeclaration.cometbftPublicKey);
        const approvalStatus = vb.getInternalState().getLastKnownApprovalStatus();

        await this.processValidatorSetUpdate(
            globalState,
            vb,
            approvalStatus,
            cometPublicKeyType,
            cometPublicKeyBytes,
        );
    }

    private async getValidatorNodeStakingAmount(globalState: GlobalState, validatorNode: ValidatorNodeVb) {
        // we look for the account ID of the organization owning this node and load the account state
        const accountId = await this.getAccountIdFromValidatorNode(validatorNode);
        const accountManager = globalState.getAccountManager();
        const accountInfo: AccountInformation = await accountManager.loadAccountInformation(accountId.toBytes());
        const accountState = accountInfo.state;

        // we test whether there is a staking for the validator node
        const balanceAvailability = new BalanceAvailability(
            accountState.balance,
            accountState.locks,
        );
        const nodeIdentifier = validatorNode.getIdentifier();
        const stakingAmount = balanceAvailability.getNodeStakingLockAmount(nodeIdentifier.toBytes());
        this.logger.debug(`Staking amount for validator node ${nodeIdentifier.encode()} with linked account ${accountId.encode()}: ${stakingAmount}`);
        return stakingAmount;
    }
}
