import { CMTSToken, PriceStructure, PriceBreakdown } from "@cmts-dev/carmentis-sdk/server";

const SECONDS_IN_DAY = 86400;

export class StoragePriceManager {
    constructor(private readonly priceStructure: PriceStructure) {
        // make sure that the price categories are sorted from lowest to highest number of days
        this.priceStructure.sort((a, b) => a.maximumNumberOfDays - b.maximumNumberOfDays);
    }

    getNumberOfDaysOfStorage(blockTimestamp: number, expirationDay: number) {
        if (expirationDay > 0) {
            return Math.max(1, Math.round((expirationDay - blockTimestamp) / SECONDS_IN_DAY));
        }
        // for endless storage, we pay for the highest number of days defined in the price structure
        return this.priceStructure[this.priceStructure.length - 1].maximumNumberOfDays;
    }

    getStoragePrice(basePrice: CMTSToken, numberOfDays: number) {
        const breakdown = this.getBreakdown(basePrice, numberOfDays);
        const priceInAtomics = breakdown.reduce((total, entry) => {
            return total + entry.priceInAtomics
        }, 0);
        return CMTSToken.createAtomic(priceInAtomics);
    }

    getBreakdown(basePrice: CMTSToken, numberOfDays: number): PriceBreakdown[] {
        const basePriceInAtomics = basePrice.getAmountAsAtomic();
        const breakdown = [];

        for (let index = 0, days = 0; days < numberOfDays; index++) {
            const category = this.priceStructure[index];
            let categoryDays: number;
            let pricingRate: number;

            if (category == undefined) {
                categoryDays = numberOfDays - days;
                pricingRate = 0;
            }
            else {
                categoryDays = Math.min(category.maximumNumberOfDays, numberOfDays) - days;
                pricingRate = category.pricingRate;
            }
            const priceInAtomics = Math.floor(basePriceInAtomics * categoryDays * pricingRate / 100);
            breakdown.push({
                numberOfDays: categoryDays,
                pricingRate,
                priceInAtomics,
            });
            days += categoryDays;
        }
        return breakdown;
    }
}
