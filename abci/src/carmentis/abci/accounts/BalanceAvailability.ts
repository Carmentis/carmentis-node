import { Utils } from '@cmts-dev/carmentis-sdk/server';
import {
    LOCK_TYPE_COUNT,
    LockType,
    EscrowParameters,
    VestingParameters,
    Lock,
    AccountBreakdown
} from '@cmts-dev/carmentis-sdk/server'

/**
 * This class models the availability of tokens for a given account.
 *
 * It keeps track of the balance, the locks (escrow, vesting and staking) and provides methods to add, remove and query tokens.
 */
export class BalanceAvailability {

    /**
     * The balance of the account.
     * @private
     */
    private balance: number;

    /**
     * The set of locks on the account.
     * @private
     */
    private locks: Lock[];


    /**
     * By default, the balance is 0 and there are no locks.
     */
    constructor(private initialBalance: number = 0, private initialLocks: Lock[] = []) {
        this.balance = initialBalance;
        this.locks = initialLocks;
    }

    /**
     * Getters and setters for balance and locks.
     */
    setBalance(balance: number) {
        this.balance = balance;
    }

    getBalance() {
        return this.balance;
    }

    setLocks(locks: Lock[]) {
        this.locks = [...locks];
    }

    getLocks() {
        return this.locks;
    }


    getNodeStakingLocks() {
        return this.locks.filter((lock) => lock.type == LockType.NodeStaking);
    }

    getEscrowLocks() {
        return this.locks.filter((lock) => lock.type == LockType.Escrow);
    }

    getVestingLocks() {
        return this.locks.filter((lock) => lock.type == LockType.Vesting);
    }

    /**
     * Adds a given amount of spendable tokens.
     */
    addSpendableTokens(amount: number) {
        this.balance += amount;
    }

    /**
     * Adds vested tokens, given an amount, a start time as a timestamp in seconds, a cliff duration in days and a vesting duration in days.
     */
    addVestedTokens(initialVestedAmountInAtomics: number, cliffStartTimestamp: number, cliffDurationDays: number, vestingDurationDays: number) {
        this.balance += initialVestedAmountInAtomics;

        this.locks.push({
            type: LockType.Vesting,
            lockedAmountInAtomics: initialVestedAmountInAtomics,
            parameters: {
                initialVestedAmountInAtomics: initialVestedAmountInAtomics,
                cliffStartTimestamp,
                cliffDurationDays,
                vestingDurationDays
            }
        });
    }

    /**
     * Adds escrowed tokens, given an amount, an escrow identifier and an agent public key.
     */
    addEscrowedTokens(lockedAmountInAtomics: number, escrowIdentifier: Uint8Array, transferAuthorizerAccountId: Uint8Array) {
        this.balance += lockedAmountInAtomics;

        this.locks.push({
            type: LockType.Escrow,
            lockedAmountInAtomics: lockedAmountInAtomics,
            parameters: {
                fundEmitterAccountId: escrowIdentifier,
                transferAuthorizerAccountId: transferAuthorizerAccountId
            }
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
     * Stakes a given amount of tokens for a given object identified by a type and an identifier.
     */
    addNodeStaking(amountInAtomics: number, nodeAccountId: Uint8Array) {
        // we must ensure the node has enough stakeable tokens to stake the requested amount
        const breakdown = this.getBreakdown();
        if (amountInAtomics > breakdown.stakeable) {
            throw new Error(`Cannot stake more than ${breakdown.stakeable} tokens`);
        }

        // add the stake lock to the account
        this.locks.push({
            type: LockType.NodeStaking,
            lockedAmountInAtomics: amountInAtomics,
            parameters: {
               validatorNodeAccountId: nodeAccountId,
            }
        });
    }

    /**
     * Unstakes tokens for a given object.
     */
    removeNodeStaking(nodeAccountId: Uint8Array) {
        const lockIndex = this.locks.findIndex((lock) =>
            lock.type == LockType.NodeStaking &&
            Utils.binaryIsEqual(lock.parameters.validatorNodeAccountId, nodeAccountId)
        );

        if (lockIndex == -1) {
            throw new Error(`Staking not found`);
        }

        this.locks.splice(lockIndex, 1);
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

        //const vestingLocks = this.locks.filter((lock) => lock.type == LockType.Vesting);
        const vestingLocks = this.getVestingLocks();
        for(const lock of vestingLocks) {
            const initialVestedAmountInAtomics = lock.parameters.initialVestedAmountInAtomics;
            const cliffStartTimestamp = lock.parameters.cliffStartTimestamp;
            const cliffDurationDays = lock.parameters.cliffDurationDays;
            const vestingDurationDays = lock.parameters.vestingDurationDays;
            const cliffTimestamp = Utils.addDaysToTimestamp(cliffStartTimestamp, cliffDurationDays);

            const elapsed = Math.min(
                Utils.timestampDifferenceInDays(cliffTimestamp, referenceTimestamp),
                vestingDurationDays
            );

            if(elapsed > 0) {
                const alreadyReleased = initialVestedAmountInAtomics - lock.lockedAmountInAtomics;
                const maximumRelease = Math.floor(initialVestedAmountInAtomics * elapsed / vestingDurationDays);
                const released = Math.min(maximumRelease - alreadyReleased, releasable);

                lock.lockedAmountInAtomics -= released;
                releasable -= released;
                totalReleased += released;
            }
        }
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
        const escrowed = lockedAmountInAtomicsByLockType.get(LockType.Escrow);
        const vested = lockedAmountInAtomicsByLockType.get(LockType.Vesting);
        const staked = lockedAmountInAtomicsByLockType.get(LockType.NodeStaking);


        // the amount of stakeable tokens is the balance, minus the amount of already staked tokens, minus
        // the amount of escrowed tokens
        const stakeable = this.balance - staked - escrowed;

        // the amount of releasable tokens by linear vesting is the amount of vested tokens, minus the amount
        // of staked tokens, or 0 if the difference is negative
        const releasable = Math.max(0, vested - staked);

        // the amount of locked tokens is the amount of escrowed tokens (which are always fully locked) plus
        // the amount of either vested or staked tokens, whichever is higher
        const locked = escrowed + Math.max(vested, staked);

        // the amount of spendable tokens is the balance, minus the amount of locked tokens
        const spendable = this.balance - locked;

        return {
            balance: this.balance,
            escrowed,
            vested,
            releasable,
            staked,
            stakeable,
            locked,
            spendable
        };
    }
}
