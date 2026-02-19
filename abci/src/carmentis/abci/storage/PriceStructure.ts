import { CMTSToken } from "@cmts-dev/carmentis-sdk/server";

export type PriceCategory = {
    pricingRate: number,
    maximumNumberOfDays: number,
}

export type PriceStructure = PriceCategory[];

export type PriceBreakdown = {
    numberOfDays: number,
    pricingRate: number,
    price: CMTSToken,
}
