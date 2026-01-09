import { CMTSToken, Utils } from '@cmts-dev/carmentis-sdk/server';
import { getLogger, Logger } from '@logtape/logtape';
import {
    LockType,
    EscrowParameters,
    VestingParameters,
    Lock,
    NodeStakingLock,
    AccountBreakdown
} from '@cmts-dev/carmentis-sdk/server'

/**
 * This class models the availability of tokens for a given account.
 *
 * It keeps track of the balance, the locks (escrow, vesting and staking) and provides methods to add, remove and query tokens.
 */
export class BalanceAvailability {
    private readonly logger: Logger;

    /**
     * The balance of the account.
     * @private
     */
    private balanceInAtomics: number;

    /**
     * The set of locks on the account.
     * @private
     */
    private locks: Lock[];


    /**
     * By default, the balance is 0 and there are no locks.
     */
    constructor(private initialBalance: number = 0, private initialLocks: Lock[] = []) {
        this.balanceInAtomics = initialBalance;
        this.locks = initialLocks;
        this.logger = getLogger([ 'node', 'accounts', BalanceAvailability.name ])
    }

    /**
     * Getters and setters for balance and locks.
     */
    setBalance(balance: number) {
        this.balanceInAtomics = balance;
    }

    getBalanceAsAtomics() {
        return this.balanceInAtomics;
    }

    getBalance() {
        return CMTSToken.createAtomic(this.balanceInAtomics);
    }

    setLocks(locks: Lock[]) {
        this.locks = [...locks];
    }

    getLocks() {
        return this.locks;
    }

    hasNodeStakingLocks() {
        return this.locks.some((lock) => lock.type == LockType.NodeStaking);
    }

    getNodeStakingLocks() {
        return this.locks.filter((lock) => lock.type == LockType.NodeStaking);
    }

    getNodeStakingLock(nodeAccountId: Uint8Array) {
        const nodeStakingLocks = this.getNodeStakingLocks();
        const lock = nodeStakingLocks.find((lock) =>
            Utils.binaryIsEqual(lock.parameters.validatorNodeAccountId, nodeAccountId)
        );
        return lock;
    }

    getNodeStakingLockAmount(nodeAccountId: Uint8Array) {
        const lock = this.getNodeStakingLock(nodeAccountId);
        if (lock === undefined) {
            return 0;
        }
        return lock.lockedAmountInAtomics;
    }

    hasEscrowLocks() {
        return this.locks.some((lock) => lock.type == LockType.Escrow);
    }

    getEscrowLocks() {
        return this.locks.filter((lock) => lock.type == LockType.Escrow);
    }

    hasVestingLocks() {
        return this.locks.some((lock) => lock.type == LockType.Vesting);
    }

    getVestingLocks() {
        return this.locks.filter((lock) => lock.type == LockType.Vesting);
    }

    /**
     * Methods to remove expired locks (i.e. with a locked amount set to 0)
     */
    private removeExpiredEscrowLocks() {
        this.removeExpiredLocks(LockType.Escrow);
    }

    private removeExpiredVestingLocks() {
        this.removeExpiredLocks(LockType.Vesting);
    }

    private removeExpiredStakingLocks() {
        this.removeExpiredLocks(LockType.NodeStaking);
    }

    private removeExpiredLocks(type: number) {
        this.locks = this.locks.filter((lock) => !(lock.type == type && lock.lockedAmountInAtomics == 0));
    }

    /**
     * Adds a given amount of spendable tokens.
     */
    addSpendableTokens(amountInAtomics: number) {
        this.balanceInAtomics += amountInAtomics;
    }

    /**
     * Adds vested tokens, given an amount, a start time as a timestamp in seconds, a cliff duration in days and a vesting duration in days.
     */
    addVestedTokens(initialVestedAmountInAtomics: number, vestingParameters: VestingParameters) {
        // Vested tokens are assumed to be received by this account.
        // Since there are vested, there are not available (directly) but accounted in the balance.
        this.balanceInAtomics += initialVestedAmountInAtomics;

        this.locks.push({
            type: LockType.Vesting,
            lockedAmountInAtomics: initialVestedAmountInAtomics,
            parameters: vestingParameters
        });
    }

    /**
     * Adds escrowed tokens, given an amount, an escrow identifier and an agent public key.
     */
    addEscrowedTokens(lockedAmountInAtomics: number, escrowParameters: EscrowParameters) {
        // Escrowed tokens are assumed to be received by this account.
        // Since there are escrows, there are not available but accounted in the balance.
        this.balanceInAtomics += lockedAmountInAtomics;

        this.locks.push({
            type: LockType.Escrow,
            lockedAmountInAtomics: lockedAmountInAtomics,
            parameters: escrowParameters
        });
    }

