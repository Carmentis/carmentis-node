import { CMTSToken, Microblock, PrivateSignatureKey, PublicSignatureKey, Utils } from '@cmts-dev/carmentis-sdk/server';
import { GenesisRunoff } from './GenesisRunoff';
import { getLogger } from '@logtape/logtape';

export class GenesisRunoffTransactionsBuilder {

    private logger = getLogger(["node", "genesis", GenesisRunoffTransactionsBuilder.name])
    private readonly accountHashByAccountName: Map<string, Uint8Array<ArrayBufferLike>>;
    private readonly createsMicroblocksByVbId: Map<Uint8Array<ArrayBufferLike>, Microblock[]>;
    private readonly builtTransactions : Uint8Array[] = [];
    constructor(
        private readonly genesisRunoffs: GenesisRunoff,
        private readonly issuerAccountHash: Uint8Array,
        private readonly issuerPrivateKey: PrivateSignatureKey,
        private readonly issuerPublicKey: PublicSignatureKey,
        issuerAccountCreationMicroblock: Microblock,
    ) {
        this.accountHashByAccountName = new Map([['issuer', this.issuerAccountHash]]);
        this.createsMicroblocksByVbId = new Map<Uint8Array, Microblock[]>();
        this.createsMicroblocksByVbId.set(this.issuerAccountHash, [
            issuerAccountCreationMicroblock,
        ]);
    }

