import { DbInterface } from '../database/DbInterface';
import { RadixTree } from '../RadixTree';
import { NodeCrypto } from '../crypto/NodeCrypto';
import { LevelDbTable } from '../database/LevelDbTable';
import {
    AccountInformation,
    AccountState,
    BlockchainUtils,
    ECO,
    Economics,
    Utils,
} from '@cmts-dev/carmentis-sdk/server';
import { getLogger } from '@logtape/logtape';

const UNDEFINED_ACCOUNT_HASH = 'Cannot load information account: received undefined hash';
export class AccountStateManager {
    private logger = getLogger(['node', 'accounts', 'state']);

    constructor(
        private readonly db: DbInterface,
        private readonly accountRadix: RadixTree,
    ) {}

    /**
     * Saves the state of an account to the database and updates the account radix.
     *
     * @param {Uint8Array} accountHash - The unique identifier for the account, represented as a binary hash.
     * @param {AccountState} accountState - The current state of the account to be saved.
     * @return {Promise<void>} A promise that resolves when the account state has been successfully saved.
     */
    async saveAccountState(accountHash: Uint8Array, accountState: AccountState) {
        const record = BlockchainUtils.encodeAccountState(accountState);
        //const record = this.db.serialize(LevelDbTable.ACCOUNT_STATE, accountState);
        const stateHash = NodeCrypto.Hashes.sha256AsBinary(record);

        await this.accountRadix.set(accountHash, stateHash);
        this.logger.debug(`Storing account state for account ${Utils.binaryToHexa(accountHash)}`);
        await this.db.putRaw(LevelDbTable.ACCOUNT_STATE, accountHash, record);
    }


    async loadAccountInformation(accountHash: Uint8Array): Promise<AccountInformation> {
        // defensive programming
        if (accountHash === undefined) {
            throw new TypeError(UNDEFINED_ACCOUNT_HASH);
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

    async putAccountWithStakingLocks(accountHash: Uint8Array) {
        await this.db.putAccountWithStakingLocks(accountHash);
    }

    getDatabase() {
        return this.db;
    }
}