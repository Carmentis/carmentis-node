import { NODE_SCHEMAS } from './constants/constants';
import { NodeCrypto } from './crypto/NodeCrypto';
import {
    CMTSToken,
    CryptographicHash,
    CryptoSchemeFactory,
    ECO,
    Economics,
    INITIAL_OFFER,
    PublicSignatureKey,
    SchemaSerializer,
    Sha256CryptographicHash,
    Utils,
} from '@cmts-dev/carmentis-sdk/server';
import { AccountInformation } from './types/AccountInformation';
import { Account } from './Account';
import { Logger } from '@nestjs/common';
import { Performance } from './Performance';
import { DbInterface } from './database/DbInterface';
import { RadixTree } from './RadixTree';

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

export interface Transfer {
    type: number;
    payerAccount: Uint8Array | null;
    payeeAccount: Uint8Array | null;
    amount: number;
}

interface AccountState {
    height: number;
    balance: number;
    lastHistoryHash: Uint8Array;
}

interface AccountHistoryEntry {
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

export class AccountManager {
    private readonly db: DbInterface;
    private readonly accountRadix: RadixTree;
    private readonly perf: Performance;
    private readonly logger: Logger;

    constructor(db: DbInterface, logger: Logger) {
        this.db = db;
        this.accountRadix = new RadixTree(this.db, NODE_SCHEMAS.DB_TOKEN_RADIX);
        this.logger = logger;
        this.perf = new Performance(logger, true);
    }

    getAccountRootHash() {
        return this.accountRadix.getRootHash()
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
        this.logger.debug(`Chain reference: {chainReference}`, {chainReference})

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
            );
        }

        this.logger.log(
            `${transfer.amount / ECO.TOKEN} ${ECO.TOKEN_NAME} transferred from ${shortPayerAccountString} to ${shortPayeeAccountString} (${ECO.BK_NAMES[transfer.type]})`,
        );

        perfMeasure.end();
    }

    /**
     * Loads the information about the account associated with the provided account hash.
     * @param accountHash - The hash of the account to load
     * @returns Account information including existence status, type, and state
     * @throws {TypeError} If accountHash is undefined
     */
    async loadAccountInformation(accountHash: Uint8Array): Promise<AccountInformation> {
        if (accountHash === undefined)
            throw new TypeError(ErrorMessages.UNDEFINED_ACCOUNT_HASH);
        const type = Economics.getAccountTypeFromIdentifier(accountHash);
        let state = await this.db.getObject(NODE_SCHEMAS.DB_ACCOUNT_STATE, accountHash);
        const exists = !!state;

        if (!exists) {
            state = {
                height: 0,
                balance: 0,
                lastHistoryHash: Utils.getNullHash(),
            };
        }


        return {
            exists: exists || type != ECO.ACCOUNT_STANDARD,
            type,
            // @ts-expect-error state should be included in the type
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
    ): Promise<void> {
        const accountInformation = await this.loadAccountInformation(accountHash);
        const accountState = accountInformation.state;

        accountState.height++;
        accountState.balance += type & ECO.BK_PLUS ? amount : -amount;
        accountState.lastHistoryHash = await this.addHistoryEntry(
            accountState,
            type,
            accountHash,
            linkedAccountHash,
            amount,
            chainReference,
            timestamp,
        );

        const record = this.db.serialize(NODE_SCHEMAS.DB_ACCOUNT_STATE, accountState);
        const stateHash = NodeCrypto.Hashes.sha256AsBinary(record);

        await this.accountRadix.set(accountHash, stateHash);
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
        const entry = await this.db.getObject(NODE_SCHEMAS.DB_ACCOUNT_HISTORY, historyHash);

        if (!entry) {
            throw new Error(ErrorMessages.HISTORY_ENTRY_NOT_FOUND);
        }

        return entry as AccountHistoryEntry;
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
        const keyHash = NodeCrypto.Hashes.sha256AsBinary(publicKey);

        const accountHash = await this.db.getRaw(NODE_SCHEMAS.DB_ACCOUNT_BY_PUBLIC_KEY, keyHash);

        if (accountHash) {
            throw new Error(ErrorMessages.PUBLIC_KEY_IN_USE);
        }
    }

    /**
     * Associates an account hash with a public key.
     *
     * @param accountHash - The account hash to associate
     * @param publicKey - The public key to associate with the account
     */
    async saveAccountByPublicKey(accountHash: Uint8Array, publicKey: Uint8Array): Promise<void> {
        const keyHash = NodeCrypto.Hashes.sha256AsBinary(publicKey);

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