    /**
     * Releases escrowed tokens by giving the signature of the agent.
     */
    releaseEscrowedTokens(fundEmitterAccountId: Uint8Array, transferAuthorizerSignature: Uint8Array) {
        const lockIndex = this.locks.findIndex((lock) =>
            lock.type == LockType.Escrow &&
            Utils.binaryIsEqual(lock.parameters.fundEmitterAccountId, fundEmitterAccountId)
        );

        if(lockIndex == -1) {
            throw new Error(`Escrow not found`);
        }

        // TODO: check signature

        this.locks.splice(lockIndex, 1);
    }

    /**
     * Stakes a given amount of tokens for a given node.
     * If a staking is already defined for this node, the new amount is added to the current staked amount.
     */
    addNodeStaking(amountInAtomics: number, nodeAccountId: Uint8Array) {
        // we must ensure the node has enough stakeable tokens to stake the requested amount
        const breakdown = this.getBreakdown();
        if (amountInAtomics < 0) {
            throw new Error(`Stake amount must be greater than 0`);
        }
        if (amountInAtomics > breakdown.stakeable) {
            throw new Error(`Cannot stake more than ${breakdown.stakeable} atomic units`);
        }

        const existingLock = this.getNodeStakingLock(nodeAccountId);

        if(existingLock === undefined) {
            this.locks.push({
                type: LockType.NodeStaking,
                lockedAmountInAtomics: amountInAtomics,
                parameters: {
                    validatorNodeAccountId: nodeAccountId,
                    plannedUnlockAmountInAtomics: 0,
                    plannedUnlockTimestamp: 0,
                }
            });
        }
        else {
            existingLock.lockedAmountInAtomics += amountInAtomics;
        }
    }

    /**
     * Sets a plan to unlock staked tokens for a given node.
     */
    planNodeStakingUnlock(plannedUnlockAmountInAtomics: number, plannedUnlockTimestamp: number, nodeAccountId: Uint8Array) {
        const existingLock = this.getNodeStakingLock(nodeAccountId);

        if(existingLock === undefined) {
            throw new Error(`Staking not found`);
        }
        if(existingLock.parameters.plannedUnlockAmountInAtomics != 0) {
            throw new Error(`There's already a pending staking unlock for this node`);
        }
        existingLock.parameters.plannedUnlockAmountInAtomics = plannedUnlockAmountInAtomics;
        existingLock.parameters.plannedUnlockTimestamp = Utils.addDaysToTimestamp(plannedUnlockTimestamp, 0);
    }

    /**
     * Applies node staking unlocks for which the planned date has been reached (or exceeded).
     */
    applyNodeStakingUnlocks(referenceTimestamp: number) {
        const nodeStakingLocks = this.getNodeStakingLocks();

        for(const lock of nodeStakingLocks) {
            if(lock.parameters.plannedUnlockTimestamp != 0 && referenceTimestamp >= lock.parameters.plannedUnlockTimestamp) {
                this.removeNodeStaking(
                    lock.parameters.plannedUnlockAmountInAtomics,
                    lock.parameters.validatorNodeAccountId
                );
            }
        }
        this.removeExpiredStakingLocks();
    }

    /**
     * Unstakes tokens for a given node.
     */
    removeNodeStaking(amountInAtomics: number, nodeAccountId: Uint8Array) {
        const lock = this.getNodeStakingLock(nodeAccountId);

        if (lock === undefined) {
            throw new Error(`Staking not found`);
        }
        if (amountInAtomics < 0) {
            throw new Error(`Unstake amount must be greater than 0`);
        }
        if (amountInAtomics > lock.lockedAmountInAtomics) {
            throw new Error(`Cannot unstake more than ${lock.lockedAmountInAtomics} atomic units`);
        }

        lock.lockedAmountInAtomics -= amountInAtomics;
    }

