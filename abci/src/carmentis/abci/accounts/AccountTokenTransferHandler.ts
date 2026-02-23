import { AccountStateManager } from './AccountStateManager';
import { Transfer } from './AccountManager';
import {
    BalanceAvailability,
    ECO,
    Economics,
    EscrowParameters,
    Utils,
    VestingParameters,
} from '@cmts-dev/carmentis-sdk/server';
import { getLogger } from '@logtape/logtape';
import { AccountHistoryHandler } from './AccountHistoryHandler';
import { DbInterface } from '../database/DbInterface';
import { ErrorMessages } from './ErrorMessages';

export class AccountTokenTransferHandler {
    private logger = getLogger(['node', 'accounts', 'token']);

    private readonly db: DbInterface;
    constructor(
        private readonly accountStateManager: AccountStateManager,
        private readonly accountHistoryHandler: AccountHistoryHandler,
    ) {
        this.db = accountStateManager.getDatabase();
    }

    /**
     * Processes a token transfer between accounts.
     * Validates account types, balances, and transfer permissions before executing.
     *
     * @param transfer - The transfer details including type, payer, payee, and amount
     * @param chainReference - Reference to the blockchain context
     * @param timestamp - The timestamp of the transfer
     * @throws {Error} If account types are incompatible with transfer type
     * @throws {Error} If payer has insufficient funds
     * @throws {Error} If accounts don't exist when required
     */
    async tokenTransfer(
        transfer: Transfer,
        chainReference: unknown,
        timestamp: number,
    ): Promise<void> {
        this.logger.debug(
            `Adding token transfer (type ${transfer.type}: Amount (in atomics): ${transfer.amount} at ${timestamp}`,
        );
        this.logger.debug(
            `Transfer from: ${transfer.payerAccount instanceof Uint8Array ? Utils.binaryToHexa(transfer.payerAccount) : 'Unknown'}`,
        );
        this.logger.debug(
            `Transfer to: ${transfer.payeeAccount instanceof Uint8Array ? Utils.binaryToHexa(transfer.payeeAccount) : 'Unknown'}`,
        );

        const accountCreation =
            transfer.type == ECO.BK_SENT_ISSUANCE || transfer.type == ECO.BK_SALE;

        let payeeBalance;
        let payerBalance;

        const shortPayerAccountString = this.getShortAccountString(transfer.payerAccount);
        const shortPayeeAccountString = this.getShortAccountString(transfer.payeeAccount);

        if (transfer.payerAccount === null) {
            this.logger.warn(ErrorMessages.UNDEFINED_FEES_PAYER);
            payerBalance = null;
        } else {
            const payerInfo = await this.accountStateManager.loadAccountInformation(transfer.payerAccount);

            if (!Economics.isAllowedTransfer(payerInfo.type, transfer.type)) {
                throw new Error(
                    ErrorMessages.ACCOUNT_TYPE_NOT_ALLOWED(
                        ECO.ACCOUNT_NAMES[payerInfo.type],
                        ECO.BK_NAMES[transfer.type],
                    ),
                );
            }

            payerBalance = payerInfo.state.balance;

            const balanceAvailability = new BalanceAvailability(
                payerBalance,
                payerInfo.state.locks,
            );
            const spendableTokens = balanceAvailability.getBreakdown().spendable;

            if (spendableTokens < transfer.amount) {
                throw new Error(
                    ErrorMessages.INSUFFICIENT_FUNDS(
                        transfer.amount / ECO.TOKEN,
                        ECO.TOKEN_NAME,
                        shortPayerAccountString,
                        shortPayeeAccountString,
                        spendableTokens / ECO.TOKEN,
                    ),
                );
            }
        }

        if (transfer.payeeAccount === null) {
            payeeBalance = null;
        } else {
            const payeeInfo = await this.accountStateManager.loadAccountInformation(
                transfer.payeeAccount,
            );

            if (!Economics.isAllowedTransfer(payeeInfo.type, transfer.type ^ ECO.BK_PLUS)) {
                throw new Error(
                    ErrorMessages.ACCOUNT_TYPE_NOT_ALLOWED(
                        ECO.ACCOUNT_NAMES[payeeInfo.type],
                        ECO.BK_NAMES[transfer.type ^ ECO.BK_PLUS],
                    ),
                );
            }

            if (accountCreation) {
                if (payeeInfo.exists) {
                    throw new Error(ErrorMessages.ACCOUNT_ALREADY_EXISTS);
                }
            } else {
                if (!payeeInfo.exists) {
                    throw new Error(ErrorMessages.INVALID_PAYEE);
                }
            }

            payeeBalance = payeeInfo.state.balance;
        }

        if (payerBalance !== null && transfer.payerAccount !== null) {
            await this.update(
                transfer.type,
                transfer.payerAccount,
                transfer.payeeAccount,
                transfer.amount,
                chainReference,
                timestamp,
                transfer.vestingParameters || null,
                transfer.escrowParameters || null,
            );
        }

        if (payeeBalance !== null && transfer.payeeAccount !== null) {
            await this.update(
                transfer.type ^ 1,
                transfer.payeeAccount,
                transfer.payerAccount,
                transfer.amount,
                chainReference,
                timestamp,
                transfer.vestingParameters || null,
                transfer.escrowParameters || null,
            );
        }

        this.logger.info(
            `${transfer.amount / ECO.TOKEN} ${ECO.TOKEN_NAME} transferred from ${shortPayerAccountString} to ${shortPayeeAccountString} (${ECO.BK_NAMES[transfer.type]})`,
        );
    }

