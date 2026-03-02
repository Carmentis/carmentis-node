import {
    CryptoEncoderFactory,
    FeesCalculationFormulaFactory,
    Microblock,
    ProviderFactory,
    Secp256k1PrivateSignatureKey,
    SectionType,
} from '@cmts-dev/carmentis-sdk/server';

describe('CometBFT', () => {
    it('Should create an account for a randomly chosen key, signed with key having tokens', async () => {
        const encoder = CryptoEncoderFactory.defaultStringSignatureEncoder();
        const privateKeyHavingTokens = await encoder.decodePrivateKey(
            'SIG:SECP256K1:SK{f86ce9df7bcdf880a649fe2e177052fbe289226630d2dfbbac80f068ada6c5a9}',
        );
        const provider = ProviderFactory.createInMemoryProviderWithExternalProvider("http://localhost:26657");
        const accountIdHavingTokens = await provider.getAccountIdByPublicKey(await privateKeyHavingTokens.getPublicKey())

        const randomPrivateKey = Secp256k1PrivateSignatureKey.gen();
        const randomPublicKey = await randomPrivateKey.getPublicKey();



        const accountCreationMb = Microblock.createGenesisAccountMicroblock();
        accountCreationMb.addSections([
            {
                type: SectionType.ACCOUNT_PUBLIC_KEY,
                schemeId: randomPublicKey.getSignatureSchemeId(),
                publicKey: await randomPublicKey.getPublicKeyAsBytes()
            },
            {
                type: SectionType.ACCOUNT_CREATION,
                sellerAccount: accountIdHavingTokens,
                amount: 0
            },
        ]);

        // compute the fees
        const protocolVariables = await provider.getProtocolState();
        const feesCalculationVersion = protocolVariables.getFeesCalculationVersion();
        const feesFormula =
            FeesCalculationFormulaFactory.getFeesCalculationFormulaByVersion(
                provider,
                feesCalculationVersion,
            );
        const fees = await feesFormula.computeFees(
            privateKeyHavingTokens.getSignatureSchemeId(),
            accountCreationMb,
            0,
            Math.floor(Date.now() / 1000),
        );
        console.log(`Fees: ${fees.toString()}`)
        accountCreationMb.setMaxFees(fees);
        await accountCreationMb.seal(privateKeyHavingTokens, {
            feesPayerAccount: accountIdHavingTokens,
        });
        await provider.publishMicroblock(accountCreationMb);
    });
});