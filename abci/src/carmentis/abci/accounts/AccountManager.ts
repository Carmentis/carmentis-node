import { NodeCrypto } from '../crypto/NodeCrypto';
import {
    AccountHistory,
    AccountInformation,
    AccountState,
    BalanceAvailability,
    BlockchainUtils,
    CMTSToken,
    CryptographicHash,
    ECO,
    Economics,
    EscrowParameters,
    Hash,
    INITIAL_OFFER,
    ProtocolInternalState,
    PublicSignatureKey,
    Sha256CryptographicHash,
    Utils,
    VestingParameters,
} from '@cmts-dev/carmentis-sdk/server';
import { getLogger, Logger } from '@logtape/logtape';
import { Performance } from '../Performance';
import { DbInterface } from '../database/DbInterface';
import { RadixTree } from '../RadixTree';
import { LevelDbTable } from '../database/LevelDbTable';
import { AccountStateManager } from './AccountStateManager';
import { AccountStakeHandler } from './AccountStakeHandler';
import { AccountUnstakeHandler } from './AccountUnstakeHandler';
import { AccountEscrowHandler } from './AccountEscrowHandler';
import { AccountTokenTransferHandler } from './AccountTokenTransferHandler';
import { AccountHistoryHandler } from './AccountHistoryHandler';
import { AccountSlashingHandler } from './AccountSlashingHandler';
import { AccountVestingHandler } from './AccountVestingHandler';
import { ErrorMessages } from './ErrorMessages';

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
    private readonly modifiedAccounts: Set<string>;
    private readonly perf: Performance;
    private readonly logger: Logger;
    private readonly accountStateManager: AccountStateManager;

    // dedicated handlers
    private readonly accountStakeHandler: AccountStakeHandler;
    private readonly accountUnstakeHandler: AccountUnstakeHandler;
    private readonly accountEscrowHandler: AccountEscrowHandler;
    private readonly accountTokenTransferHandler: AccountTokenTransferHandler;
    private readonly accountHistoryHandler: AccountHistoryHandler;
    private readonly accountSlashingHandler: AccountSlashingHandler;
    private readonly accountVestingHandler: AccountVestingHandler;

    constructor(db: DbInterface) {
        this.db = db;
        this.accountRadix = new RadixTree(this.db, LevelDbTable.TOKEN_RADIX);
        this.modifiedAccounts = new Set();
        this.logger = getLogger(['node', 'accounts', AccountManager.name]);
        this.perf = new Performance(this.logger, true);

        this.accountStateManager = new AccountStateManager(this.db, this.accountRadix);
        this.accountHistoryHandler = new AccountHistoryHandler(this.accountStateManager);
        this.accountTokenTransferHandler = new AccountTokenTransferHandler(
            this.accountStateManager,
            this.accountHistoryHandler,
        );
        this.accountStakeHandler = new AccountStakeHandler(this.accountStateManager);
        this.accountUnstakeHandler = new AccountUnstakeHandler(this.accountStateManager);
        this.accountEscrowHandler = new AccountEscrowHandler(
            this.accountStateManager,
            this.accountTokenTransferHandler,
        );
        this.accountSlashingHandler = new AccountSlashingHandler(this.accountStateManager);
        this.accountVestingHandler = new AccountVestingHandler(this.accountStateManager);
    }

    getAccountRootHash() {
        return this.accountRadix.getRootHash();
    }

    clearModifiedAccounts() {
        this.modifiedAccounts.clear();
    }

    getModifiedAccounts() {
        return [...this.modifiedAccounts].map((s) => Utils.binaryFromHexa(s));
    }

    async transferToken(
        fromAccountId: Uint8Array,
        toAccountId: Uint8Array,
        amountInAtomics: number,
    ) {
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
        await this.tokenTransfer(tokenTransfer, chainReference, timestamp);
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
        await this.accountTokenTransferHandler.tokenTransfer(transfer, chainReference, timestamp);
    }

    /**
     * Processes the settlement of an escrow by the agent. It may be either confirmed or canceled.
     */
    async escrowSettlement(
        account: Uint8Array,
        escrowIdentifier: Uint8Array,
        confirmed: boolean,
        timestamp: number,
        chainReference: unknown,
    ) {
        await this.accountEscrowHandler.escrowSettlement(
            account,
            escrowIdentifier,
            confirmed,
            timestamp,
            chainReference,
        );
    }

    async updateExpiredEscrows(payeeAccountHash: Uint8Array, payerAccountHash: Uint8Array, timestamp: number, blockHeight: number) {
        await this.accountEscrowHandler.updateExpiredEscrows(
            payeeAccountHash,
            payerAccountHash,
            timestamp,
            blockHeight
        );
    }

    async applyLinearVesting(accountHash: Uint8Array, timestamp: number) {
        await this.accountVestingHandler.applyLinearVesting(accountHash, timestamp);
    }

    /**
     * Locks up a portion of the balance for staking on a given object.
     */
    async stake(
        accountHash: Uint8Array,
        amount: number,
        objectType: number,
        objectIdentifier: Uint8Array,
        protocolState: ProtocolInternalState,
    ) {
        await this.accountStakeHandler.stake(
            accountHash,
            amount,
            objectType,
            objectIdentifier,
            protocolState,
        );
    }

    /**
     * Declares that the user wants to unstake some tokens.
     */
    async planUnstake(
        accountHash: Uint8Array,
        amount: number,
        objectType: number,
        objectIdentifier: Uint8Array,
        timestamp: number,
        protocolState: ProtocolInternalState,
    ) {
        await this.accountUnstakeHandler.planUnstake(
            accountHash,
            amount,
            objectType,
            objectIdentifier,
            timestamp,
            protocolState,
        );
    }

    async applyNodeStakingUnlocks(accountHash: Uint8Array, timestamp: number) {
        await this.accountUnstakeHandler.applyNodeStakingUnlocks(accountHash, timestamp);
    }

    async setSlashing(accountHash: Uint8Array, validatorNodeId: Uint8Array, timestamp: number) {
        await this.accountSlashingHandler.setSlashing(accountHash, validatorNodeId, timestamp);
    }

    async applyNodeSlashing(accountHash: Uint8Array, timestamp: number) {
        await this.accountSlashingHandler.applyNodeSlashing(accountHash, timestamp);
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
        const state = await this.db.getAccountStateByAccountId(accountHash);
        if (state !== undefined) {
            return {
                exists: true,
                type,
                state,
            };
        } else {
            return {
                exists: type != ECO.ACCOUNT_STANDARD,
                type,
                state: {
                    height: 0,
                    balance: 0,
                    lastHistoryHash: Utils.getNullHash(),
                    locks: [],
                },
            };
        }
    }

    /**
     * Loads the transaction history for an account.
     *
     * @param accountHash - The hash of the account
     * @param lastHistoryHash - The hash of the most recent history entry
     * @param maxRecords - Maximum number of history records to retrieve
     * @returns The account history with a list of entries
     */
    async loadHistory(lastHistoryHash: Uint8Array, maxRecords: number): Promise<AccountHistory> {
        return await this.accountHistoryHandler.loadHistory(lastHistoryHash, maxRecords);
    }

    /**
     * Loads the transaction history for an account between two history hashes.
     * This is typically used by the indexer to fetch missing history lines.
     *
     * @param fromHistoryHash - The hash of the current history entry
     * @param toHistoryHash - The hash of the last known history entry
     * @returns The account history with a list of entries
     */
    async getHistoryRange(
        fromHistoryHash: Uint8Array,
        toHistoryHash: Uint8Array,
    ): Promise<AccountHistory> {
        return await this.accountHistoryHandler.getHistoryRange(fromHistoryHash, toHistoryHash);
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
        return await this.accountHistoryHandler.addHistoryEntry(
            state,
            type,
            accountHash,
            linkedAccountHash,
            amount,
            chainReference,
            timestamp,
        );
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
        const accountHash = await this.db.getRaw(LevelDbTable.ACCOUNT_BY_PUBLIC_KEY, keyHash);
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
        this.logger.debug(
            `Storing association between account hash ${Utils.binaryToHexa(accountHash)} with hashed public key ${Utils.binaryToHexa(keyHash)}`,
        );
        await this.db.putRaw(LevelDbTable.ACCOUNT_BY_PUBLIC_KEY, keyHash, accountHash);
    }

    /**
     * Loads an account hash by its public key hash.
     *
     * @param keyHash - The hash of the public key
     * @returns The account hash associated with the public key
     * @throws {Error} If no account is found for the given key hash
     */
    async loadAccountIdByPublicKeyHash(keyHash: Uint8Array): Promise<Uint8Array> {
        const accountHash = await this.db.getRaw(LevelDbTable.ACCOUNT_BY_PUBLIC_KEY, keyHash);

        if (!accountHash) {
            throw new Error(ErrorMessages.UNKNOWN_ACCOUNT_KEY_HASH);
        }

        return accountHash;
    }

    async getAccountBalanceByAccountId(accountId: Uint8Array): Promise<CMTSToken> {
        const accountInformation = await this.loadAccountInformation(accountId);
        return CMTSToken.createAtomic(accountInformation.state.balance);
    }

    async loadAccountByPublicKey(publicSignatureKey: PublicSignatureKey) {
        return this.loadAccountIdByPublicKeyHash(
            await AccountManager.getAccountHashFromPublicSignatureKey(publicSignatureKey),
        );
    }

    async createIssuerAccount(
        publicKey: PublicSignatureKey,
        issuerAccountHash: Uint8Array,
        initialTokenAmountAsAtomic = INITIAL_OFFER,
    ) {
        //const issuerAccoountHash =   AccountManager.getAccountHashFromPublicSignatureKey(publicKey);
        this.logger.info(
            `Issuer account creation: association with account hash ${Utils.binaryToHexa(issuerAccountHash)}`,
        );
        await this.saveAccountByPublicKey(issuerAccountHash, await publicKey.getPublicKeyAsBytes());
        await this.setBalanceForAccount(
            ECO.BK_RECEIVED_ISSUANCE,
            issuerAccountHash,
            initialTokenAmountAsAtomic,
            Utils.getTimestampInSeconds(),
        );
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

        const record = BlockchainUtils.encodeAccountState(accountState);
        const stateHash = NodeCrypto.Hashes.sha256AsBinary(record);

        this.storeModifiedAccount(accountHash);
        await this.accountRadix.set(accountHash, stateHash);
        await this.db.putRaw(LevelDbTable.ACCOUNT_STATE, accountHash, record);
    }

    private static async getAccountHashFromPublicSignatureKey(publicKey: PublicSignatureKey) {
        const hash: CryptographicHash = new Sha256CryptographicHash();
        return hash.hash(await publicKey.getPublicKeyAsBytes());
    }

    async isAccountDefinedByAccountId(accountId: Uint8Array<ArrayBufferLike>) {
        const accountInformation = await this.loadAccountInformation(accountId);
        return accountInformation.exists;
    }

    async getStakedAmount(accountId: Hash) {
        const accountState = await this.db.getAccountStateByAccountId(accountId.toBytes());
        if (accountState === undefined)
            throw new Error(
                `Cannot return stake for this account: Account ${accountId.encode()} not found`,
            );
        const balanceAvailability = new BalanceAvailability(0, accountState.locks);
        return balanceAvailability.getBreakdown().staked;
    }

    private storeModifiedAccount(accountHash: Uint8Array) {
        this.modifiedAccounts.add(Utils.binaryToHexa(accountHash));
    }
}