    async createRunoffTransactions() {

        for (const transfer of this.genesisRunoffs.getOrderedTransfers()) {
            // no vesting: we just transfer the tokens
            // vesting: add the vesting section to the microblock of the sender

            // log the transfer for debugging purposes
            const transferredTokens = CMTSToken.createCMTS(transfer.amount);
            this.logger.info(
                `transfer ${transferredTokens.toString()} from ${transfer.source} to ${transfer.destination}`,
            );


            // load the source account and assert it is defined (othewise, there is an issue in the order of transactions)
            const sourceAccountName = transfer.source;
            const sourceAccountHash = this.accountHashByAccountName.get(sourceAccountName);
            if (sourceAccountHash === undefined) {
                throw new Error(
                    `Undefined source account hash for account named ${sourceAccountName}`,
                );
            }

            // source private key
            const sourceAccountPrivateKey = await this.getPrivateKeyForAccountByName(sourceAccountName);


            // we do the same for the destination account except that it is okay if it does not exist yet
            // load the destination account
            const destinationAccountName = transfer.destination;
            let destinationAccountHash = this.accountHashByAccountName.get(destinationAccountName);
            if (destinationAccountHash === undefined) {
                // in this case the destination account do not exist, so we create a transaction to create the
                // destination account with a zero balance
                const destinationAccountPublicKey = await this.getPublicKeyForAccountByName(destinationAccountName);
                const {createdAccountId, accountCreationTransaction, accountCreationMicroblock} =
                    await this.createZeroBalanceAccount(
                    destinationAccountPublicKey,
                    this.issuerPrivateKey,
                    sourceAccountHash,
                );
                await this.storeAccountByName(destinationAccountName, createdAccountId);
                await this.storeMicroblock(createdAccountId, accountCreationMicroblock, accountCreationTransaction);
                destinationAccountHash = createdAccountId;
            }

            // we now create the microblock to transfer the tokens from the source account to the destination account
            const {firstMicroblock, lastMicroblock} = this.getFirstAndLastMicroblockOfVirtualBlockchain(sourceAccountHash);
            this.logger.info(`Transfer of ${transferredTokens.toString()} from ${Utils.binaryToHexa(sourceAccountHash)} (${transfer.source}) to ${Utils.binaryToHexa(destinationAccountHash)} (${transfer.destination})`)
            if (transfer.vesting === undefined) {
                this.logger.info("No vesting, just transfer the tokens")
                const mb = Microblock.createGenesisAccountMicroblock();
                mb.addAccountTransferSection({
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
                const vesting = this.getVestingParametersFromVestingName(transfer.vesting);
                this.logger.info(`Vesting detected: cliff of ${vesting.cliffDurationInDays} days and vesting of ${vesting.vestingDurationInDays} days`)
                const mb = Microblock.createGenesisAccountMicroblock();
                mb.addAccountVestingTransferSection({
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

            /*
            const destinationAccountExistingMicroblocks =
                this.createsMicroblocksByVbId.get(destinationAccountHash) || [];
            if (destinationAccountHash === undefined) {
                // create the destination account
                const destinationAccountPublicKey =
                    destinationAccountName === 'issuer'
                        ? this.issuerPublicKey
                        : await this.genesisRunoffs.getPublicKeyForAccountByName(
                            destinationAccountName,
                        );

                const mb = Microblock.createGenesisAccountMicroblock();
                mb.addAccountPublicKeySection({
                    publicKey: await destinationAccountPublicKey.getPublicKeyAsBytes(),
                    schemeId: destinationAccountPublicKey.getSignatureSchemeId(),
                });
                mb.addAccountCreationSection({
                    sellerAccount: sourceAccountHash,
                    amount: 0,
                });
                mb.addAccountVestingTransferSection({
                    account: ,
                    cliffDurationDays: 0,
                    privateReference: "",
                    publicReference: "",
                    vestingDurationDays: 0,
                    amount: CMTSToken.createCMTS(transfer.amount).getAmountAsAtomic()
                })
                const signature = await mb.sign(sourceAccountPrivateKey);
                mb.addAccountSignatureSection({
                    signature,
                    schemeId: sourceAccountPrivateKey.getSignatureSchemeId(),
                });
                const { microblockData, microblockHash: createdDestinationAccountHash } =
                    mb.serialize();
                this.builtTransactions.push(microblockData);
                this.accountHashByAccountName.set(destinationAccountName, createdDestinationAccountHash);
                this.createsMicroblocksByVbId.set(createdDestinationAccountHash, [
                    ...destinationAccountExistingMicroblocks,
                    mb,
                ]);
                this.logger.debug(`Transfer of ${transferredTokens.toString()} from ${Utils.binaryToHexa(sourceAccountHash)} (${transfer.source}) to ${Utils.binaryToHexa(createdDestinationAccountHash)} (${transfer.destination})`)
            } else {
                this.logger.debug("Extending existing virtual blockchain during account tranfer")
                // just transfer the account, no need to use the destination account, only the destination account hash and the source account private key
                const mb = Microblock.createGenesisAccountMicroblock();
                const previousMicroblocks = sourceAccountExistingMicroblocks;
                mb.addAccountTransferSection({
                    account: destinationAccountHash,
                    privateReference: '',
                    publicReference: '',
                    amount: CMTSToken.createCMTS(transfer.amount).getAmountAsAtomic(),
                });
                mb.setAsSuccessorOf(previousMicroblocks[previousMicroblocks.length - 1]);
                await mb.seal(sourceAccountPrivateKey);
                const { microblockData } = mb.serialize();
                this.builtTransactions.push(microblockData);
                this.createsMicroblocksByVbId.set(sourceAccountHash, [
                    ...sourceAccountExistingMicroblocks,
                    mb,
                ]);
                }

             */
        }

        return this.builtTransactions;
    }

    private getVestingParametersFromVestingName(vestinName: string) {
        return this.genesisRunoffs.getVestingByName(vestinName);
    }

    private getFirstAndLastMicroblockOfVirtualBlockchain(vbId: Uint8Array) {
        const existingMicroblocks = this.createsMicroblocksByVbId.get(vbId) || [];
        if (existingMicroblocks.length === 0) throw new Error(`No microblocks found for virtual blockchain ${Utils.binaryToHexa(vbId)}`);
        return {
            firstMicroblock: existingMicroblocks[0],
            lastMicroblock: existingMicroblocks[existingMicroblocks.length - 1]
        };
    }

    private async storeMicroblock(vbId: Uint8Array, microblock: Microblock, serializedMicroblock: Uint8Array) {
        this.builtTransactions.push(serializedMicroblock);
        this.createsMicroblocksByVbId.set(vbId, [...(this.createsMicroblocksByVbId.get(vbId) || []), microblock]);
    }

    private async storeAccountByName(accountName: string, accountId: Uint8Array) {
        this.accountHashByAccountName.set(accountName, accountId);
    }

    private async getPrivateKeyForAccountByName(accountName: string): Promise<PrivateSignatureKey> {
        return accountName === 'issuer'
            ? this.issuerPrivateKey
            : await this.genesisRunoffs.getPrivateKeyForAccountByName(accountName);
    }

    private async createZeroBalanceAccount( accountPublicKey: PublicSignatureKey, sourceAccountPrivateKey: PrivateSignatureKey, sourceAccountHash: Uint8Array<ArrayBufferLike> ) {
        const mb = Microblock.createGenesisAccountMicroblock();
        mb.addAccountPublicKeySection({
            publicKey: await accountPublicKey.getPublicKeyAsBytes(),
            schemeId: accountPublicKey.getSignatureSchemeId(),
        });
        mb.addAccountCreationSection({
            sellerAccount: sourceAccountHash,
            amount: 0,
        });
        await mb.seal(sourceAccountPrivateKey);
        const { microblockData, microblockHash } =
            mb.serialize();

        return {
            createdAccountId: microblockHash,
            accountCreationTransaction: microblockData,
            accountCreationMicroblock: mb
        }
    }

    private async getPublicKeyForAccountByName(accountName: string): Promise<PublicSignatureKey> {
            return accountName === 'issuer'
                ? this.issuerPublicKey
                : await this.genesisRunoffs.getPublicKeyForAccountByName(
                    accountName,
                );
    }
}
