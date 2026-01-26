import { FeesDispatcher } from './FeesDispatcher';

describe("fees dispatch", () => {

    function testFeesDispatch(feesToDispatchInAtomic: number, powers: number[], dispatchedFeesInAtomics: number[], blockHeight: number = 1) {
        const fees = feesToDispatchInAtomic;
        const dispatchedFees = new FeesDispatcher(fees, powers, blockHeight).dispatch();
        for (let i = 0; i < dispatchedFeesInAtomics.length; i++) {
            expect(dispatchedFees[i]).toEqual(dispatchedFeesInAtomics[i]);
        }
    }

    function dispatchFeesInAtomics(feesToDispatchInAtomic: number, powers: number[], blockHeight: number = 1) {
        const fees = feesToDispatchInAtomic;
        return new FeesDispatcher(fees, powers, blockHeight)
            .dispatch()
            .map((fee) => fee);
    }


    it("Should dispath all fees", () => {
        testFeesDispatch(10000, [100, 0], [10000, 0]);
    })

    it('Should dispath all fees', () => {
        testFeesDispatch(10000, [50, 50], [5000, 5000]);
    });

    it('Should dispath all fees', () => {
        testFeesDispatch(1023, [50, 50], [512, 511], 0);
        testFeesDispatch(1023, [50, 50], [511, 512], 1)
    });

    it('Should dispatch zero fees across validators', () => {
        testFeesDispatch(0, [1, 2, 3], [0, 0, 0]);
    });

    it('Should dispatch all fees to a single validator', () => {
        testFeesDispatch(12345, [99], [12345]);
    });

    it('Should split fees by 1:2:3 power ratio', () => {
        testFeesDispatch(120, [1, 2, 3], [20, 40, 60]);
    });

    it('Should distribute remainder starting at block height', () => {
        testFeesDispatch(5, [1, 1, 1], [2, 2, 1], 0);
    });

    it('Should wrap remainder distribution across validators', () => {
        testFeesDispatch(5, [1, 1, 1], [2, 1, 2], 2);
    });

    it('Should handle zero-power validators with remainder', () => {
        testFeesDispatch(100, [0, 0, 10], [0, 0, 100], 1);
    });


    it('Should handle zero-fees', () => {
        testFeesDispatch(0, [0, 0, 0], [0, 0, 0], 1);
        testFeesDispatch(0, [10, 1, 10], [0, 0, 0], 1);
        testFeesDispatch(0, [10, 0, 10], [0, 0, 0], 1);
    });

    it('Should handle fees less than number of validators', () => {
        testFeesDispatch(2, [5, 5, 5, 5], [1, 1, 0, 0], 0);
        testFeesDispatch(2, [5, 5, 5, 5], [0, 1, 1, 0], 1);
        testFeesDispatch(2, [5, 5, 5, 5], [0, 0, 1, 1], 2);
        testFeesDispatch(2, [5, 5, 5, 5], [1, 0, 0, 1], 3);
    });

    it('Should handle large block height when distributing remainder', () => {
        testFeesDispatch(11, [1, 1], [5, 6], 999);
    });

    it('Should preserve total fees after dispatch', () => {
        const feesToDispatchInAtomic = 1234;
        const dispatched = dispatchFeesInAtomics(feesToDispatchInAtomic, [10, 20, 30, 40], 3);
        const totalDispatched = dispatched.reduce((acc, fee) => acc + fee, 0);
        expect(totalDispatched).toBe(feesToDispatchInAtomic);
    });

    it('Should distribute remainder with uneven powers', () => {
        testFeesDispatch(101, [2, 3], [41, 60], 0);
    });

    it('Should fuzz fee dispatch invariants across many cases', () => {
        let seed = 1337;
        const random = () => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed;
        };
        const randomInRange = (min: number, max: number) => min + (random() % (max - min + 1));

        for (let i = 0; i < 100000; i++) {
            const nValidators = randomInRange(1, 30);
            const powers = Array.from({ length: nValidators }, () => randomInRange(1_000_000, 10_000_000));
            const totalPower = powers.reduce((acc, power) => acc + power, 0);
            const feesToDispatchInAtomic = randomInRange(1, 10000000);
            const blockHeight = random();

            // Calculate expected distribution
            const expected: number[] = [];
            let distributedFees = 0;

            // Proportional distribution
            for (const power of powers) {
                const validatorShare = Math.floor((feesToDispatchInAtomic * power) / totalPower);
                expected.push(validatorShare);
                distributedFees += validatorShare;
            }

            // Distribute remainder
            const remainingFees = feesToDispatchInAtomic - distributedFees;
            for (let r = 0; r < remainingFees; r++) {
                const index = (blockHeight + r) % nValidators;
                expected[index] += 1;
            }

            const dispatched = dispatchFeesInAtomics(feesToDispatchInAtomic, powers, blockHeight);
            expect(dispatched).toEqual(expected);
            expect(dispatched.every((fee) => Number.isInteger(fee))).toBe(true);
            const totalDispatched = dispatched.reduce((acc, fee) => acc + fee, 0);
            expect(totalDispatched).toBe(feesToDispatchInAtomic);
        }
    });

})
