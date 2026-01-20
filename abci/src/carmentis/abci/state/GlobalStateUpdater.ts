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
} from '@cmts-dev/carmentis-sdk/server';
import { CometBFTPublicKeyConverter } from '../CometBFTPublicKeyConverter';
import { getLogger } from '@logtape/logtape';
import { AccountManager, Transfer } from '../accounts/AccountManager';
import { GlobalState } from './GlobalState';
import { FinalizeBlockRequest } from '../../../proto-ts/cometbft/abci/v1/types';
import { GlobalStateUpdateCometParameters } from '../types/GlobalStateUpdateCometParameters';
import { ProcessedMicroblock } from '../types/ProcessBlockResult';
import { LevelDb } from '../database/LevelDb';
import { ValidatorSetUpdate } from '../types/ValidatorSetUpdate';
import { BlockIDFlag } from '../../../proto-ts/cometbft/types/v1/validator';
import { LevelDbTable } from '../database/LevelDbTable';

const KEY_TYPE_MAPPING: Record<string, string> = {
    'tendermint/PubKeyEd25519': 'ed25519',
};

export class GlobalStateUpdater {
    static createUpdater() {
        return new GlobalStateUpdater();
    }

    // list of validator set updates used to track update of the validator set
    private validatorSetUpdates: ValidatorSetUpdate[] = [];

    // we use these values for statistics purpose
    private newObjectCounts = Array(CHAIN.N_VIRTUAL_BLOCKCHAINS).fill(0);
    private processedAndAcceptedMicroblocks: ProcessedMicroblock[] = [];
    private totalFees = 0;
    private blockSizeInBytes = 0;
    private blockSectionCount = 0;
    private processedMicroblock: ProcessedMicroblock[] = []; // TODO(explain): why not used

    private logger = getLogger(['node', 'state', GlobalStateUpdater.name]);

