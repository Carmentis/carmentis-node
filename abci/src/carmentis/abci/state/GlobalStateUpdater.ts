import {
    AccountTransferSection,
    AccountVb,
    Base64,
    CHAIN,
    CMTSToken,
    ECO,
    Economics,
    Hash,
    Microblock,
    PublicSignatureKey,
    Section,
    SectionType,
    Utils,
    ValidatorNodeCometbftPublicKeyDeclarationSection,
    ValidatorNodeVb,
    ValidatorNodeVotingPowerUpdateSection,
    VirtualBlockchain,
} from '@cmts-dev/carmentis-sdk/server';
import { CometBFTPublicKeyConverter } from '../CometBFTPublicKeyConverter';
import { NODE_SCHEMAS } from '../constants/constants';
import { Logger } from '@nestjs/common';
import { Transfer } from '../AccountManager';
import { GlobalState } from './GlobalState';
import { FinalizeBlockRequest } from '../../../proto-ts/cometbft/abci/v1/types';
import { AccountInformation } from '../types/AccountInformation';
import { GlobalStateUpdateCometParameters } from './GlobalStateUpdateCometParameters';
import { ProcessedMicroblock } from '../types/ProcessBlockResult';
import { LevelDb } from '../database/LevelDb';
import { ValidatorSetUpdate } from '../types/ValidatorSetUpdate';
import { BlockIDFlag } from '../../../proto-ts/cometbft/types/v1/validator';

