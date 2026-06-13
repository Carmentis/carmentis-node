export class FeesDispatcher {
    constructor(private feesToDispatch: number, private validatorPowers: number[], private blockHeight: number) {
    }

    dispatch(): number[] {
        const feesInAtomics = this.feesToDispatch;
        const nValidators = this.validatorPowers.length;
        const totalValidationPowers = this.validatorPowers.reduce((acc, power) => acc + power, 0);

        const result: number[] = [];
        let distributedFees = 0;

        // Distribute fees proportionally based on validator power
        for (const power of this.validatorPowers) {
            const validatorShare = Math.floor((feesInAtomics * power) / totalValidationPowers);
            result.push(Number.isNaN(validatorShare) ? 0 : validatorShare);
            distributedFees += validatorShare;
        }

        // Distribute remaining fees one by one, using height for deterministic distribution
        const remainingFees = feesInAtomics - distributedFees;
        for (let i = 0; i < remainingFees; i++) {
            const index = (this.blockHeight + i) % nValidators;
            result[index] = result[index] + 1;
        }

        return result;
    }
}