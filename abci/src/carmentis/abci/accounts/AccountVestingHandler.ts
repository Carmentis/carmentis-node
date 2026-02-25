import { AccountStateManager } from './AccountStateManager';
import {
    BalanceAvailability,
    Utils,
} from '@cmts-dev/carmentis-sdk/server';
import {getLogger} from "@logtape/logtape";

export class AccountVestingHandler {
    private logger = getLogger(['node', 'accounts', 'vesting']);

    constructor(private readonly accountStateManager: AccountStateManager) {
    }

    async applyLinearVesting(accountHash: Uint8Array, timestamp: number) {
        const accountInformation = await this.accountStateManager.loadAccountInformation(accountHash);
        const accountState = accountInformation.state;
        const balanceAvailability = new BalanceAvailability(
            accountState.balance,
            accountState.locks,
        );

        if(balanceAvailability.applyLinearVesting(timestamp) > 0) {
            accountState.locks = balanceAvailability.getLocks();
            await this.accountStateManager.saveAccountState(accountHash, accountState);

            if(!balanceAvailability.hasVestingLocks()) {
                this.logger.info(`No more vesting locks on account ${Utils.binaryToHexa(accountHash)}: removing entry from ACCOUNTS_WITH_VESTING_LOCKS`);
                await this.accountStateManager.deleteAccountWithVestingLocks(accountHash);
            }
        }
    }
}