    async updateGlobalStateOnBlock(
        globalState: GlobalState,
        cometParameters: GlobalStateUpdateCometParameters
    ) {
        const database = globalState.getCachedDatabase();
        const previousBlockInformation = await database.getBlockInformation(cometParameters.blockHeight - 1);
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
            // update vesting locks
            const accountsWithVestingLocksIdentifiers = await database.getKeys(LevelDbTable.ACCOUNTS_WITH_VESTING_LOCKS);

            for(const id of accountsWithVestingLocksIdentifiers) {
                this.logger.info(`Applying linear vesting for account ${Utils.binaryToHexa(id)}`);

                const accountState = await database.getAccountStateByAccountId(id);
                if (accountState) {
                    const balanceAvailability = new BalanceAvailability(
                        accountState.balance,
                        accountState.locks,
                    );

                    if(balanceAvailability.applyLinearVesting(currentBlockDayTs) > 0) {
                        accountState.locks = balanceAvailability.getLocks();
                        await database.putAccountState(id, accountState);

                        if(!balanceAvailability.hasVestingLocks()) {
                            this.logger.info(`No more vesting locks on account ${Utils.binaryToHexa(id)}: removing entry from ACCOUNTS_WITH_VESTING_LOCKS`);
                            await database.del(LevelDbTable.ACCOUNTS_WITH_VESTING_LOCKS, id);
                        }
                    }
                } else {
                    this.logger.warn(`Account state for account ${id.toString()} not found`);
                    // TODO: handle undefined account state
                }
            }

            // update escrow locks
            const accountManager = globalState.getAccountManager();
            const escrowIdentifiers = await database.getKeys(LevelDbTable.ESCROWS);

            for(const id of escrowIdentifiers) {
                // TODO: it would be more efficient to have a method that directly returns all objects of a table
                const escrow = await database.getEscrow(id);
                if (escrow == null) {
                    throw new Error(`Escrow ${id.toString()} not found`);
                }

                const accountState = await database.getAccountStateByAccountId(escrow.payeeAccount);
                if (accountState === undefined) throw new Error(
                    `Escrow ${id.toString()} refers to an unknown account ${escrow.payeeAccount.toString()}`
                )

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
                            height: cometParameters.blockHeight
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
        const feesPayerAccountBalance =
            await accountManager.getAccountBalanceByAccountId(feesPayerAccountId);
        const protocolState = await globalState.getProtocolState();
        const feesCalculationVersion = protocolState.getFeesCalculationVersion();
        const signatureSection = microblock.getLastSignatureSection();
        const usedSignatureSchemeId = signatureSection.schemeId;
        const usedFeesCalculationFormula =
            FeesCalculationFormulaFactory.getFeesCalculationFormulaByVersion(
                feesCalculationVersion,
            );
        const feesToPay: CMTSToken = await usedFeesCalculationFormula.computeFees(
            usedSignatureSchemeId,
            microblock,
        );
        const hasEnoughTokensToPublish = feesPayerAccountBalance.isGreaterThan(feesToPay);
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

        // Case 4: The fees payer account is not the owner of the virtual blockchain
        // TODO: handle the case where the payer account is not the owner of the virtual blockchain

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

    async finalizeBlockApproval(state: GlobalState, request: FinalizeBlockRequest) {
        const blockHeight = +request.height;
        const blockTimestamp = +(request.time?.seconds ?? 0);

        // Extract the votes of validators involved in the publishing of this block.
        // Then proceed to the payment of the validators.
        await this.dispatchFeesAmongValidators(state, request);
        await this.storeBlockInformationInBuffer(
            state,
            blockHeight,
            request.hash,
            blockTimestamp,
            request.proposer_address,
            this.blockSizeInBytes,
            request.txs.length,
        );

        await this.storeBlockContentInBuffer(
            state,
            blockHeight,
            this.processedAndAcceptedMicroblocks,
        );

        this.validatorSetUpdates.forEach((entry) => {
            this.logger.info(
                `validatorSet update: pub_key=[${entry.pub_key_type}]${Base64.encodeBinary(entry.pub_key_bytes)}, power=${entry.power}`,
            );
        });

        const database = state.getCachedDatabase();
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

    getValidatorSetUpdates(): ValidatorSetUpdate[] {
        return this.validatorSetUpdates;
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
        /*
        await db.putObject(LevelDbTable.BLOCK_CONTENT, this.heightToTableKey(height), {
            microblocks,
        });

         */
    }

    private heightToTableKey(height: number) {
        return LevelDb.convertHeightToTableKey(height);
    }

    private async dispatchFeesAmongValidators(state: GlobalState, request: FinalizeBlockRequest) {
        this.logger.info(`dispatchFeesAmongValidators`);
        const feesAccountIdentifier = Economics.getSpecialAccountTypeIdentifier(
            ECO.ACCOUNT_BLOCK_FEES,
        );
        const accountManager = state.getAccountManager();
        const feesAccountInfo: AccountInformation =
            await accountManager.loadAccountInformation(feesAccountIdentifier);
        const pendingFees = feesAccountInfo.state.balance;
        if (!pendingFees) {
            return;
        }

        const validatorAccounts: Uint8Array[] = [];
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
                    this.logger.debug(`adding validator node with account ${accountId}`);
                    //const validatorAccountHash = accountManager.loadAccountByPublicKey(validatorPublicKey);

                    validatorAccounts.push(accountId.toBytes());
                }
            }
        }

        // ensure that we have enough validators
        const nValidators = validatorAccounts.length;
        if (nValidators === 0) {
            this.logger.warn('empty list of validator accounts: fees payment is delayed');
            return;
        }

        const feesRest = pendingFees % nValidators;
        const feesQuotient = (pendingFees - feesRest) / nValidators;
        const blockHeight = request.height;
        const defaultTimestamp = 0;
        const timeInRequest = request.time?.seconds ?? defaultTimestamp;
        for (const n in validatorAccounts) {
            const paidFees =
                (+n + blockHeight) % nValidators < feesRest ? feesQuotient + 1 : feesQuotient;

            await accountManager.tokenTransfer(
                {
                    type: ECO.BK_PAID_BLOCK_FEES,
                    payerAccount: feesAccountIdentifier,
                    payeeAccount: validatorAccounts[n],
                    amount: paidFees,
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
                await accountManager.declareUnstake(
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
        const { cometPublicKeyType, cometPublicKey } = section;
        const cometPublicKeyBytes = Base64.decodeBinary(cometPublicKey);
        const cometAddress = CometBFTPublicKeyConverter.convertRawPublicKeyIntoAddress(cometPublicKeyBytes);

        this.logger.debug(`new node with public key ${cometPublicKey} and address ${Utils.binaryToHexa(cometAddress)}`);

        // we search for the last known voting power from the internal VB state
        const localState = vb.getInternalState();
        const approvalStatus = localState.getLastKnownApprovalStatus();

        // create the new link: Comet address -> identifier
        const database = globalState.getCachedDatabase();
//      await database.putRaw(LevelDbTable.VALIDATOR_NODE_BY_ADDRESS, cometAddress, vb.getId());
        await database.putValidatorNodeByAddress(cometAddress, vb.getId());

        await this.processValidatorSetUpdate(
            globalState,
            vb,
            approvalStatus,
            cometPublicKeyType,
            cometPublicKeyBytes,
        );
    }

    private async processValidatorSetUpdate(
        globalState: GlobalState,
        validatorNode: ValidatorNodeVb,
        approvalStatus: boolean,
        publicKeyType: string,
        publicKeyBytes: Uint8Array,
    ) {
        this.logger.debug(`Processing validator set update for node ${Utils.binaryToHexa(validatorNode.getId())}`);

        let votingPower: number;

        if (approvalStatus) {
            const stakingAmount = await this.getValidatorNodeStakingAmount(globalState, validatorNode);
            if (stakingAmount == 0) {
                this.logger.warn(`No staking for validator node ${Utils.binaryToHexa(validatorNode.getId())}`);
            }
            else {
                this.logger.debug(`Staking of ${stakingAmount} for validator node ${Utils.binaryToHexa(validatorNode.getId())}`);
            }
            votingPower = stakingAmount;
        }
        else {
            votingPower = 0;
        }

        if(votingPower == 0) {
            this.logger.warn(`Validator node ${Utils.binaryToHexa(validatorNode.getId())} has no voting power`);
        }

        this.addValidatorSetUpdate(
            votingPower,
            publicKeyType,
            publicKeyBytes,
        );
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

    private addValidatorSetUpdate(
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
            power: votingPower,
            pub_key_type: translatedPubKeyType,
            pub_key_bytes: pubKeyBytes,
        };

        this.logger.info(`Validator set update: Public key ${Utils.binaryToHexa(pubKeyBytes)} -> voting power at ${votingPower}`)
        this.validatorSetUpdates.push(validatorSetUpdateEntry);
        return true;
    }
}
