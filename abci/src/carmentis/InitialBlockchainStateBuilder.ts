import {
    CheckTxRequest,
    ExtendVoteRequest,
    FinalizeBlockRequest,
    FinalizeBlockResponse,
    InitChainRequest,
    PrepareProposalRequest,
    ProcessProposalRequest,
    ProcessProposalStatus,
    VerifyVoteExtensionRequest,
} from '../proto-ts/cometbft/abci/v1/types';
import {
    Blockchain,
    CHAIN,
    CMTSToken,
    CryptographicHash,
    CryptoSchemeFactory,
    ECO,
    Economics,
    Hash,
    KeyedProvider,
    NullNetworkProvider,
    PrivateSignatureKey,
    Provider,
    PublicSignatureKey,
    SECTIONS,
    Utils,
} from '@cmts-dev/carmentis-sdk/server';
import { EncoderFactory, IllegalParameterError } from '@cmts-dev/carmentis-sdk/server';
import { Logger } from '@nestjs/common';
import { NodeProvider } from './nodeProvider';
import { LevelDb } from './levelDb';
import { Storage } from './storage';

export class InitialBlockchainStateBuilder {
    private issuerPublicKey: PublicSignatureKey;
    private logger = new Logger(InitialBlockchainStateBuilder.name);

    constructor(
        private readonly request: InitChainRequest,
        private readonly issuerPrivateKey: PrivateSignatureKey,
        private readonly blockchain: Blockchain
    ) {
        this.issuerPublicKey = issuerPrivateKey.getPublicKey();
    }



    public getValidatorPublicKeyFromRequest() {
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
        return { genesisNodePublicKeyType, genesisNodePublicKey };
    }


    public async createIssuerAccountCreationTransaction() {
        this.logger.verbose("Creating genesis account creation transaction")
        const account = await this.blockchain.createGenesisAccount(this.issuerPublicKey);
        const accountVb = account.vb;
        await accountVb.setSignature(this.issuerPrivateKey);
        const { headerData, bodyData } = account.vb.currentMicroblock.serialize();
        return Utils.binaryFrom(headerData, bodyData);
    }

    public async createCarmentisOrganisationCreationTransaction() {
        this.logger.verbose("Creating organisation creation transaction")
        const organisation = await this.blockchain.createOrganization();
        await organisation.setDescription({
            name: "Carmentis",
            countryCode: "FR",
            city: "Paris",
            website: "https://carmentis.io"
        });
        const organisationVb = organisation.vb;
        await organisationVb.setSignature(this.issuerPrivateKey);
        const serializedOrganisationMicroBlock = organisationVb.currentMicroblock.serialize();
        const organizationId = Hash.from(serializedOrganisationMicroBlock.microblockHash);
        const organisationCreationMicroBlockHeader = serializedOrganisationMicroBlock.headerData;
        const organisationCreationMicroBlockBody = serializedOrganisationMicroBlock.bodyData;
        const organisationCreationTransaction = Utils.binaryFrom(
            organisationCreationMicroBlockHeader,
            organisationCreationMicroBlockBody,
        );
        return { organizationId, organisationCreationTransaction };
    }

    public async createGenesisNodeDeclarationTransaction(organizationId: Hash, genesisNodePublicKey: string, genesisNodePublicKeyType: string) {
        // We now declare the running node as the genesis node.
        const genesisNode = await this.blockchain.createValidatorNode(organizationId);
        await genesisNode.setDescription({
            cometPublicKey: genesisNodePublicKey,
            cometPublicKeyType: genesisNodePublicKeyType,
        });
        const validatorNodeVb = genesisNode.vb;
        // we have to disable callback to prevent provider to check existence of organization we have created above.
        await validatorNodeVb.setSignature(this.issuerPrivateKey, false);
        const serializedGenesisNodeMicroBlock = validatorNodeVb.currentMicroblock.serialize();
        const validatorNodeId = Hash.from(serializedGenesisNodeMicroBlock.microblockHash);
        const genesisNodeMicroBlockHeader = serializedGenesisNodeMicroBlock.headerData;
        const genesisNodeMicroBlockBody = serializedGenesisNodeMicroBlock.bodyData;
        const genesisNodeDeclarationTransaction = Utils.binaryFrom(
            genesisNodeMicroBlockHeader,
            genesisNodeMicroBlockBody,
        );

        return {genesisNodeId: validatorNodeId, genesisNodeDeclarationTransaction};
    }

    public async createGenesisNodeValidatorGrantTransaction(genesisNodeId: Hash) {
        // We now load the genesis validator node and set the voting power to 10.
        const loadedNode = await this.blockchain.loadValidatorNode(genesisNodeId);
        await loadedNode.setNetworkIntegration({
            votingPower: 10
        });
        const vb = loadedNode.vb;
        await vb.setSignature(this.issuerPrivateKey);
        const serializedMb = vb.currentMicroblock.serialize();
        return Utils.binaryFrom(
            serializedMb.headerData,
            serializedMb.bodyData,
        );
    }

}