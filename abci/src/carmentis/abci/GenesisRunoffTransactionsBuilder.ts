import {
    ECO,
    CMTSToken,
    Microblock,
    CryptoEncoderFactory,
    PrivateSignatureKey,
    PublicSignatureKey,
    VirtualBlockchainType,
    SectionType,
    Utils
} from '@cmts-dev/carmentis-sdk/server';
import { GenesisRunoff } from './GenesisRunoff';
import {
    GenesisRunoffTokenIssuanceActionType,
    GenesisRunoffProtocolCreationActionType,
    GenesisRunoffOrganizationCreationActionType,
    GenesisRunoffNodeCreationActionType,
    GenesisRunoffStakingActionType,
    GenesisRunoffNodeApprovalActionType,
    GenesisRunoffTransferActionType,
} from './types/GenesisRunoffType';
import { getLogger } from '@logtape/logtape';

export class GenesisRunoffTransactionsBuilder {
    private logger = getLogger(["node", "genesis", GenesisRunoffTransactionsBuilder.name])
    private readonly accountHashByAccountId: Map<string, Uint8Array<ArrayBufferLike>>;
    private readonly organizationHashByOrganizationId: Map<string, Uint8Array<ArrayBufferLike>>;
    private readonly accountIdByOrganizationId: Map<string, string>;
    private readonly organizationIdByNodeId: Map<string, string>;
    private readonly nodeHashByNodeId: Map<string, Uint8Array<ArrayBufferLike>>;
    private readonly createsMicroblocksByVbId: Map<Uint8Array<ArrayBufferLike>, Microblock[]>;
    private readonly builtTransactions : Uint8Array[] = [];
    private stringByAlias: Map<string, string>;
    private tokenIssuanceIsProcessed = false;

    constructor(
        private readonly genesisRunoffs: GenesisRunoff,
        issuerEncodedPrivateKey: string,
        issuerEncodedPublicKey: string,
        genesisNodeEncodedPubKey: string,
        genesisNodeRpcEndpoint: string,
    ) {
        this.accountHashByAccountId = new Map();
        this.organizationHashByOrganizationId = new Map();
        this.accountIdByOrganizationId = new Map();
        this.organizationIdByNodeId = new Map();
        this.nodeHashByNodeId = new Map();
        this.createsMicroblocksByVbId = new Map<Uint8Array, Microblock[]>();

        this.stringByAlias = new Map;
        this.stringByAlias.set('{{ISSUER_PUBLIC_KEY}}', issuerEncodedPublicKey);
        this.stringByAlias.set('{{ISSUER_PRIVATE_KEY}}', issuerEncodedPrivateKey);
        this.stringByAlias.set('{{GENESIS_NODE_PUBLIC_KEY}}', genesisNodeEncodedPubKey);
        this.stringByAlias.set('{{GENESIS_NODE_RPC_END_POINT}}', genesisNodeRpcEndpoint);
    }

    async createRunoffTransactions() {
        for (const action of this.genesisRunoffs.getActions()) {
            switch(action.type) {
                case 'tokenIssuance': await this.processTokenIssuanceAction(action); break;
                case 'protocolCreation': await this.processProtocolCreationAction(action); break;
                case 'organizationCreation': await this.processOrganizationCreationAction(action); break;
                case 'nodeCreation': await this.processNodeCreationAction(action); break;
                case 'staking': await this.processStakingAction(action); break;
                case 'nodeApproval': await this.processNodeApprovalAction(action); break;
                case 'transfer': await this.processTransferAction(action); break;
            }
        }
        return this.builtTransactions;
    }

