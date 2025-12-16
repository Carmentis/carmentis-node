import { NODE_SCHEMAS } from '../constants/constants';
import { NodeCrypto } from '../crypto/NodeCrypto';
import {
    CMTSToken,
    CryptographicHash,
    CryptoSchemeFactory,
    ECO,
    Economics,
    LockType,
    EscrowParameters,
    VestingParameters,
    INITIAL_OFFER,
    PublicSignatureKey,
    SchemaSerializer,
    Sha256CryptographicHash,
    Utils,
} from '@cmts-dev/carmentis-sdk/server';
import { AccountState, AccountInformation } from '../types/AccountInformation';
import { Escrow } from '../types/Escrow';
import { Account } from '../Account';
import { Logger } from '@nestjs/common';
import { Performance } from '../Performance';
import { DbInterface } from '../database/DbInterface';
import { RadixTree } from '../RadixTree';
import { BalanceAvailability } from './BalanceAvailability';

/**
 * Error messages used by AccountManager
 */
const ErrorMessages = {
    UNDEFINED_FEES_PAYER: 'Undefined fees payer account',
    ACCOUNT_TYPE_NOT_ALLOWED: (accountType: string, transferType: string) =>
        `account of type '${accountType}' not allowed for transfer of type '${transferType}'`,
    INSUFFICIENT_FUNDS: (amount: number, tokenName: string, from: string, to: string, balance: number) =>
        `insufficient funds to transfer ${amount} ${tokenName} from ${from} to ${to}: the current payer balance is ${balance} ${tokenName}`,
    ACCOUNT_ALREADY_EXISTS: 'account already exists',
    INVALID_PAYEE: 'invalid payee',
    HISTORY_ENTRY_NOT_FOUND: 'Internal error: account history entry not found',
    PUBLIC_KEY_IN_USE: 'public key already in use',
    UNKNOWN_ACCOUNT_KEY_HASH: 'unknown account key hash',
    UNDEFINED_ACCOUNT_HASH: 'Cannot load information account: received undefined hash',
} as const;

export interface AccountHistoryEntry {
    height: number;
    previousHistoryHash: Uint8Array;
    type: number;
    timestamp: number;
    linkedAccount: Uint8Array;
    amount: number;
    chainReference: Uint8Array;
}

interface AccountHistory {
    list: AccountHistoryEntry[];
}

export interface Transfer {
    type: number;
    payerAccount: Uint8Array | null;
    payeeAccount: Uint8Array | null;
    amount: number;
    vestingParameters?: VestingParameters;
    escrowParameters?: EscrowParameters;
}

export class AccountManager {
    private readonly db: DbInterface;
    private readonly accountRadix: RadixTree;
    private readonly perf: Performance;
    private readonly logger: Logger;

    constructor(db: DbInterface, logger: Logger = new Logger()) {
        this.db = db;
        this.accountRadix = new RadixTree(this.db, NODE_SCHEMAS.DB_TOKEN_RADIX);
        this.logger = logger;
        this.perf = new Performance(logger, true);
    }

    getAccountRootHash() {
        return this.accountRadix.getRootHash()
    }

