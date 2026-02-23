
import { CMTSToken } from "@cmts-dev/carmentis-sdk/server";
import { StoragePriceManager } from './storagePriceManager';

describe("storage price manager", () => {
    it("Should compute correct prices", () => {
        const priceStructure = [
            { pricingRate: 100, maximumNumberOfDays: 7 },
            { pricingRate: 90, maximumNumberOfDays: 30 },
            { pricingRate: 75, maximumNumberOfDays: 90 },
            { pricingRate: 60, maximumNumberOfDays: 365 },
        ];

        const storagePriceManager = new StoragePriceManager(priceStructure);

        const tests = [
            [   6,  6 * 100000 ],
            [   7,  7 * 100000 ],
            [  29,  7 * 100000 + 22 * 90000 ],
            [  30,  7 * 100000 + 23 * 90000 ],
            [  31,  7 * 100000 + 23 * 90000 + 1 * 75000 ],
            [  90,  7 * 100000 + 23 * 90000 + 60 * 75000 ],
            [ 100,  7 * 100000 + 23 * 90000 + 60 * 75000 + 10 * 60000 ],
            [ 365,  7 * 100000 + 23 * 90000 + 60 * 75000 + 275 * 60000 ],
            [ 400,  7 * 100000 + 23 * 90000 + 60 * 75000 + 275 * 60000 ],
        ];

        tests.forEach(([ days, expectedPriceInAtomics ]) => {
            const baseFee = CMTSToken.createCMTS(1);
            const computedPrice = storagePriceManager.getStoragePrice(baseFee, days);
            const computedPriceInAtomics = computedPrice.getAmountAsAtomic();

            console.log(days, storagePriceManager.getBreakdown(baseFee, days));
            console.log(days, computedPriceInAtomics);
            expect(computedPriceInAtomics).toEqual(expectedPriceInAtomics);
        });
    })
})
