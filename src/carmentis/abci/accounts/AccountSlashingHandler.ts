import { AccountStateManager } from './AccountStateManager';
import {
    BalanceAvailability,
    LockType,
} from '@cmts-dev/carmentis-sdk-core';

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
        // F-23: a new evidence never postpones a pending slashing (the earliest date is kept).
        // Node-side logic, so that the behavior does not depend on the linked SDK version.
        const lock = balanceAvailability.getNodeStakingLockOrFail(validatorNodeId);
        const parameters = lock.parameters;
        if (parameters.slashed) {
            parameters.plannedSlashingTimestamp = parameters.plannedSlashingTimestamp != 0
                ? Math.min(parameters.plannedSlashingTimestamp, timestamp)
                : timestamp;
            parameters.plannedSlashingAmountInAtomics = Math.max(
                parameters.plannedSlashingAmountInAtomics,
                lock.lockedAmountInAtomics,
            );
        }
        else {
            parameters.slashed = true;
            parameters.plannedSlashingAmountInAtomics = lock.lockedAmountInAtomics;
            parameters.plannedSlashingTimestamp = timestamp;
        }
        accountState.locks = balanceAvailability.getLocks();

        await this.accountStateManager.saveAccountState(accountHash, accountState);
    }

    async cancelSlashing(accountHash: Uint8Array, validatorNodeId: Uint8Array) {
        const accountInformation = await this.accountStateManager.loadAccountInformation(accountHash);
        const accountState = accountInformation.state;
        const balanceAvailability = new BalanceAvailability(
            accountState.balance,
            accountState.locks,
        );
        balanceAvailability.cancelNodeSlashing(validatorNodeId);
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
        // F-07: the slashed amount is bounded at application time by the current lock and balance, so that
        // neither can become negative (for instance after a partial unstake executed in the meantime).
        let totalSlashed = 0;
        let changed = false;
        let balance = balanceAvailability.getBalanceAsAtomics();
        for (const lock of balanceAvailability.getNodeStakingLocks()) {
            if (lock.type !== LockType.NodeStaking) continue;
            const parameters = lock.parameters;
            if (
                !parameters.slashed ||
                parameters.plannedSlashingTimestamp == 0 ||
                timestamp < parameters.plannedSlashingTimestamp
            ) continue;
            const amount = Math.max(0, Math.min(
                parameters.plannedSlashingAmountInAtomics,
                lock.lockedAmountInAtomics,
                balance,
            ));
            lock.lockedAmountInAtomics -= amount;
            balance -= amount;
            totalSlashed += amount;
            parameters.slashed = false;
            parameters.plannedSlashingTimestamp = 0;
            parameters.plannedSlashingAmountInAtomics = 0;
            changed = true;
        }
        if (!changed) return;

        balanceAvailability.setBalance(balance);
        balanceAvailability.adjustVesting();
        balanceAvailability.setLocks(
            balanceAvailability.getLocks().filter(
                (lock) => !(lock.type == LockType.NodeStaking && lock.lockedAmountInAtomics == 0),
            ),
        );
        accountState.balance = balanceAvailability.getBalanceAsAtomics();
        accountState.locks = balanceAvailability.getLocks();
        await this.accountStateManager.saveAccountState(accountHash, accountState);

        // the staking lock may have been removed: keep ACCOUNTS_WITH_STAKING_LOCKS consistent
        if (!balanceAvailability.hasNodeStakingLocks()) {
            await this.accountStateManager.deleteAccountWithStakingLocks(accountHash);
        }
    }
}