const KEY_TYPE_MAPPING = {
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

    private logger = new Logger(GlobalStateUpdater.name);

    async updateGlobalStateDuringGenesis(
        globalState: GlobalState,
        virtualBlockchain: VirtualBlockchain,
        microblock: Microblock,
        cometParameters: GlobalStateUpdateCometParameters,
    ) {
        if (virtualBlockchain instanceof AccountVb) {
            // we handle the token issuance case explicitly here
            const accountManager = globalState.getAccountManager();
            const accountVb = virtualBlockchain;
            const hasTokenIssuanceSection = microblock.hasSection(SectionType.ACCOUNT_TOKEN_ISSUANCE);
            if (hasTokenIssuanceSection) {
                // recover the public key defined in the account
                const issuerPublicKey = await accountVb.getPublicKey();

                // we ensure the public key is available, otherwise raise an exception (implicit)
                await accountManager.checkPublicKeyAvailabilityOrFail(
                    await issuerPublicKey.getPublicKeyAsBytes(),
                );

                // we now perform the token transfer ex nihilo
                const tokenIssuanceSection = microblock.getAccountTokenIssuanceSection();
                const { amount } = tokenIssuanceSection.object;
                const tokenTransfer: Transfer = {
                    type: ECO.BK_SENT_ISSUANCE,
                    payerAccount: null,
                    payeeAccount: accountVb.getId(),
                    amount,
                };
                const chainReference =  {
                    mbHash: microblock.getHash().toBytes(),
                    sectionIndex: tokenIssuanceSection.index,
                };
                await accountManager.tokenTransfer(
                    tokenTransfer,
                    chainReference,
                    microblock.getTimestamp(), //context.timestamp,
                );

                await accountManager.saveAccountByPublicKey(
                    accountVb.getId(),
                    await issuerPublicKey.getPublicKeyAsBytes(),
                );
            }

            // we handle other cases using the shared account update method
            await this.handleAccountUpdate(globalState, virtualBlockchain, microblock);

        } else if (virtualBlockchain instanceof ValidatorNodeVb) {
            await this.handleValidatorNodeUpdate(globalState, virtualBlockchain, microblock);
        }

        // update the statistics
        const numberOfSectionsInMicroblock: number = microblock.getNumberOfSections();
        this.blockSectionCount += numberOfSectionsInMicroblock;
        this.blockSizeInBytes += cometParameters.transaction.length;
        this.totalFees += 0;
        if (virtualBlockchain.getHeight() == 1) {
            this.newObjectCounts[virtualBlockchain.getType()] += 1;
        }
        this.processedAndAcceptedMicroblocks.push({
            hash: microblock.getHashAsBytes(), //vb.currentMicroblock.hash,
            vbIdentifier: virtualBlockchain.getId(),
            vbType: virtualBlockchain.getType(),
            height: virtualBlockchain.getHeight(),
            size: cometParameters.transaction.length,
            sectionCount: numberOfSectionsInMicroblock,
        });

        // store the virtual blockchain local state and microblock in buffer
        await globalState.storeVirtualBlockchainState(virtualBlockchain);
        await globalState.storeMicroblock(
            virtualBlockchain.getExpirationDay(),
            microblock,
            cometParameters.transaction,
        );
        await globalState.indexVirtualBlockchain(virtualBlockchain);
    }

    async updateGlobalState(
        globalState: GlobalState,
        virtualBlockchain: VirtualBlockchain,
        microblock: Microblock,
        cometParameters: GlobalStateUpdateCometParameters,
    ) {
        const accountManager = globalState.getAccountManager();

        // we reject the microblock if the microblock does not define the fees payer account
        // or if the fees payer account does not have enough tokens to publish the microblock
        if (!microblock.isFeesPayerAccountDefined()) {
            throw new Error(
                `Microblock ${microblock.getHash().encode()} does not specify fees payer account`,
            );
        }
        // extract the fees payer account from the microblock and ensures it has enough tokens to pay
        const feesPayerAccountId = microblock.getFeesPayerAccount();
        const feesPayerAccountBalance =
            await accountManager.getAccountBalanceByAccountId(feesPayerAccountId);
        const feesToPay: CMTSToken = microblock.computeFees();
        const hasEnoughTokensToPublish = feesPayerAccountBalance.isGreaterThan(feesToPay);
        if (!hasEnoughTokensToPublish) {
            throw new Error(
                `Insufficient funds to publish microblock: expected at least ${feesToPay.toString()}, got ${feesPayerAccountBalance.toString()} on account`,
            );
        }

        if (virtualBlockchain instanceof AccountVb) {
            await this.handleAccountUpdate(globalState, virtualBlockchain, microblock);
        } else if (virtualBlockchain instanceof ValidatorNodeVb) {
            await this.handleValidatorNodeUpdate(globalState, virtualBlockchain, microblock);
        }

        // we are now sure that the fees payer account has enough tokens, so we proceed to the transfer of tokens
        // to the fees payer account.
        const feesPayeeAccount = Economics.getSpecialAccountTypeIdentifier(ECO.ACCOUNT_BLOCK_FEES);
        this.logger.verbose(
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
        this.blockSizeInBytes += cometParameters.transaction.length;
        this.totalFees += feesToPay.getAmountAsAtomic();
        if (virtualBlockchain.getHeight() == 1) {
            this.newObjectCounts[virtualBlockchain.getType()] += 1;
        }
        this.processedAndAcceptedMicroblocks.push({
            hash: microblock.getHashAsBytes(), //vb.currentMicroblock.hash,
            vbIdentifier: virtualBlockchain.getId(),
            vbType: virtualBlockchain.getType(),
            height: virtualBlockchain.getHeight(),
            size: cometParameters.transaction.length,
            sectionCount: numberOfSectionsInMicroblock,
        });

        // store the virtual blockchain local state and microblock in buffer
        await globalState.storeVirtualBlockchainState(virtualBlockchain);
        await globalState.storeMicroblock(
            virtualBlockchain.getExpirationDay(),
            microblock,
            cometParameters.transaction,
        );
        await globalState.indexVirtualBlockchain(virtualBlockchain);
    }

    async finalizeBlockApproval(state: GlobalState, request: FinalizeBlockRequest) {
        const blockHeight = +request.height;
        const blockTimestamp =  +(request.time?.seconds ?? 0);

        // Extract the votes of validators involved in the publishing of this block.
        // Then proceed to the payment of the validators.
        //await this.payValidators(this.finalizedBlockContext, votes, blockHeight, blockTimestamp);
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
            this.logger.log(
                `validatorSet update: pub_key=[${entry.pub_key_type}]${Base64.encodeBinary(entry.pub_key_bytes)}, power=${entry.power}`,
            );
        });

        const database = state.getCachedDatabase();
        const chainInfoObject = await database.getChainInformationObject();
        chainInfoObject.height = blockHeight;
        chainInfoObject.lastBlockTimestamp = blockTimestamp;
        chainInfoObject.microblockCount += this.processedAndAcceptedMicroblocks.length;
        chainInfoObject.objectCounts = chainInfoObject.objectCounts.map(
            (count, ndx) => count + this.newObjectCounts[ndx],
        );
        await database.putChainInformationObject(chainInfoObject);
        /*
        await database.putObject(
            NODE_SCHEMAS.DB_CHAIN_INFORMATION,
            NODE_SCHEMAS.DB_CHAIN_INFORMATION_KEY,
            chainInfoObject,
        );
         */
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
        await db.putObject(NODE_SCHEMAS.DB_BLOCK_INFORMATION, this.heightToTableKey(height), {
            hash,
            timestamp,
            proposerAddress,
            size,
            microblockCount,
        });
    }

    private async storeBlockContentInBuffer(
        state: GlobalState,
        height: number,
        microblocks: ProcessedMicroblock[],
    ) {
        const db = state.getCachedDatabase();
        await db.putObject(NODE_SCHEMAS.DB_BLOCK_CONTENT, this.heightToTableKey(height), {
            microblocks,
        });
    }

    private heightToTableKey(height: number) {
        return LevelDb.convertHeightToTableKey(height);
    }

    private async dispatchFeesAmongValidators(state: GlobalState, request: FinalizeBlockRequest) {
        this.logger.log(`payValidators`);
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

        const validatorAccounts = [];
        const votes = request.decided_last_commit?.votes || [];
        const stateDb = state.getCachedDatabase();
        for (const vote of votes) {
            if (vote.block_id_flag === BlockIDFlag.BLOCK_ID_FLAG_COMMIT) {
                // TODO: clean
                const address = Utils.bufferToUint8Array(vote.validator.address);
                const validatorNodeHash = await stateDb.getRaw(
                    NODE_SCHEMAS.DB_VALIDATOR_NODE_BY_ADDRESS,
                    address,
                );

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
                    const validatorPublicKey: PublicSignatureKey =
                        await validatorNode.getOrganizationPublicKey();
                    const validatorAccountHash =
                        accountManager.loadAccountByPublicKey(validatorPublicKey);
                    validatorAccounts.push(validatorAccountHash);
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
        const blockTimestamp = request.time.seconds;
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
                blockTimestamp,
            );
        }
    }

    private async handleAccountUpdate(
        globalState: GlobalState,
        accountVb: AccountVb,
        microblock: Microblock,
    ): Promise<void> {
        const accountManager = globalState.getAccountManager();

        // check account creation
        const hasAccountCreationSection = microblock.hasSection(SectionType.ACCOUNT_CREATION);
        if (hasAccountCreationSection) {
            // checking the availability of the public key
            const accountPublicKey = await accountVb.getPublicKey();
            await accountManager.checkPublicKeyAvailabilityOrFail(
                await accountPublicKey.getPublicKeyAsBytes(),
            );

            const accountCreationSection = microblock.getAccountCreationSection();
            const { sellerAccount, amount } = accountCreationSection.object;
            await accountManager.tokenTransfer(
                {
                    type: ECO.BK_SALE,
                    payerAccount: sellerAccount,
                    payeeAccount: accountVb.getId(),
                    amount,
                },
                {
                    mbHash: microblock.getHash().toBytes(),
                    sectionIndex: accountCreationSection.index
                },
                microblock.getTimestamp(),
            );

            await accountManager.saveAccountByPublicKey(
                accountVb.getId(),
                await accountPublicKey.getPublicKeyAsBytes(),
            );
        }

        // check token transfer
        const tokenTransferSections = microblock.getSectionsByType<AccountTransferSection>(
            SectionType.ACCOUNT_TRANSFER,
        );
        for (const section of tokenTransferSections) {
            const { account, amount } = section.object;
            await accountManager.tokenTransfer(
                {
                    type: ECO.BK_SENT_PAYMENT,
                    payerAccount: accountVb.getId(),
                    payeeAccount: account,
                    amount,
                },
                {
                    mbHash: microblock.getHash().toBytes(),
                },
                microblock.getTimestamp(),
            );
        }
    }

    private async handleValidatorNodeUpdate(
        globalState: GlobalState,
        virtualBlockchain: ValidatorNodeVb,
        microblock: Microblock,
    ) {
        // update the public key of the validators
        const publicKeyDeclarationSections = microblock.getSectionsByType(
            SectionType.VN_COMETBFT_PUBLIC_KEY_DECLARATION,
        );
        if (publicKeyDeclarationSections.length === 1) {
            await this.validatorNodePublicKeyDeclarationCallback(
                globalState,
                virtualBlockchain,
                publicKeyDeclarationSections[0],
            );
        }

        // update the voting power
        const votingPowerUpdateSections =
            microblock.getSectionsByType<ValidatorNodeVotingPowerUpdateSection>(
                SectionType.VN_VOTING_POWER_UPDATE,
            );
        if (votingPowerUpdateSections.length === 1) {
            await this.validatorNodeVotingPowerUpdateCallback(
                globalState,
                virtualBlockchain,
                votingPowerUpdateSections[0],
            );
        }
    }

    /**
     Validator node callbacks
     */
    private async validatorNodePublicKeyDeclarationCallback(
        globalState: GlobalState,
        vb: ValidatorNodeVb,
        section: Section<ValidatorNodeCometbftPublicKeyDeclarationSection>,
    ) {
        const { cometPublicKeyType, cometPublicKey } = section.object;
        const cometPublicKeyBytes = Base64.decodeBinary(cometPublicKey);
        const cometAddress =
            CometBFTPublicKeyConverter.convertRawPublicKeyIntoAddress(cometPublicKeyBytes);

        // we search for the last voting power known to the
        const localState = vb.getInternalState();
        const lastKnownVotingPower = localState.getLastKnownVotingPower();

        // create the new link: Comet address -> identifier
        const database = globalState.getCachedDatabase();
        await database.putRaw(NODE_SCHEMAS.DB_VALIDATOR_NODE_BY_ADDRESS, cometAddress, vb.getId());

        if (0 < lastKnownVotingPower) {
            this.addValidatorSetUpdate(
                lastKnownVotingPower,
                cometPublicKeyType,
                cometPublicKeyBytes,
            );
        } else {
            // TODO: remove or ensure not in validator set?
        }
    }

    private async validatorNodeVotingPowerUpdateCallback(
        globalState: GlobalState,
        vb: ValidatorNodeVb,
        section: Section<ValidatorNodeVotingPowerUpdateSection>,
    ) {
        const publicKeyDeclaration = await vb.getCometbftPublicKeyDeclaration();
        const cometPublicKeyBytes = Base64.decodeBinary(publicKeyDeclaration.cometbftPublicKey);
        const lastKnownVotingPower = vb.getInternalState().getLastKnownVotingPower();
        this.addValidatorSetUpdate(
            lastKnownVotingPower,
            publicKeyDeclaration.cometbftPublicKeyType,
            cometPublicKeyBytes,
        );
    }

    private addValidatorSetUpdate(
        votingPower: number,
        pubKeyType: string,
        pubKeyBytes: Uint8Array,
    ) {
        const translatedPubKeyType = KEY_TYPE_MAPPING[pubKeyType];

        if (!translatedPubKeyType) {
            this.logger.error(`invalid key type '${pubKeyType}' for validator set update`);
            return false;
        }

        const validatorSetUpdateEntry: ValidatorSetUpdate = {
            power: votingPower,
            pub_key_type: translatedPubKeyType,
            pub_key_bytes: pubKeyBytes,
        };

        this.validatorSetUpdates.push(validatorSetUpdateEntry);
        return true;
    }
}
