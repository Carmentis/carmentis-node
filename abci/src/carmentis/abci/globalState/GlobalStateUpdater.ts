import { Context } from '../types/Context';
import {
    AccountVb,
    Base64,
    ECO,
    Microblock,
    SectionType,
    VirtualBlockchain,
} from '@cmts-dev/carmentis-sdk/server';
import { CometBFTPublicKeyConverter } from '../CometBFTPublicKeyConverter';
import { NODE_SCHEMAS } from '../constants/constants';
import { Logger } from '@nestjs/common';
import { Transfer } from '../AccountManager';

const KEY_TYPE_MAPPING = {
    'tendermint/PubKeyEd25519': 'ed25519',
};

export class GlobalStateUpdater {
    static createUpdater() {
        return new GlobalStateUpdater();
    }

    private logger = new Logger(GlobalStateUpdater.name);

    async updateGlobalState(
        context: Context,
        virtualBlockchain: VirtualBlockchain,
        microblock: Microblock,
    ) {

        if (virtualBlockchain instanceof AccountVb) {
            await this.handleAccountUpdate(context, virtualBlockchain, microblock);
        }
        //await context.accountManager.testPublicKeyAvailability(rawPublicKey);

    }

    private async handleAccountUpdate(context: Context, accountVb: AccountVb, microblock: Microblock): Promise<void> {
        // check the token issuance
        const hasTokenIssuanceSection = microblock.hasSection(SectionType.ACCOUNT_TOKEN_ISSUANCE);
        if (hasTokenIssuanceSection) {
            // recover the public key defined in the account
            const issuerPublicKey = await accountVb.getPublicKey();

            // we ensure the public key is available, otherwise raise an exception (implicit)
            await context.accountManager.testPublicKeyAvailability(
                issuerPublicKey.getPublicKeyAsBytes(),
            );

            // we now perform the token transfer ex nihilo
            const tokenIssuanceSection = microblock.getAccountTokenIssuanceSection();
            const { amount } = tokenIssuanceSection.object;
            const tokenTranser: Transfer = {
                type: ECO.BK_SENT_ISSUANCE,
                payerAccount: null,
                payeeAccount: accountVb.getId(),
                amount,
            };
            await context.accountManager.tokenTransfer(
                tokenTranser,
                {
                    mbHash: microblock.getHash(),
                    //sectionIndex: context.section.index,
                },
                microblock.getTimestamp() //context.timestamp,
            );

            await context.accountManager.saveAccountByPublicKey(
                accountVb.getId(),
                issuerPublicKey.getPublicKeyAsBytes(),
            );
        }
    }

    /**
     Account callbacks
     */
    async accountTokenIssuanceCallback(context: any) {
        const rawPublicKey = await context.vb.getPublicKey();
        await context.cache.accountManager.testPublicKeyAvailability(rawPublicKey);

        await context.cache.accountManager.tokenTransfer(
            {
                type: ECO.BK_SENT_ISSUANCE,
                payerAccount: null,
                payeeAccount: context.vb.identifier,
                amount: context.section.object.amount,
            },
            {
                mbHash: context.mb.hash,
                sectionIndex: context.section.index,
            },
            context.timestamp,
        );

        await context.cache.accountManager.saveAccountByPublicKey(
            context.vb.identifier,
            rawPublicKey,
        );
    }

    async accountCreationCallback(context: any) {
        const rawPublicKey = await context.vb.getPublicKey();
        await context.cache.accountManager.testPublicKeyAvailability(rawPublicKey);

        await context.cache.accountManager.tokenTransfer(
            {
                type: ECO.BK_SALE,
                payerAccount: context.section.object.sellerAccount,
                payeeAccount: context.vb.identifier,
                amount: context.section.object.amount,
            },
            {
                mbHash: context.mb.hash,
                sectionIndex: context.section.index,
            },
            context.timestamp,
        );

        await context.cache.accountManager.saveAccountByPublicKey(
            context.vb.identifier,
            rawPublicKey,
        );
    }

    async accountTokenTransferCallback(context: any) {
        await context.cache.accountManager.tokenTransfer(
            {
                type: ECO.BK_SENT_PAYMENT,
                payerAccount: context.vb.identifier,
                payeeAccount: context.section.object.account,
                amount: context.section.object.amount,
            },
            {
                mbHash: context.mb.hash,
                sectionIndex: context.section.index,
            },
            context.timestamp,
        );
    }

    /**
     Validator node callbacks
     */
    async validatorNodeDescriptionCallback(context: any) {
        const cometPublicKeyBytes = Base64.decodeBinary(context.section.object.cometPublicKey);
        const cometAddress =
            CometBFTPublicKeyConverter.convertRawPublicKeyIntoAddress(cometPublicKeyBytes);

        const networkIntegration = await context.object.getNetworkIntegration();

        // create the new link: Comet address -> identifier
        await context.cache.db.putRaw(
            NODE_SCHEMAS.DB_VALIDATOR_NODE_BY_ADDRESS,
            cometAddress,
            context.vb.identifier,
        );

        if (networkIntegration.votingPower) {
            this.storeValidatorSetUpdateEntry(
                context.cache.validatorSetUpdate,
                networkIntegration.votingPower,
                context.section.object.cometPublicKeyType,
                cometPublicKeyBytes,
            );
        }
    }

    async validatorNodeVotingPowerUpdateCallback(context: any) {
        const description = await context.object.getDescription();
        const cometPublicKeyBytes = Base64.decodeBinary(description.cometPublicKey);

        this.storeValidatorSetUpdateEntry(
            context.cache.validatorSetUpdate,
            context.section.object.votingPower,
            description.cometPublicKeyType,
            cometPublicKeyBytes,
        );
    }

    storeValidatorSetUpdateEntry(
        validatorSetUpdate: any,
        votingPower: number,
        pubKeyType: string,
        pubKeyBytes: Uint8Array,
    ) {
        const translatedPubKeyType = KEY_TYPE_MAPPING[pubKeyType];

        if (!translatedPubKeyType) {
            this.logger.error(`invalid key type '${pubKeyType}' for validator set update`);
            return false;
        }

        const validatorSetUpdateEntry = {
            power: votingPower,
            pub_key_type: translatedPubKeyType,
            pub_key_bytes: pubKeyBytes,
        };

        validatorSetUpdate.push(validatorSetUpdateEntry);
        return true;
    }
}
