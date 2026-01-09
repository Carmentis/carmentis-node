import {
    Secp256k1PrivateSignatureKey,
    Microblock,
    SectionType,
} from '@cmts-dev/carmentis-sdk/server';

async function run() {
    const sk = Secp256k1PrivateSignatureKey.gen();
    const pk = await sk.getPublicKey();
    const mb = Microblock.createGenesisAccountMicroblock();
    mb.addSections([
        {
            type: SectionType.ACCOUNT_PUBLIC_KEY,
            schemeId: pk.getSignatureSchemeId(),
            publicKey: await pk.getPublicKeyAsBytes()
        },
        {
            type: SectionType.ACCOUNT_CREATION,
            sellerAccount: sellerAccountId.toBytes(),
            amount: 10
        },
    ])
    mb.setFeesPayerAccount(sellerAccountId.toBytes());
    mb.setTimestamp(getTimestampInSecondsFromString("2026/01/02 00:00"))
    mb.setGas(await feesFormula.computeFees(sellerSk.getSignatureSchemeId(), mb))
    await mb.seal(sellerSk);
}

async function getProtocolVariables() {
    const protocolParams = await provider.getProtocolVariables();
    const parseResult = v.safeParse(ProtocolVariablesSchema, protocolParams.getProtocolVariables());
    return protocolParams.getProtocolVariables()
}

function getTimestampInSecondsFromString(str: string): number {
    return Math.floor(Date.parse(str) / 1000);
}
