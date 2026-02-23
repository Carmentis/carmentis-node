import { NodeEncoder } from '../NodeEncoder';
import { NodeCrypto } from '../crypto/NodeCrypto';
import { LevelDbTable } from '../database/LevelDbTable';
import { NODE_SCHEMAS } from '../constants/constants';
import {
    AccountHistory,
    AccountHistoryEntry,
    AccountState,
    ECO,
    SchemaSerializer,
    Utils,
} from '@cmts-dev/carmentis-sdk/server';
import { AccountStateManager } from './AccountStateManager';
import { getLogger } from '@logtape/logtape';
import { DbInterface } from '../database/DbInterface';
import { ErrorMessages } from './ErrorMessages';

export class AccountHistoryHandler {
    private logger = getLogger(["node", "account", "history"]);

    private readonly db: DbInterface
    constructor(private readonly accountStateHandler: AccountStateManager) {
        this.db = accountStateHandler.getDatabase();
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
        let historyHash = lastHistoryHash;
        const list: AccountHistory = [];

        for (let index = maxRecords; index > 0; index--) {
            // if there are no more history entries, break the loop
            if (Utils.binaryIsEqual(historyHash, Utils.getNullHash())) break;

            // load and add the history entry to the list
            const entry = await this.loadHistoryEntry(historyHash);
            list.push(entry);
            historyHash = entry.previousHistoryHash;
        }
        return list;
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
        let historyHash = fromHistoryHash;
        const list: AccountHistory = [];

        while (!Utils.binaryIsEqual(historyHash, toHistoryHash)) {
            // if there are no more history entries, break the loop
            if (Utils.binaryIsEqual(historyHash, Utils.getNullHash())) break;

            // load and add the history entry to the list
            const entry = await this.loadHistoryEntry(historyHash);
            list.push(entry);
            historyHash = entry.previousHistoryHash;
        }
        return list;
    }

    async loadHistoryEntry(historyHash: Uint8Array): Promise<AccountHistoryEntry> {
        const accountHistoryEntry = await this.db.getAccountHistoryEntryByHistoryHash(historyHash);
        if (accountHistoryEntry) {
            return accountHistoryEntry;
        } else {
            throw new Error(ErrorMessages.HISTORY_ENTRY_NOT_FOUND);
        }
    }

    async addHistoryEntry(
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

        const record = NodeEncoder.encodeAccountHistoryEntry(entry);
        const hash = this.getHistoryEntryHash(
            accountHash,
            NodeCrypto.Hashes.sha256AsBinary(record),
        );
        this.logger.debug(
            `Storing new entry in account history for account ${Utils.binaryToHexa(accountHash)}`,
        );
        await this.db.putRaw(LevelDbTable.ACCOUNT_HISTORY, hash, record);

        return hash;
    }

    private getHistoryEntryHash(accountHash: Uint8Array, recordHash: Uint8Array): Uint8Array {
        return NodeCrypto.Hashes.sha256AsBinary(Utils.binaryFrom(accountHash, recordHash));
    }
}