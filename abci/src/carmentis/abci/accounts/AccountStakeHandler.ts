import { AccountStateManager } from './AccountStateManager';
import {
    BalanceAvailability,
    ProtocolInternalState,
    VirtualBlockchainType,
} from '@cmts-dev/carmentis-sdk/server';

/**
 * Handler for the account stake operations.
 *
 */
export class AccountStakeHandler {
    constructor(private readonly accountStateManager: AccountStateManager) {}

    /**
     * The stake is executed directly.
     *
     * @param accountHash
     * @param amount
     * @param objectType
     * @param objectIdentifier
     * @param protocolState
     */
    async stake(
        accountHash: Uint8Array,
        amount: number,
        objectType: number,
        objectIdentifier: Uint8Array,
        protocolState: ProtocolInternalState,
    ) {
        // defense programming
        if (!Number.isInteger(amount)) throw new TypeError(`Amount must be an integer`);

        // we currently only support staking for validator nodes
        if (objectType != VirtualBlockchainType.NODE_VIRTUAL_BLOCKCHAIN) {
            throw new Error(
                `Staking and unstaking are currently supported for validator nodes only`,
            );
        }

        // we recover the current account state to get the current stake for this objetc
        const accountInformation =
            await this.accountStateManager.loadAccountInformation(accountHash);
        const accountState = accountInformation.state;
        const balanceAvailability = new BalanceAvailability(
            accountState.balance,
            accountState.locks,
        );

        // we need to ensure that the staking will not exceed the maximum allowed amount of staked tokens
        const minimumAmount = protocolState.getMinimumNodeStakingAmountInAtomics();
        const maximumAmount = protocolState.getMaximumNodeStakingAmountInAtomics();
        const currentStakedAmount = balanceAvailability.getNodeStakingLockAmount(objectIdentifier);
        const newStakeAmount = currentStakedAmount + amount;
        if (newStakeAmount < minimumAmount || maximumAmount < newStakeAmount) {
            throw new Error(
                `Staking amount in atomics must be in [${minimumAmount} .. ${maximumAmount}], got ${amount}`,
            );
        }

        balanceAvailability.addNodeStaking(amount, objectIdentifier);
        await this.accountStateManager.putAccountWithStakingLocks(accountHash);
        accountState.balance = balanceAvailability.getBalanceAsAtomics();
        accountState.locks = balanceAvailability.getLocks();

        await this.accountStateManager.saveAccountState(accountHash, accountState);
    }
}