    private async update(
        type: number,
        accountHash: Uint8Array,
        linkedAccountHash: Uint8Array | null,
        amount: number,
        chainReference: unknown,
        timestamp: number,
        vestingParameters: VestingParameters | null = null,
        escrowParameters: EscrowParameters | null = null,
    ): Promise<void> {
        const accountInformation =
            await this.accountStateManager.loadAccountInformation(accountHash);
        const accountState = accountInformation.state;
        const signedAmount = type & ECO.BK_PLUS ? amount : -amount;

        const balanceAvailability = new BalanceAvailability(
            accountState.balance,
            accountState.locks,
        );

        switch (type) {
            case ECO.BK_RECEIVED_VESTING: {
                this.logger.debug(
                    `Received vested tokens on account ${Utils.binaryToHexa(accountHash)}`,
                );

                if (vestingParameters === null) {
                    throw new Error('Vesting parameters are missing');
                }
                balanceAvailability.addVestedTokens(signedAmount, vestingParameters);
                await this.db.putAccountWithVestingLocks(accountHash);
                break;
            }
            case ECO.BK_RECEIVED_ESCROW: {
                this.logger.debug(
                    `Received escrowed tokens on account ${Utils.binaryToHexa(accountHash)}`,
                );

                // reject if escrow parameters are missing
                if (escrowParameters === null) {
                    throw new Error('Escrow parameters are missing');
                }

                // the payer account must exist because it has sent funds to the escrow account
                if (linkedAccountHash === null) {
                    throw new Error(
                        'Received undefined linked account hash for escrow transfer: SHOULD NOT HAPPEN',
                    );
                }

                balanceAvailability.addEscrowedTokens(signedAmount, escrowParameters);
                await this.db.putEscrow(escrowParameters.escrowIdentifier, {
                    payerAccount: linkedAccountHash,
                    payeeAccount: accountHash,
                    agentAccount: escrowParameters.transferAuthorizerAccountId,
                });
                break;
            }
            default: {
                balanceAvailability.addSpendableTokens(signedAmount);
                break;
            }
        }

        accountState.height++;
        accountState.balance = balanceAvailability.getBalanceAsAtomics();
        accountState.locks = balanceAvailability.getLocks();
        accountState.lastHistoryHash = await this.accountHistoryHandler.addHistoryEntry(
            accountState,
            type,
            accountHash,
            linkedAccountHash,
            amount,
            chainReference,
            timestamp,
        );

        await this.accountStateManager.saveAccountState(accountHash, accountState);
    }

    private getShortAccountString(account: Uint8Array | null): string {
        return account === null
            ? 'NULL'
            : Utils.truncateStringMiddle(Utils.binaryToHexa(account), 8, 4);
    }
}