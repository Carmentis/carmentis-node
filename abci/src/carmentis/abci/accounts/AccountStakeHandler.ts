import { AccountStateManager } from './AccountStateManager';
import {
    BalanceAvailability,
    ProtocolInternalState,
    VirtualBlockchainType,
} from '@cmts-dev/carmentis-sdk/server';

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
        // we currently only support staking for validator nodes
        if (objectType != VirtualBlockchainType.NODE_VIRTUAL_BLOCKCHAIN) {
            throw new Error(
                `Staking and unstaking are currently supported for validator nodes only`,
            );
        }

        // verify that the amount is within the allowed range
        const minimumAmount = protocolState.getMinimumNodeStakingAmountInAtomics();
        const maximumAmount = protocolState.getMaximumNodeStakingAmountInAtomics();
        if (amount < minimumAmount || maximumAmount < amount) {
            throw new Error(
                `Staking amount in atomics must be in [${minimumAmount} .. ${maximumAmount}], got ${amount}`,
            );
        }

        // we need to ensure that the staking will not exceed the maximum allowed amount of staked tokens
        // TODO

        // load the current account state
        // TODO: check that the account exists
        const accountInformation =
            await this.accountStateManager.loadAccountInformation(accountHash);
        const accountState = accountInformation.state;
        const balanceAvailability = new BalanceAvailability(
            accountState.balance,
            accountState.locks,
        );
        balanceAvailability.addNodeStaking(amount, objectIdentifier);
        await this.db.putAccountWithStakingLocks(accountHash);
        accountState.balance = balanceAvailability.getBalanceAsAtomics();
        accountState.locks = balanceAvailability.getLocks();

        await this.accountStateManager.saveAccountState(accountHash, accountState);

    }
}