import { AccountStateManager } from './AccountStateManager';
import {
    BalanceAvailability,
} from '@cmts-dev/carmentis-sdk/server';

export class AccountSlashingHandler {
    constructor(private readonly accountStateManager: AccountStateManager) {}

    /**
     * Sets slashing on a node.
     */
    async setSlashing(accountHash: Uint8Array, validatorNodeId: Uint8Array, timestamp: number) {
        const accountInformation = await this.accountStateManager.loadAccountInformation(accountHash);
        const accountState = accountInformation.state;
        const balanceAvailability = new BalanceAvailability(
            accountState.balance,
            accountState.locks,
        );
        balanceAvailability.setSlashing(validatorNodeId, timestamp);
        accountState.locks = balanceAvailability.getLocks();

        await this.accountStateManager.saveAccountState(accountHash, accountState);
    }

    /**
     * Applies slashing on a node.
     */
    async applyNodeSlashing(accountHash: Uint8Array, timestamp: number) {
        const accountInformation = await this.accountStateManager.loadAccountInformation(accountHash);
        const accountState = accountInformation.state;
        const balanceAvailability = new BalanceAvailability(
            accountState.balance,
            accountState.locks,
        );
        if (balanceAvailability.applyNodeSlashing(timestamp) > 0) {
            accountState.balance = balanceAvailability.getBalanceAsAtomics();
            accountState.locks = balanceAvailability.getLocks();

            await this.accountStateManager.saveAccountState(accountHash, accountState);
        }
    }
}