    /**
     * Processes the initial token issuance on a given account. This may by called only once.
     */
    private async processTokenIssuanceAction(action: GenesisRunoffTokenIssuanceActionType) {
        if (this.tokenIssuanceIsProcessed) {
            throw new Error(`Attempt to process the token issuance more than once`);
        }

        const accountId = action.account;

        this.logger.info('Creating microblock for issuer account creation');
        const microblock = Microblock.createGenesisAccountMicroblock();
        const issuerPublicKey = await this.getPublicKeyForAccountById(accountId);
        microblock.addSections([
            {
                type: SectionType.ACCOUNT_PUBLIC_KEY,
                publicKey: await issuerPublicKey.getPublicKeyAsBytes(),
                schemeId: issuerPublicKey.getSignatureSchemeId(),
            },
            {
                type: SectionType.ACCOUNT_TOKEN_ISSUANCE,
                amount: ECO.INITIAL_OFFER,
            },
        ]);
        const issuerPrivateKey = await this.getPrivateKeyForAccountById(accountId);
        await microblock.seal(issuerPrivateKey);
        const { microblockData, microblockHash } = microblock.serialize();
        this.storeAccountById(accountId, microblockHash);
        await this.storeMicroblock(microblockHash, microblock, microblockData);
        this.tokenIssuanceIsProcessed = true;
    }

    /**
     * Creates the protocol virtual blockchain, attached to an organization.
     */
    private async processProtocolCreationAction(action: GenesisRunoffProtocolCreationActionType) {
        const organizationId = action.organization;
        const organizationHash = this.getOrganizationHashByOrganizationIdOrFail(organizationId);
        const accountId = this.getAccountIdByOrganizationIdOrFail(organizationId);
        const privateKey = await this.getPrivateKeyForAccountById(accountId);

        this.logger.info('Creating protocol microblock');
        const microblock = Microblock.createGenesisProtocolMicroblock();
        microblock.addSection({
            type: SectionType.PROTOCOL_CREATION,
            organizationId: organizationHash,
        });
        await microblock.seal(privateKey);
        const { microblockData, microblockHash } = microblock.serialize();
        await this.storeMicroblock(microblockHash, microblock, microblockData);
    }

    /**
     * Creates an organization, attached to an account.
     */
    private async processOrganizationCreationAction(action: GenesisRunoffOrganizationCreationActionType) {
        const accountId = action.account;
        const accountHash = this.getAccountHashByAccountIdOrFail(accountId);
        const privateKey = await this.getPrivateKeyForAccountById(accountId);
        const organization = this.genesisRunoffs.getOrganizationByIdOrFail(action.organization);

        this.logger.info(`Creating microblock for organization '${action.organization}'`);
        const microblock = Microblock.createGenesisOrganizationMicroblock();
        microblock.addSections([
            {
                type: SectionType.ORG_CREATION,
                accountId: accountHash,
            },
            {
                type: SectionType.ORG_DESCRIPTION,
                name: organization.name,
                website: organization.website,
                countryCode: organization.countryCode,
                city: organization.city,
            },
        ]);
        await microblock.seal(privateKey);
        const { microblockData, microblockHash } = microblock.serialize();
        await this.storeMicroblock(microblockHash, microblock, microblockData);
        this.accountIdByOrganizationId.set(action.organization, accountId);
        this.storeOrganizationById(action.organization, microblockHash);
    }

    /**
     * Creates a node, attached to an organization.
     */
    private async processNodeCreationAction(action: GenesisRunoffNodeCreationActionType) {
        const organizationId = action.organization;
        const organizationHash = this.getOrganizationHashByOrganizationIdOrFail(organizationId);
        const accountId = this.getAccountIdByOrganizationIdOrFail(organizationId);
        const privateKey = await this.getPrivateKeyForAccountById(accountId);
        const node = this.genesisRunoffs.getNodeByIdOrFail(action.node);

        const aliasedPublicKey = this.stringByAlias.get(node.publicKey);
        const publicKey = aliasedPublicKey || node.publicKey;
        const aliasedRpcEndpoint = this.stringByAlias.get(node.rpcEndpoint);
        const rpcEndpoint = aliasedRpcEndpoint || node.rpcEndpoint;

        this.logger.info(`Creating microblock for validator node '${action.node}'`);
        this.logger.info(`publicKey = ${publicKey}, RPC endpoint = ${rpcEndpoint}`);
        const microblock = Microblock.createGenesisValidatorNodeMicroblock();
        microblock.addSections([
            {
                type: SectionType.VN_CREATION,
                organizationId: organizationHash,
            },
            {
                type: SectionType.VN_COMETBFT_PUBLIC_KEY_DECLARATION,
                cometPublicKey: publicKey,
                cometPublicKeyType: 'tendermint/PubKeyEd25519',
            },
            {
                type: SectionType.VN_RPC_ENDPOINT,
                rpcEndpoint: rpcEndpoint,
            },
        ]);
        await microblock.seal(privateKey);
        const { microblockData, microblockHash } = microblock.serialize();
        await this.storeMicroblock(microblockHash, microblock, microblockData);
        this.organizationIdByNodeId.set(action.node, action.organization);
        this.storeNodeById(action.node, microblockHash);
    }

