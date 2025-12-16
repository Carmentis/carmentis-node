import { BalanceAvailability } from '../abci/accounts/BalanceAvailability';
import { CMTSToken } from '@cmts-dev/carmentis-sdk/server';
import { randomBytes } from 'node:crypto';

describe("Balance availability", () => {

    function assertBalance(balanceAvailability: BalanceAvailability, expectedBalance: CMTSToken) {
        expect(balanceAvailability.getBalanceAsAtomics()).toEqual(expectedBalance.getAmountAsAtomic());
    }

    function assertSpendable(balanceAvailability: BalanceAvailability, expectedSpendable: CMTSToken) {
        expect(balanceAvailability.getSpendable().getAmountAsAtomic()).toEqual(expectedSpendable.getAmountAsAtomic());
    }

    function assertVested(balanceAvailability: BalanceAvailability, expectedVested: CMTSToken) {
        expect(balanceAvailability.getVested().getAmountAsAtomic()).toEqual(expectedVested.getAmountAsAtomic());
    }

    function assertStakable(balanceAvailability: BalanceAvailability, expectedStakable: CMTSToken) {
        expect(balanceAvailability.getStakeable().getAmountAsAtomic()).toEqual(expectedStakable.getAmountAsAtomic());
    }

    function assertStaked(balanceAvailability: BalanceAvailability, expectedStaked: CMTSToken) {
        expect(balanceAvailability.getStaked().getAmountAsAtomic()).toEqual(expectedStaked.getAmountAsAtomic());
    }



    function randomAccountId() {
        return randomBytes(32);
    }

    it("Should correctly compute the balance and locks", async () => {
        const balanceAvailability = new BalanceAvailability(0);


        // add spendable tokens
        let spendableTokens = CMTSToken.createCMTS(100);
        balanceAvailability.addSpendableTokens(spendableTokens.getAmountAsAtomic());
        assertSpendable(balanceAvailability, spendableTokens);
        assertVested(balanceAvailability, CMTSToken.zero());

        // add a node stake
        const amountToStake = CMTSToken.createCMTS(10);
        spendableTokens = spendableTokens.sub(amountToStake);
        const dummyAccountId = randomAccountId();
        balanceAvailability.addNodeStaking(amountToStake.getAmountAsAtomic(), dummyAccountId);
        assertSpendable(balanceAvailability, spendableTokens)
        assertStaked(balanceAvailability, amountToStake)
        assertVested(balanceAvailability, CMTSToken.zero());

        // add a second stake
        const amountToStake2 = CMTSToken.createCMTS(10);
        spendableTokens = spendableTokens.sub(amountToStake2);
        balanceAvailability.addNodeStaking(amountToStake2.getAmountAsAtomic(), dummyAccountId);
        assertSpendable(balanceAvailability, spendableTokens);
        assertStaked(balanceAvailability, amountToStake.add(amountToStake2));
        assertVested(balanceAvailability, CMTSToken.zero());

        // add a vesting
        const amountToVest = CMTSToken.createCMTS(20);
        // a vested token can still be staked, but not spendable
        //spendableTokens = spendableTokens.sub(amountToVest);
        const cliffStartTimestamp = 1000;
        const cliffDuration = 100;
        const vestingDuration = 10;
        balanceAvailability.addVestedTokens(
            amountToVest.getAmountAsAtomic(),
            cliffStartTimestamp,
            cliffDuration,
            vestingDuration,
        );
        assertVested(balanceAvailability, amountToVest);
        assertSpendable(balanceAvailability, spendableTokens);
    })
})