    async transferToken(fromAccountId: Uint8Array, toAccountId: Uint8Array, amountInAtomics: number) {
        const tokenTransfer: Transfer = {
            type: ECO.BK_SALE,
            payerAccount: fromAccountId,
            payeeAccount: toAccountId,
            amount: amountInAtomics,
        };
        const chainReference = {
            mbHash: Utils.getNullHash(),
            sectionIndex: 1,
        };
        const timestamp = Date.now();
       await this.tokenTransfer(
            tokenTransfer,
            chainReference,
            timestamp
        );
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
    async tokenTransfer(transfer: Transfer, chainReference: unknown, timestamp: number): Promise<void> {
        this.logger.debug(`Adding token transfer (type ${transfer.type}: Amount (in atomics): ${transfer.amount} at ${timestamp}`)
        this.logger.debug(`Transfer from: ${transfer.payerAccount instanceof Uint8Array ? Utils.binaryToHexa(transfer.payerAccount) : 'Unknown'}`)
        this.logger.debug(`Transfer to: ${transfer.payeeAccount instanceof Uint8Array ? Utils.binaryToHexa(transfer.payeeAccount) : 'Unknown'}`)

        const perfMeasure = this.perf.start('tokenTransfer');

        const accountCreation =
            transfer.type == ECO.BK_SENT_ISSUANCE || transfer.type == ECO.BK_SALE;

        let payeeBalance;
        let payerBalance;

        const shortPayerAccountString = this.getShortAccountString(transfer.payerAccount);
        const shortPayeeAccountString = this.getShortAccountString(transfer.payeeAccount);

        const feesPayerAccount = transfer.payerAccount;
        const isFeesPayerAccount = feesPayerAccount instanceof Uint8Array;
        if (!isFeesPayerAccount) {
            this.logger.warn(ErrorMessages.UNDEFINED_FEES_PAYER);
            payerBalance = null;
        } else {
            const payerInfo = await this.loadAccountInformation(transfer.payerAccount);

            if (!Economics.isAllowedTransfer(payerInfo.type, transfer.type)) {
                throw new Error(ErrorMessages.ACCOUNT_TYPE_NOT_ALLOWED(ECO.ACCOUNT_NAMES[payerInfo.type], ECO.BK_NAMES[transfer.type]));
            }

            payerBalance = payerInfo.state.balance;

            if (payerBalance < transfer.amount) {
                throw new Error(
                    ErrorMessages.INSUFFICIENT_FUNDS(
                        transfer.amount / ECO.TOKEN,
                        ECO.TOKEN_NAME,
                        shortPayerAccountString,
                        shortPayeeAccountString,
                        payerBalance / ECO.TOKEN
                    )
                );
            }
        }

        if (transfer.payeeAccount === null) {
            payeeBalance = null;
        } else {
            const payeeInfo = await this.loadAccountInformation(transfer.payeeAccount);

            if (!Economics.isAllowedTransfer(payeeInfo.type, transfer.type ^ ECO.BK_PLUS)) {
                throw new Error(ErrorMessages.ACCOUNT_TYPE_NOT_ALLOWED(ECO.ACCOUNT_NAMES[payeeInfo.type], ECO.BK_NAMES[transfer.type ^ ECO.BK_PLUS]));
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

        perfMeasure.event('before updates');

        if (payerBalance !== null) {
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

        if (payeeBalance !== null) {
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

        this.logger.log(
            `${transfer.amount / ECO.TOKEN} ${ECO.TOKEN_NAME} transferred from ${shortPayerAccountString} to ${shortPayeeAccountString} (${ECO.BK_NAMES[transfer.type]})`,
        );

        perfMeasure.end();
    }

    /**
     * Processes the settlement of an escrow by the agent. It may be either confirmed or canceled.
     */
    async escrowSettlement(account: Uint8Array, identifier: Uint8Array, confirmed: boolean, timestamp: number, chainReference: unknown) {
        const escrow = <Escrow>await this.db.getObject(NODE_SCHEMAS.DB_ESCROWS, identifier);

        // make sure that this escrow exists
        if(escrow === undefined) {
            throw new Error(`rejected escrow settlement: unknown or out-of-date escrow identifier`);
        }
        // make sure that the caller is the agent
        if(!Utils.binaryIsEqual(account, escrow.agentAccount)) {
            throw new Error(`rejected escrow settlement: caller is not the agent`);
        }

        // retrieve the lock from the payee account, get the amount, then remove the lock
        const accountInformation = await this.loadAccountInformation(escrow.payeeAccount);
        const payeeAccountState = accountInformation.state;
        const lockIndex = payeeAccountState.locks.findIndex((lock) =>
            lock.type == LockType.Escrow &&
            Utils.binaryIsEqual(lock.parameters.identifier, identifier)
        );

        if(lockIndex === -1) {
            throw new Error(`PANIC - unable to find the lock of the escrow to be settled`);
        }

        const amount = payeeAccountState.locks[lockIndex].lockedAmountInAtomics;

        payeeAccountState.locks.splice(lockIndex, 1);

        await this.saveState(escrow.payeeAccount, payeeAccountState);

        // if the escrow is canceled, send the funds back to the payer
        if(!confirmed) {
            const tokenTransfer: Transfer = {
                type: ECO.BK_SENT_ESCROW_REFUND,
                payerAccount: escrow.payeeAccount,
                payeeAccount: escrow.payerAccount,
                amount
            };

            await this.tokenTransfer(
                tokenTransfer,
                chainReference,
                timestamp
            );
        }

        // remove the escrow from the DB
        await this.db.del(NODE_SCHEMAS.DB_ESCROWS, identifier);
    }

    /**
     * Locks up a portion of the balance for staking on a given object.
     */
    async stake(accountHash: Uint8Array, amount: number, objectType: number, objectIdentifier: Uint8Array) {
        const accountInformation = await this.loadAccountInformation(accountHash);
        const accountState = accountInformation.state;
        const balanceAvailability = new BalanceAvailability(
            accountState.balance,
            accountState.locks,
        );
        balanceAvailability.addNodeStaking(amount, objectIdentifier);
        accountState.balance = balanceAvailability.getBalanceAsAtomics();
        accountState.locks = balanceAvailability.getLocks();

        await this.saveState(accountHash, accountState);
    }

    /**
     * Loads the information about the account associated with the provided account hash.
     * @param accountHash - The hash of the account to load
     * @returns Account information including existence status, type, and state
     * @throws {TypeError} If accountHash is undefined
     */
    async loadAccountInformation(accountHash: Uint8Array): Promise<AccountInformation> {
        // defensive programming
        if (accountHash === undefined) {
            throw new TypeError(ErrorMessages.UNDEFINED_ACCOUNT_HASH);
        }

        // search for the type of account based on its hash
        const type = Economics.getAccountTypeFromIdentifier(accountHash);
        let state = await this.db.getAccountStateByAccountId(accountHash);
        const exists = state !== undefined;

        if (!exists) {
            state = {
                height: 0,
                balance: 0,
                lastHistoryHash: Utils.getNullHash(),
                locks: [],
            };
        }

        return {
            exists: exists || type != ECO.ACCOUNT_STANDARD,
            type,
            state,
        };
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
        const accountInformation = await this.loadAccountInformation(accountHash);
        const accountState = accountInformation.state;
        const signedAmount = type & ECO.BK_PLUS ? amount : -amount;

        const balanceAvailability = new BalanceAvailability(
            accountState.balance,
            accountState.locks,
        );

        switch(type) {
            case ECO.BK_RECEIVED_VESTING: {
                if(vestingParameters === null) {
                    throw new Error('Vesting parameters are missing');
                }
                balanceAvailability.addVestedTokens(signedAmount, vestingParameters);
                await this.db.putAccountWithVestingLocks(accountHash);
                break;
            }
            case ECO.BK_RECEIVED_ESCROW: {
                if(escrowParameters === null) {
                    throw new Error('Escrow parameters are missing');
                }
                balanceAvailability.addEscrowedTokens(signedAmount, escrowParameters);
                await this.db.putEscrow(
                    escrowParameters.identifier,
                    {
                        payerAccount: linkedAccountHash,
                        payeeAccount: accountHash,
                        agentAccount: escrowParameters.transferAuthorizerAccountId
                    }
                );
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

        accountState.lastHistoryHash = await this.addHistoryEntry(
            accountState,
            type,
            accountHash,
            linkedAccountHash,
            amount,
            chainReference,
            timestamp,
        );

        await this.saveState(accountHash, accountState);
    }

    /**
     * Saves an account state in the DB_ACCOUNT_STATE table and in the account radix tree.
     */
    private async saveState(accountHash: Uint8Array, accountState: AccountState) {
        const record = this.db.serialize(NODE_SCHEMAS.DB_ACCOUNT_STATE, accountState);
        const stateHash = NodeCrypto.Hashes.sha256AsBinary(record);

        await this.accountRadix.set(accountHash, stateHash);
        this.logger.debug(`Storing account state for account ${Utils.binaryToHexa(accountHash)}`)
        await this.db.putRaw(NODE_SCHEMAS.DB_ACCOUNT_STATE, accountHash, record);
    }

    /**
     * Loads the transaction history for an account.
     *
     * @param accountHash - The hash of the account
     * @param lastHistoryHash - The hash of the most recent history entry
     * @param maxRecords - Maximum number of history records to retrieve
     * @returns The account history with a list of entries
     */
    async loadHistory(accountHash: Uint8Array, lastHistoryHash: Uint8Array, maxRecords: number): Promise<AccountHistory> {
        let historyHash = lastHistoryHash;
        const list = [];

        while (maxRecords-- && !Utils.binaryIsEqual(historyHash, Utils.getNullHash())) {
            const entry = await this.loadHistoryEntry(accountHash, historyHash);

            list.push(entry);
            historyHash = entry.previousHistoryHash;
        }

        return { list };
    }

    private async loadHistoryEntry(accountHash: Uint8Array, historyHash: Uint8Array): Promise<AccountHistoryEntry> {
        const accountHistoryEntry = await this.db.getAccountHistoryEntryByHistoryHash(historyHash);
        if (accountHistoryEntry) {
            return accountHistoryEntry;
        } else {
            throw new Error(ErrorMessages.HISTORY_ENTRY_NOT_FOUND);
        }
    }

    private async addHistoryEntry(
        state: AccountState,
        type: number,
        accountHash: Uint8Array,
        linkedAccountHash: Uint8Array | null,
        amount: number,
        chainReference: unknown,
        timestamp: number,
    ): Promise<Uint8Array> {
        const serializer = new SchemaSerializer(
            NODE_SCHEMAS.ACCOUNT_REF_SCHEMAS[ECO.BK_REFERENCES[type]],
        );
        const chainReferenceBinary = serializer.serialize(chainReference);

        const entry = {
            height: state.height,
            previousHistoryHash: state.lastHistoryHash,
            type: type,
            timestamp: timestamp,
            linkedAccount: linkedAccountHash || Utils.getNullHash(),
            amount: amount,
            chainReference: chainReferenceBinary,
        };

        const record = this.db.serialize(NODE_SCHEMAS.DB_ACCOUNT_HISTORY, entry);
        const hash = this.getHistoryEntryHash(accountHash, NodeCrypto.Hashes.sha256AsBinary(record));
        this.logger.debug(`Storing new entry in account history for account ${Utils.binaryToHexa(accountHash)}`)
        await this.db.putRaw(NODE_SCHEMAS.DB_ACCOUNT_HISTORY, hash, record);

        return hash;
    }

    private getHistoryEntryHash(accountHash: Uint8Array, recordHash: Uint8Array): Uint8Array {
        return NodeCrypto.Hashes.sha256AsBinary(Utils.binaryFrom(accountHash, recordHash));
    }

    /**
     * Tests if a public key is available (not already in use).
     *
     * @param publicKey - The public key to test
     * @throws {Error} If the public key is already in use
     */
    async checkPublicKeyAvailabilityOrFail(publicKey: Uint8Array): Promise<void> {
        const isPublicKeyAvailable = await this.isPublicKeyAvailable(publicKey);
        if (!isPublicKeyAvailable) {
            throw new Error(ErrorMessages.PUBLIC_KEY_IN_USE);
        }
    }

    /**
     * Checks if a public key is available in the database.
     *
     * @param {Uint8Array} publicKeyBytes - The public key to be checked.
     * @return {Promise<boolean>} A promise that resolves to true if the public key is available, otherwise false.
     */
    async isPublicKeyAvailable(publicKeyBytes: Uint8Array): Promise<boolean> {
        const keyHash = NodeCrypto.Hashes.sha256AsBinary(publicKeyBytes);
        const accountHash = await this.db.getRaw(NODE_SCHEMAS.DB_ACCOUNT_BY_PUBLIC_KEY, keyHash);
        return accountHash === undefined;
    }



    /**
     * Associates an account hash with a public key.
     *
     * @param accountHash - The account hash to associate
     * @param publicKey - The public key to associate with the account
     */
    async saveAccountByPublicKey(accountHash: Uint8Array, publicKey: Uint8Array): Promise<void> {
        const keyHash = NodeCrypto.Hashes.sha256AsBinary(publicKey);
        this.logger.debug(`Storing association between account hash ${Utils.binaryToHexa(accountHash)} with hashed public key ${Utils.binaryToHexa(keyHash)}`)
        await this.db.putRaw(NODE_SCHEMAS.DB_ACCOUNT_BY_PUBLIC_KEY, keyHash, accountHash);
    }

    /**
     * Loads an account hash by its public key hash.
     *
     * @param keyHash - The hash of the public key
     * @returns The account hash associated with the public key
     * @throws {Error} If no account is found for the given key hash
     */
    async loadAccountByPublicKeyHash(keyHash: Uint8Array): Promise<Uint8Array> {
        const accountHash = await this.db.getRaw(NODE_SCHEMAS.DB_ACCOUNT_BY_PUBLIC_KEY, keyHash);

        if (!accountHash) {
            throw new Error(ErrorMessages.UNKNOWN_ACCOUNT_KEY_HASH);
        }

        return accountHash;
    }

    async getAccountBalanceByAccountId(accountId: Uint8Array): Promise<CMTSToken> {
        const accountInformation = await this.loadAccountInformation(accountId);
        return CMTSToken.createAtomic(accountInformation.state.balance);
    }

    private getShortAccountString(account: Uint8Array | null): string {
        return account === null
            ? 'NULL'
            : Utils.truncateStringMiddle(Utils.binaryToHexa(account), 8, 4);
    }

    async loadAccountByPublicKey(publicSignatureKey: PublicSignatureKey) {
        return this.loadAccountByPublicKeyHash(
            await AccountManager.getAccountHashFromPublicSignatureKey(publicSignatureKey),
        );
    }

    async createIssuerAccount(publicKey: PublicSignatureKey, issuerAccountHash: Uint8Array, initialTokenAmountAsAtomic = INITIAL_OFFER) {
        //const issuerAccoountHash =   AccountManager.getAccountHashFromPublicSignatureKey(publicKey);
        this.logger.log(`Issuer account creation: association with account hash ${Utils.binaryToHexa(issuerAccountHash)}`)
        await this.saveAccountByPublicKey(
            issuerAccountHash,
            await publicKey.getPublicKeyAsBytes(),
        );
        await this.setBalanceForAccount(
            ECO.BK_RECEIVED_ISSUANCE,
            issuerAccountHash,
            initialTokenAmountAsAtomic,
            Utils.getTimestampInSeconds()
        )
    }

    async createAccountWithNoTokens(publicKey: PublicSignatureKey) {
        const accountHash = await AccountManager.getAccountHashFromPublicSignatureKey(publicKey);
        await this.saveAccountByPublicKey(
            accountHash,
            await publicKey.getPublicKeyAsBytes(),
        );
        await this.setBalanceForAccount(
            ECO.BK_RECEIVED_PAYMENT,
            accountHash,
            0,
            Utils.getTimestampInSeconds()
        )
    }

    private async setBalanceForAccount(
        type: number,
        accountHash: Uint8Array,
        amount: number,
        timestamp: number,
    ): Promise<void> {
        const accountInformation = await this.loadAccountInformation(accountHash);
        const accountState = accountInformation.state;

        accountState.height++;
        accountState.balance += type & ECO.BK_PLUS ? amount : -amount;
        accountState.lastHistoryHash = await this.addHistoryEntry(
            accountState,
            type,
            accountHash,
            null,
            amount,
            { mbHash: Utils.getNullHash(), sectionIndex: 0 },
            timestamp,
        );

        const record = this.db.serialize(NODE_SCHEMAS.DB_ACCOUNT_STATE, accountState);
        const stateHash = NodeCrypto.Hashes.sha256AsBinary(record);

        await this.accountRadix.set(accountHash, stateHash);
        await this.db.putRaw(NODE_SCHEMAS.DB_ACCOUNT_STATE, accountHash, record);
    }

    private static async getAccountHashFromPublicSignatureKey(publicKey: PublicSignatureKey) {
        const hash: CryptographicHash = new Sha256CryptographicHash();
        return hash.hash(await publicKey.getPublicKeyAsBytes())
    }
}