    /**
     * Creates a staking lock on a given account for a given node.
     */
    private async processStakingAction(action: GenesisRunoffStakingActionType) {
        const amount = CMTSToken.createCMTS(action.amount).getAmountAsAtomic();
        const nodeHash = this.getNodeHashByNodeIdOrFail(action.node);
        const organizationId = this.getOrganizationIdByNodeIdOrFail(action.node);
        const accountId = this.getAccountIdByOrganizationIdOrFail(organizationId);
        const accountHash = this.getAccountHashByAccountIdOrFail(accountId);
        const privateKey = await this.getPrivateKeyForAccountById(accountId);

        this.logger.info(`Creating staking of ${action.amount} from account '${accountId}' CMTS for node '${action.node}'`);

        const microblock = Microblock.createGenesisAccountMicroblock();
        microblock.addSection({
            type: SectionType.ACCOUNT_STAKE,
            amount,
            objectType: VirtualBlockchainType.NODE_VIRTUAL_BLOCKCHAIN,
            objectIdentifier: nodeHash
        });
        const lastMicroblock = this.getLastMicroblockOfVirtualBlockchain(accountHash);
        microblock.setAsSuccessorOf(lastMicroblock);
        await microblock.seal(privateKey);
        const { microblockData, microblockHash } = microblock.serialize();
        await this.storeMicroblock(microblockHash, microblock, microblockData);
    }

    /**
     * Processes a node approval.
     */
    private async processNodeApprovalAction(action: GenesisRunoffNodeApprovalActionType) {
        const nodeHash = this.getNodeHashByNodeIdOrFail(action.node);
        const accountId = action.account;
        const accountHash = this.getAccountHashByAccountIdOrFail(accountId);
        const privateKey = await this.getPrivateKeyForAccountById(accountId);

        const microblock = Microblock.createGenesisValidatorNodeMicroblock();
        microblock.addSections([
            {
                type: SectionType.VN_APPROVAL,
                status: true,
            },
        ]);
        const lastMicroblock = this.getLastMicroblockOfVirtualBlockchain(nodeHash);
        microblock.setAsSuccessorOf(lastMicroblock);
        await microblock.seal(privateKey);
        const { microblockData, microblockHash } = microblock.serialize();
        await this.storeMicroblock(microblockHash, microblock, microblockData);
    }

