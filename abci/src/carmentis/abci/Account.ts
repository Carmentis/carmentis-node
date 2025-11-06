import { Utils } from '@cmts-dev/carmentis-sdk/server';

const LOCK_TYPE_COUNT = 3;

enum LockType {
    Escrow = 0,
    Vesting = 1,
    Staking = 2
}

type EscrowParameters = {
    escrowIdentifier: Uint8Array,
    agentPublicKey: any
};

type VestingParameters = {
    initialAmount: number,
    startTime: number,
    cliffPeriod: number,
    vestingPeriod: number
};

type StakingParameters = {
    nodeIdentifier: Uint8Array
};

type Lock =
    | { type: LockType.Escrow, amount: number, parameters: EscrowParameters }
    | { type: LockType.Vesting, amount: number, parameters: VestingParameters }
    | { type: LockType.Staking, amount: number, parameters: StakingParameters };

export class Account {
    private balance: number;
    private locks: Lock[];

    constructor() {
        this.balance = 0;
        this.locks = [];
    }

    addSpendableTokens(amount: number) {
        this.balance += amount;
    }

    addVestedTokens(amount: number, startTime: number, cliffPeriod: number, vestingPeriod: number) {
        if(cliffPeriod < 0) {
            throw new Error(`The cliff period must greater than or equal to 0`);
        }
        if(vestingPeriod <= 0) {
            throw new Error(`The vesting period must greater than 0`);
        }

        this.balance += amount;

        this.locks.push({
            type: LockType.Vesting,
            amount,
            parameters: {
                initialAmount: amount,
                startTime,
                cliffPeriod,
                vestingPeriod
            }
        });
    }

    addEscrowedTokens(amount: number, escrowIdentifier: Uint8Array, agentPublicKey: any) {
        this.balance += amount;

        this.locks.push({
            type: LockType.Escrow,
            amount,
            parameters: {
                escrowIdentifier,
                agentPublicKey
            }
        });
    }

    releaseEscrowedTokens(escrowIdentifier: Uint8Array, agentSignature: any) {
        const lockIndex = this.locks.findIndex((lock) =>
            lock.type == LockType.Escrow &&
            Utils.binaryIsEqual(lock.parameters.escrowIdentifier, escrowIdentifier)
        );

        if(lockIndex == -1) {
            throw new Error(`Escrow not found`);
        }

        this.locks.splice(lockIndex, 1);
    }

    stake(amount: number, nodeIdentifier: Uint8Array) {
        const breakdown = this.getBreakdown();

        if(amount > breakdown.stakeable) {
            throw new Error(`Cannot stake more than ${breakdown.stakeable} tokens`);
        }

        this.locks.push({
            type: LockType.Staking,
            amount,
            parameters: {
                nodeIdentifier
            }
        });
    }

    unstake(nodeIdentifier: Uint8Array) {
        const lockIndex = this.locks.findIndex((lock) =>
            lock.type == LockType.Staking &&
            Utils.binaryIsEqual(lock.parameters.nodeIdentifier, nodeIdentifier)
        );

        if(lockIndex == -1) {
            throw new Error(`Staking not found`);
        }

        this.locks.splice(lockIndex, 1);
    }

    applyLinearVesting(time: number) {
        const breakdown = this.getBreakdown();
        let releasable = breakdown.releasable;

        const vestingLocks = this.locks.filter((lock) => lock.type == LockType.Vesting);

        for(const lock of vestingLocks) {
            const elapsed = Math.min(
                time - lock.parameters.startTime - lock.parameters.cliffPeriod,
                lock.parameters.vestingPeriod
            );

            if(elapsed > 0) {
                const alreadyReleased = lock.parameters.initialAmount - lock.amount;
                const maximumRelease = Math.floor(lock.parameters.initialAmount * elapsed / lock.parameters.vestingPeriod);
                const released = Math.min(maximumRelease - alreadyReleased, releasable);

                lock.amount -= released;
                releasable -= released;
            }
        }
    }

    getBreakdown() {
        const balance = this.balance;
        const lockedAmounts = Array(LOCK_TYPE_COUNT).fill(0);

        for(const lock of this.locks) {
            lockedAmounts[lock.type] += lock.amount;
        }

        // locked amounts
        const escrowed = lockedAmounts[LockType.Escrow];
        const vested = lockedAmounts[LockType.Vesting];
        const staked = lockedAmounts[LockType.Staking];

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
        const spendable = balance - locked;

        return {
            balance,
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