    /**
     * Releases all vesting tokens that should be unlocked as of the given time.
     *
     * This applies the full vesting schedule up to `time`, including any tokens
     * that would have been released earlier but could not be (typically because
     * they were temporarily locked by staking or other constraints).
     *
     * Each vesting lock is updated independently, but release is capped by the
     * globally releasable amount for this account at the current time.
     *
     * Returns the total released amount.
     */
    applyLinearVesting(referenceTimestamp: number) {
        const breakdown = this.getBreakdown();
        let releasable = breakdown.releasable;
        let totalReleased = 0;

        const vestingLocks = this.getVestingLocks();

        for(const lock of vestingLocks) {
            const initialVestedAmountInAtomics = lock.parameters.initialVestedAmountInAtomics;
            const cliffStartTimestamp = lock.parameters.cliffStartTimestamp;
            const cliffDurationDays = lock.parameters.cliffDurationDays;
            const vestingDurationDays = lock.parameters.vestingDurationDays;
            const cliffEndTimestamp = Utils.addDaysToTimestamp(cliffStartTimestamp, cliffDurationDays);

            const elapsed = Math.min(
                Utils.timestampDifferenceInDays(cliffEndTimestamp, referenceTimestamp),
                vestingDurationDays
            );

            this.logger.debug(
                `start date: {cliffStartDate}, initial amount: {initialAmount}, cliff during {cliffDurationDays} day(s), vesting during {vestingDurationDays} day(s)`, () => ({
                    cliffStartDate: new Date(cliffStartTimestamp * 1000).toISOString(),
                    initialAmount: initialVestedAmountInAtomics,
                    cliffDurationDays,
                    vestingDurationDays
                })
            );

            this.logger.debug(
                `cliff end date: {cliffEndDay}, today: {today}, elapsed time in vesting: {elapsed} day(s)`, () => ({
                    cliffEndDay: new Date(cliffEndTimestamp * 1000).toISOString(),
                    today: new Date(referenceTimestamp * 1000).toISOString(),
                    elapsed
                })
            );

            if(elapsed > 0) {
                const alreadyReleased = initialVestedAmountInAtomics - lock.lockedAmountInAtomics;
                const maximumRelease = Math.floor(initialVestedAmountInAtomics * elapsed / vestingDurationDays);
                const released = Math.min(maximumRelease - alreadyReleased, releasable);

                this.logger.debug(`already released: ${alreadyReleased}, max. release: ${maximumRelease}, released today: ${released}`);

                lock.lockedAmountInAtomics -= released;
                releasable -= released;
                totalReleased += released;
            }
            else {
                this.logger.debug(`nothing is released today`);
            }
        }
        this.removeExpiredVestingLocks();

        return totalReleased;
    }

    /**
     * Returns the breakdown of the account balance.
     */
    getBreakdown(): AccountBreakdown {
        // compute for each type of lock the amount of locked tokens
        const lockedAmountInAtomicsByLockType = new Map<LockType, number>(); //Array(LOCK_TYPE_COUNT).fill(0);
        for(const lock of this.locks) {
            const lockedAmountForLockType = lockedAmountInAtomicsByLockType.get(lock.type) || 0;
            lockedAmountInAtomicsByLockType.set(lock.type, lockedAmountForLockType + lock.lockedAmountInAtomics);
        }

        // locked amounts
        const escrowed = lockedAmountInAtomicsByLockType.get(LockType.Escrow) || 0;
        const vested = lockedAmountInAtomicsByLockType.get(LockType.Vesting) || 0;
        const staked = lockedAmountInAtomicsByLockType.get(LockType.NodeStaking) || 0;

        // the amount of stakeable tokens is the balance, minus the amount of already staked tokens, minus
        // the amount of escrowed tokens
        const stakeable = this.balanceInAtomics - staked - escrowed;

        // the amount of releasable tokens by linear vesting is the amount of vested tokens, minus the amount
        // of staked tokens, or 0 if the difference is negative
        const releasable = Math.max(0, vested - staked);

        // the amount of locked tokens is the amount of escrowed tokens (which are always fully locked) plus
        // the amount of either vested or staked tokens, whichever is higher
        const locked = escrowed + Math.max(vested, staked);

        // the amount of spendable tokens is the balance, minus the amount of locked tokens
        const spendable = this.balanceInAtomics - locked;

        const res = {
            balance: this.balanceInAtomics,
            escrowed,
            vested,
            releasable,
            staked,
            stakeable,
            locked,
            spendable
        };
        return res;
    }

    getSpendable() {
        return CMTSToken.createAtomic(this.getBreakdown().spendable);
    }

    getVested() {
        return CMTSToken.createAtomic(this.getBreakdown().vested);
    }

    getStakeable() {
        return CMTSToken.createAtomic(this.getBreakdown().stakeable);
    }

    getStaked() {
        return CMTSToken.createAtomic(this.getBreakdown().staked);
    }
}