    /**
     * Processes a token transfer between 2 accounts, with or without vesting.
     */
    private async processTransferAction(action: GenesisRunoffTransferActionType) {
        // no vesting: we just transfer the tokens
        // vesting: add the vesting section to the microblock of the sender

        // log the transfer for debugging purposes
        const transferredTokens = CMTSToken.createCMTS(action.amount);
        this.logger.info(
            `transfer ${transferredTokens.toString()} from '${action.source}' to '${action.destination}', vesting: ${action.vesting === undefined ? 'no' : 'yes'}`,
        );

        // load the source account and assert it is defined (otherwise, there is an issue in the order of transactions)
        const sourceAccountId = action.source;
        const sourceAccountHash = this.getAccountHashByAccountIdOrFail(sourceAccountId);

        // source private key
        const sourceAccountPrivateKey = await this.getPrivateKeyForAccountById(sourceAccountId);

        // we do the same for the destination account except that it is okay if it does not exist yet
        // load the destination account
        const destinationAccountId = action.destination;
        let destinationAccountHash = this.accountHashByAccountId.get(destinationAccountId);
        if (destinationAccountHash === undefined) {
            // in this case the destination account does not exist, so we create a transaction to create the
            // destination account with a zero balance
            const destinationAccountPublicKey = await this.getPublicKeyForAccountById(destinationAccountId);
            const {createdAccountId, accountCreationTransaction, accountCreationMicroblock} =
                await this.createZeroBalanceAccount(
                    destinationAccountPublicKey,
                    sourceAccountPrivateKey,
                    sourceAccountHash,
                );
            this.storeAccountById(destinationAccountId, createdAccountId);
            await this.storeMicroblock(createdAccountId, accountCreationMicroblock, accountCreationTransaction);
            destinationAccountHash = createdAccountId;
        }

        // we now create the microblock to transfer the tokens from the source account to the destination account
        const lastMicroblock = this.getLastMicroblockOfVirtualBlockchain(sourceAccountHash);
        this.logger.info(`Transfer of ${transferredTokens.toString()} from ${Utils.binaryToHexa(sourceAccountHash)} (${action.source}) to ${Utils.binaryToHexa(destinationAccountHash)} (${action.destination})`)
        if (action.vesting === undefined) {
            this.logger.info("No vesting, just transfer the tokens")
            const mb = Microblock.createGenesisAccountMicroblock();
            mb.addSection({
                type: SectionType.ACCOUNT_TRANSFER,
                account: destinationAccountHash,
                privateReference: '',
                publicReference: '',
                amount: transferredTokens.getAmountAsAtomic(),
            });
            mb.setAsSuccessorOf(lastMicroblock);
            await mb.seal(sourceAccountPrivateKey);
            const { microblockData } = mb.serialize();
            await this.storeMicroblock(sourceAccountHash, mb, microblockData);
        } else {
            const vesting = this.getVestingParametersFromVestingId(action.vesting);
            this.logger.info(`Vesting detected: cliff of ${vesting.cliffDurationInDays} days and vesting of ${vesting.vestingDurationInDays} days`)
            const mb = Microblock.createGenesisAccountMicroblock();
            mb.addSection({
                type: SectionType.ACCOUNT_VESTING_TRANSFER,
                account: destinationAccountHash,
                cliffDurationDays: vesting.cliffDurationInDays,
                privateReference: "",
                publicReference: "",
                vestingDurationDays: vesting.vestingDurationInDays,
                amount: transferredTokens.getAmountAsAtomic()
            });
            mb.setAsSuccessorOf(lastMicroblock);
            await mb.seal(sourceAccountPrivateKey);
            const { microblockData } = mb.serialize();
            await this.storeMicroblock(sourceAccountHash, mb, microblockData);
        }
    }

    private getVestingParametersFromVestingId(vestingId: string) {
        return this.genesisRunoffs.getVestingById(vestingId);
    }

    private getLastMicroblockOfVirtualBlockchain(vbId: Uint8Array) {
        const existingMicroblocks = this.createsMicroblocksByVbId.get(vbId) || [];
        if (existingMicroblocks.length === 0) throw new Error(`No microblocks found for virtual blockchain ${Utils.binaryToHexa(vbId)}`);
        const lastMicroblock = existingMicroblocks[existingMicroblocks.length - 1];
        return lastMicroblock;
    }

    private async storeMicroblock(vbId: Uint8Array, microblock: Microblock, serializedMicroblock: Uint8Array) {
        this.builtTransactions.push(serializedMicroblock);
        // we check that the microblock is coherent with the built ones
        const mbs = this.createsMicroblocksByVbId.get(vbId)
        if (mbs === undefined) {
            this.createsMicroblocksByVbId.set(vbId, [microblock]);
        } else {
            const lastMicroblock = mbs[mbs.length - 1];
            if (microblock.getHeight() !== mbs.length + 1) throw new Error(`Microblock has an invalid height: expected ${mbs.length + 1}, got ${microblock.getHeight()}`)
            const lastMicroblockHash = lastMicroblock.getHash().toBytes();
            const microblockPreviousHash = microblock.getPreviousHash().toBytes();
            if (!Utils.binaryIsEqual(lastMicroblockHash, microblockPreviousHash)) throw new Error('Mismatch between the previous hash and the expected hash')
            this.createsMicroblocksByVbId.set(vbId, [...mbs, microblock]);
        }
    }

