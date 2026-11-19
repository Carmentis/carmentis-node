import { AccountStateManager } from './AccountStateManager';
import {
    BalanceAvailability,
    LockType,
    ProtocolInternalState,
    Utils,
    VirtualBlockchainType,
} from '@cmts-dev/carmentis-sdk-core';
import {getLogger} from "@logtape/logtape";

export class AccountUnstakeHandler {
    private logger = getLogger(['node', 'accounts', 'unstake']);

    constructor(private readonly accountStateManager: AccountStateManager) {}

    /**
     * This method plan an unstake for a given amount of nodes.
     * @param accountHash
     * @param amount
     * @param objectType
     * @param objectIdentifier
     * @param timestamp
     * @param protocolState
     */
    async planUnstake(
        accountHash: Uint8Array,
        amount: number,
        objectType: number,
        objectIdentifier: Uint8Array,
        timestamp: number,
        protocolState: ProtocolInternalState,
    ) {
        // defense programming
        if (!Number.isInteger(amount)) throw new TypeError(`Amount must be an integer`);

        if (objectType != VirtualBlockchainType.NODE_VIRTUAL_BLOCKCHAIN) {
            throw new Error(
                `Staking and unstaking are currently supported for validator nodes only`,
            );
        }

        const minimumAmount = protocolState.getMinimumNodeStakingAmountInAtomics();
        const delayInDays = protocolState.getUnstakingDelayInDays();
        const plannedUnlockTimestamp = Utils.addDaysToTimestamp(timestamp, delayInDays);

        const accountInformation = await this.accountStateManager.loadAccountInformation(accountHash);
        const accountState = accountInformation.state;
        const balanceAvailability = new BalanceAvailability(
            accountState.balance,
            accountState.locks,
        );
        const stakedAmount = balanceAvailability.getNodeStakingLockAmount(objectIdentifier);
        const newStakedAmount = stakedAmount - amount;

        if (newStakedAmount < 0) {
            throw new Error(
                `Cannot unstake more than ${stakedAmount} atomic units, got ${newStakedAmount}`,
            );
        }
        if (newStakedAmount > 0 && newStakedAmount < minimumAmount) {
            throw new Error(
                `The updated staked amount must be either 0 or greater than or equal to ${minimumAmount} atomic units, got ${newStakedAmount}`,
            );
        }
        balanceAvailability.planNodeStakingUnlock(amount, plannedUnlockTimestamp, objectIdentifier);
        accountState.balance = balanceAvailability.getBalanceAsAtomics();
        accountState.locks = balanceAvailability.getLocks();

        await this.accountStateManager.saveAccountState(accountHash, accountState);
    }

    async applyNodeStakingUnlocks(accountHash: Uint8Array, timestamp: number) {
        const accountInformation = await this.accountStateManager.loadAccountInformation(accountHash);
        const accountState = accountInformation.state;
        const balanceAvailability = new BalanceAvailability(
            accountState.balance,
            accountState.locks,
        );
        // F-10 / F-07: tokens covered by a pending slashing are never released, and an unlock never exceeds
        // the current lock. Whatever could not be released stays planned and is retried on the next days.
        let totalUnstaked = 0;
        for (const lock of balanceAvailability.getNodeStakingLocks()) {
            if (lock.type !== LockType.NodeStaking) continue;
            const parameters = lock.parameters;
            if (parameters.plannedUnlockTimestamp == 0 || timestamp < parameters.plannedUnlockTimestamp) continue;
            const pendingSlashing = parameters.slashed ? parameters.plannedSlashingAmountInAtomics : 0;
            const releasable = Math.max(0, lock.lockedAmountInAtomics - pendingSlashing);
            const released = Math.max(0, Math.min(parameters.plannedUnlockAmountInAtomics, releasable));
            lock.lockedAmountInAtomics -= released;
            parameters.plannedUnlockAmountInAtomics -= released;
            if (parameters.plannedUnlockAmountInAtomics <= 0 || lock.lockedAmountInAtomics <= 0) {
                parameters.plannedUnlockAmountInAtomics = 0;
                parameters.plannedUnlockTimestamp = 0;
            }
            totalUnstaked += released;
        }
        balanceAvailability.setLocks(
            balanceAvailability.getLocks().filter(
                (lock) => !(lock.type == LockType.NodeStaking && lock.lockedAmountInAtomics == 0),
            ),
        );
        if (totalUnstaked > 0) {
            accountState.locks = balanceAvailability.getLocks();
            await this.accountStateManager.saveAccountState(accountHash, accountState);

            if(!balanceAvailability.hasNodeStakingLocks()) {
                this.logger.info(`No more staking locks on account ${Utils.binaryToHexa(accountHash)}: removing entry from ACCOUNTS_WITH_STAKING_LOCKS`);
                await this.accountStateManager.deleteAccountWithStakingLocks(accountHash);
            }
        }
    }
}
