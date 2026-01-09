import { InitChainRequest } from '../../proto-ts/cometbft/abci/v1/types';
import {
    AccountVb,
    CryptoEncoderFactory,
    EncoderFactory,
    Hash,
    IllegalParameterError,
    Microblock,
    PrivateSignatureKey,
    Provider,
    PublicSignatureKey, SectionType,
} from '@cmts-dev/carmentis-sdk/server';
import { getLogger, Logger } from '@logtape/logtape';
import { GlobalState } from './state/GlobalState';

export class InitialBlockchainStateBuilder {
    private logger = getLogger([ 'node', 'state', InitialBlockchainStateBuilder.name ]);

    constructor(
        private readonly state: GlobalState,
        private readonly request: InitChainRequest,
        private readonly issuerPrivateKey: PrivateSignatureKey,
        private readonly issuerPublicKey: PublicSignatureKey,
    ) {
    }

    public static async create(
        state: GlobalState,
        request: InitChainRequest,
        issuerPrivateKey: PrivateSignatureKey,
    ) {
        const issuerPublicKey = await issuerPrivateKey.getPublicKey();
        const updater = new InitialBlockchainStateBuilder(state, request, issuerPrivateKey, issuerPublicKey);
    }

    public getValidatorPublicKeyFromRequest(keyTypeMapping: Record<string, string>) {
        // The init chain request should contain exactly one validator in the validator set.
        // The validator, assumed to be this running node, is used to declare the first running node.
        const validators = this.request.validators;
        const containsExactlyOneValidator = validators.length === 1;
        if (!containsExactlyOneValidator) {
            throw new IllegalParameterError(
                'Cannot create initial state with zero or more than one validator',
            );
        }

        // Once we are sure that the validator set contains exactly one validator, we extract it from
        // the set of validator to get its public key type and value.
        // We also have to convert the public key value in base64.
        const { pub_key_type: genesisNodePublicKeyType, pub_key_bytes } = validators[0];
        const encoder = EncoderFactory.bytesToBase64Encoder();
        const genesisNodePublicKey = encoder.encode(pub_key_bytes);
        const translatedGenesisNodePublicKeyType = Object.keys(keyTypeMapping).find(
            (key) => keyTypeMapping[key] == genesisNodePublicKeyType,
        );

        if (!translatedGenesisNodePublicKeyType) {
            throw new IllegalParameterError(`Unexpected key type '${genesisNodePublicKeyType}'`);
        }

        return {
            genesisNodePublicKeyType: translatedGenesisNodePublicKeyType,
            genesisNodePublicKey,
        };
    }

    public async createIssuerAccountCreationTransaction() {
        const sigEncoder = CryptoEncoderFactory.defaultStringSignatureEncoder();
        this.logger.info(`Creating genesis account creation transaction`);
        this.logger.debug(
            `issuer public key: ${await sigEncoder.encodePublicKey(this.issuerPublicKey)}`,
        );

        const microblock = await AccountVb.createIssuerAccountCreationMicroblock(
            this.issuerPublicKey,
        );
        const signature = await microblock.sign(this.issuerPrivateKey);
        microblock.addSection({
            type: SectionType.SIGNATURE,
            signature,
            schemeId: this.issuerPublicKey.getSignatureSchemeId()
        });

        const { microblockData } = microblock.serialize();
        return microblockData;
    }

    public async createCarmentisOrganisationCreationTransaction() {
        /*
        this.logger.info('Creating organisation creation transaction');

        const mb = Microblock.createGenesisOrganizationMicroblock();
        mb.addOrganizationPublicKeySection({
            publicKey: await this.issuerPublicKey.getPublicKeyAsBytes(),
            schemeId: this.issuerPublicKey.getSignatureSchemeId(),
        });
        mb.addOrganizationDescriptionSection({
            name: 'Carmentis',
            countryCode: 'FR',
            city: 'Paris',
            website: 'https://carmentis.io',
        });

        const mbSignature = await mb.sign(this.issuerPrivateKey);
        mb.addOrganizationSignatureSection({
            signature: mbSignature,
            schemeId: this.issuerPublicKey.getSignatureSchemeId(),
        });

        const { microblockHash: organizationId, microblockData: organizationCreationTransaction } =
            mb.serialize();
        return { organizationId, organizationCreationTransaction };

        /*
        const mb = organisation.vb.currentMicroblock;
        const serializedOrganisationMicroBlock = mb.serialize();
        const organizationId = Hash.from(serializedOrganisationMicroBlock.microblockHash);
        const organisationCreationMicroBlockHeader = serializedOrganisationMicroBlock.headerData;
        const organisationCreationMicroBlockBody = serializedOrganisationMicroBlock.bodyData;
        const organisationCreationTransaction = Utils.binaryFrom(
            organisationCreationMicroBlockHeader,
            organisationCreationMicroBlockBody,
        );
         */
    }

    public async createGenesisNodeDeclarationTransaction(
        organizationId: Uint8Array,
        genesisNodePublicKey: string,
        genesisNodePublicKeyType: string,
        genesisNodeCometbftRpcEndpoint: string,
    ) {
        /*
        // We now declare the running node as the genesis node.
        const mb = Microblock.createGenesisValidatorNodeMicroblock();
        mb.addValidatorNodeDeclarationSection({
            organizationId,
        });
        mb.addValidatorNodeCometbftPublicKeyDeclarationSection({
            cometPublicKey: genesisNodePublicKey,
            cometPublicKeyType: genesisNodePublicKeyType,
        });
        mb.addValidatorNodeRpcEndpointSection({
            rpcEndpoint: genesisNodeCometbftRpcEndpoint,
        });
        const signature = await mb.sign(this.issuerPrivateKey);
        mb.addValidatorNodeSignatureSection({ signature, schemeId: this.issuerPublicKey.getSignatureSchemeId() });

        const {
            microblockHash: validatorNodeId,
            microblockData: genesisNodeDeclarationTransaction,
        } = mb.serialize();
        /*
        const genesisNode = await this.blockchain.createValidatorNode(organizationId);
        await genesisNode.setDescription({

        });
        await genesisNode.setRpcEndpoint({

        });
        const validatorNodeVb = genesisNode.vb;
        await validatorNodeVb.setSignature(this.issuerPrivateKey);
        const serializedGenesisNodeMicroBlock = validatorNodeVb.currentMicroblock.serialize();
        const validatorNodeId = Hash.from(serializedGenesisNodeMicroBlock.microblockHash);
        const genesisNodeMicroBlockHeader = serializedGenesisNodeMicroBlock.headerData;
        const genesisNodeMicroBlockBody = serializedGenesisNodeMicroBlock.bodyData;
        const genesisNodeDeclarationTransaction = Utils.binaryFrom(
            genesisNodeMicroBlockHeader,
            genesisNodeMicroBlockBody,
        );


        return { genesisNodeId: validatorNodeId, genesisNodeDeclarationTransaction };
        */
    }
}