    private storeAccountById(accountId: string, accountHash: Uint8Array) {
        this.accountHashByAccountId.set(accountId, accountHash);
    }

    private storeOrganizationById(organizationId: string, organizationHash: Uint8Array) {
        this.organizationHashByOrganizationId.set(organizationId, organizationHash);
    }

    private storeNodeById(nodeId: string, nodeHash: Uint8Array) {
        this.nodeHashByNodeId.set(nodeId, nodeHash);
    }

    private async createZeroBalanceAccount( accountPublicKey: PublicSignatureKey, sourceAccountPrivateKey: PrivateSignatureKey, sourceAccountHash: Uint8Array<ArrayBufferLike> ) {
        const mb = Microblock.createGenesisAccountMicroblock();
        mb.addSections([
            {
                type: SectionType.ACCOUNT_PUBLIC_KEY,
                publicKey: await accountPublicKey.getPublicKeyAsBytes(),
                schemeId: accountPublicKey.getSignatureSchemeId(),
            },
            {
                type: SectionType.ACCOUNT_CREATION,
                sellerAccount: sourceAccountHash,
                amount: 0,
            }
        ])
        await mb.seal(sourceAccountPrivateKey);
        const { microblockData, microblockHash } =
            mb.serialize();

        return {
            createdAccountId: microblockHash,
            accountCreationTransaction: microblockData,
            accountCreationMicroblock: mb
        }
    }

    private getAccountHashByAccountIdOrFail(accountId: string) {
        const accountHash = this.accountHashByAccountId.get(accountId);
        if (accountHash === undefined) {
            throw new Error(
                `Undefined account hash for account '${accountId}'. This account must be created before being referenced.`,
            );
        }
        return accountHash;
    }

    private getOrganizationHashByOrganizationIdOrFail(organizationId: string) {
        const organizationHash = this.organizationHashByOrganizationId.get(organizationId);
        if (organizationHash === undefined) {
            throw new Error(
                `Undefined organization hash for organization '${organizationId}'. This organization must be created before being referenced.`,
            );
        }
        return organizationHash;
    }

    private getNodeHashByNodeIdOrFail(nodeId: string) {
        const nodeHash = this.nodeHashByNodeId.get(nodeId);
        if (nodeHash === undefined) {
            throw new Error(
                `Undefined node hash for node '${nodeId}'. This node must be created before being referenced.`,
            );
        }
        return nodeHash;
    }

    private getAccountIdByOrganizationIdOrFail(organizationId: string) {
        const accountId = this.accountIdByOrganizationId.get(organizationId);
        if (accountId === undefined) {
            throw new Error(
                `Unable to find the account attached to organization with ID '${organizationId}'`,
            );
        }
        return accountId;
    }

    private getOrganizationIdByNodeIdOrFail(nodeId: string) {
        const organizationId = this.organizationIdByNodeId.get(nodeId);
        if (organizationId === undefined) {
            throw new Error(
                `Unable to find the organization attached to node with ID '${nodeId}'`,
            );
        }
        return organizationId;
    }

    getPrivateKeyForAccountById(sourceAccountId: string) {
        const account = this.genesisRunoffs.getAccountByIdOrFail(sourceAccountId);
        if (!account.privateKey) throw new Error(
            `Account ${sourceAccountId} does not have a private key defined in the genesis runoff`
        )
        const aliasedString = this.stringByAlias.get(account.privateKey);
        const privateKey = aliasedString || account.privateKey;
        const encoder = CryptoEncoderFactory.defaultStringSignatureEncoder();
        return encoder.decodePrivateKey(privateKey);
    }

    async getPublicKeyForAccountById(destinationAccountId: string) {
        const account = this.genesisRunoffs.getAccountByIdOrFail(destinationAccountId);
        const aliasedString = this.stringByAlias.get(account.publicKey);
        const publicKey = aliasedString || account.publicKey;
        const encoder = CryptoEncoderFactory.defaultStringSignatureEncoder();
        return await encoder.decodePublicKey(publicKey);
    }
}
