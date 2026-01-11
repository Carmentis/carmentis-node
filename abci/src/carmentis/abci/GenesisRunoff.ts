import { readFileSync, existsSync } from 'fs';
import {
    GenesisRunoffAccountType,
    GenesisRunoffSchema,
    GenesisRunoffTransferType,
    GenesisRunoffType,
} from './types/GenesisRunoffType';
import { getLogger } from '@logtape/logtape';
import { CMTSToken, CryptoEncoderFactory } from '@cmts-dev/carmentis-sdk/server';

export class GenesisRunoff {
    private static readonly logger = getLogger(['node', GenesisRunoff.name]);
    private constructor(private readonly data: GenesisRunoffType) {}

    static loadFromFilePathOrCreateNoRunoff(path: string): GenesisRunoff {
        // Si le fichier n'existe pas, retourner une instance vide
        if (!existsSync(path)) {
            this.logger.info(`No genesis runoffs file found at ${path}: Assuming no runoffs`)
            return GenesisRunoff.noRunoff();
        }

        try {
            // Lire le fichier JSON
            GenesisRunoff.logger.info(`Reading genesis runoff file from: ${path}`);
            const fileContent = readFileSync(path, 'utf-8');

            // Parser le JSON
            const parsedData = JSON.parse(fileContent);

            // Valider avec le schema Zod
            const validatedData = GenesisRunoffSchema.parse(parsedData);

            const runoffs = new GenesisRunoff(validatedData);
            if (!runoffs.areTransferValid()) throw new Error("Genesis runoffs are invalid: Please verify the runoffs")
            return runoffs
        } catch (error) {
            throw new Error(
                `Invalid genesis runoff file at ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
        }
    }

    static noRunoff(): GenesisRunoff {
        return new GenesisRunoff({
            vesting: [],
            accounts: [],
            transfers: [],
        });
    }

    getAccounts(): GenesisRunoffAccountType[] {
        return this.data.accounts;
    }

    /**
     * Checks if transfers are correctly defined.
     *
     * A transfer is said valid if:
     * - The source account is defined
     * - The destination account is defined
     * - If the source is not the issuer, then the private key must be provided in the genesis runoff
     * - If the vesting parameter is used, then the vesting should be defined.
     * - If a transfer includes a vesting, then it cannot be transferred.
     * - The total transferred by an account cannot exceed the total received by the account.
     * Note that vested received tokens are deducted from the total received as they are blocked by definition.
     *
     * Note: the issuer account is always defined and is implicitly initialized with 1 billion tokens.
     *
     * @throws {Error} If transfers are invalid, with a detailed message explaining the issue
     */
    areTransferValid(): boolean {
        const accountNames = new Set(this.data.accounts.map((acc) => acc.name));
        accountNames.add('issuer'); // Issuer is always defined

        // Map account names to their private keys
        const accountPrivateKeys = new Map<string, string | undefined>();
        for (const account of this.data.accounts) {
            accountPrivateKeys.set(account.name, account.privateKey);
        }

        const vestingNames = new Set(this.data.vesting.map((v) => v.name));

        // Track balances: received - vested - transferred
        const balances = new Map<string, number>();
        balances.set('issuer', 1_000_000_000); // 1 billion tokens for issuer

        // Track which accounts have received vested tokens (these cannot be transferred)
        const vestedReceipts = new Set<string>();

        // First pass: validate transfers and calculate received amounts
        for (const transfer of this.data.transfers) {
            // Check source account is defined
            if (!accountNames.has(transfer.source)) {
                GenesisRunoff.logger.error(
                    `Transfer validation failed: Source account '${transfer.source}' is not defined. ` +
                    `Transfer: ${JSON.stringify(transfer)}`
                );
                return false;
            }

            // Check destination account is defined
            if (!accountNames.has(transfer.destination)) {
                GenesisRunoff.logger.error(
                    `Transfer validation failed: Destination account '${transfer.destination}' is not defined. ` +
                    `Transfer: ${JSON.stringify(transfer)}`
                );
                return false;
            }

            // Check that if source is not issuer, private key must be provided
            if (transfer.source !== 'issuer') {
                const privateKey = accountPrivateKeys.get(transfer.source);
                if (!privateKey) {
                    GenesisRunoff.logger.error(
                        `Transfer validation failed: Source account '${transfer.source}' is not the issuer ` +
                        `but no private key is provided in the genesis runoff configuration. ` +
                        `Transfer: ${JSON.stringify(transfer)}. ` +
                        `Please add the private key for account '${transfer.source}' in the accounts section.`
                    );
                    return false;
                }
            }

            // Check vesting is defined if used
            if (transfer.vesting !== undefined && !vestingNames.has(transfer.vesting)) {
                GenesisRunoff.logger.error(
                    `Transfer validation failed: Vesting '${transfer.vesting}' is not defined. ` +
                    `Transfer: ${JSON.stringify(transfer)}. ` +
                    `Available vestings: [${Array.from(vestingNames).join(', ')}]`
                );
                return false;
            }

            // Track received amounts
            if (!balances.has(transfer.destination)) {
                balances.set(transfer.destination, 0);
            }

            // If transfer includes vesting, mark the destination and don't count it as transferable
            if (transfer.vesting !== undefined) {
                vestedReceipts.add(transfer.destination);
            } else {
                // Only count non-vested amounts as available
                const destBalance = balances.get(transfer.destination) || 0;
                balances.set(
                    transfer.destination,
                     destBalance + transfer.amount,
                );
            }
        }

        // Second pass: check if accounts with vested tokens try to transfer
        for (const transfer of this.data.transfers) {
            if (vestedReceipts.has(transfer.source)) {
                GenesisRunoff.logger.error(
                    `Transfer validation failed: Account '${transfer.source}' has received vested tokens ` +
                    `and cannot transfer them. Transfer: ${JSON.stringify(transfer)}. ` +
                    `Vested tokens are locked and cannot be transferred until the vesting period completes.`
                );
                return false;
            }

            // Deduct transferred amounts
            if (!balances.has(transfer.source)) {
                balances.set(transfer.source, 0);
            }
            const sourceBalance = balances.get(transfer.source) || 0;
            balances.set(transfer.source, sourceBalance - transfer.amount);
        }

        // Check that no account has negative balance
        for (const [account, balance] of balances.entries()) {
            if (balance < 0) {
                GenesisRunoff.logger.error(
                    `Transfer validation failed: Account '${account}' would have a negative balance (${balance}). ` +
                    `This account is trying to transfer more tokens than it has received. ` +
                    `Please check the transfer amounts for this account.`
                );
                return false;
            }
        }

        return true;
    }

    getData(): GenesisRunoffType {
        return this.data;
    }

    /**
     * Retrieves a list of accounts that receive tokens from the issuer.
     *
     * The method identifies all accounts that are listed as destinations in token transfers
     * originating from the issuer and returns detailed information about those accounts.
     *
     * @return {GenesisRunoffAccountType[]} An array of accounts receiving tokens from the issuer.
     */
    getAccountsReceivingTokensFromIssuer(): GenesisRunoffAccountType[] {
        const receivingAccountNames = new Set(
            this.data.transfers
                .filter((transfer) => transfer.source === 'issuer')
                .map((transfer) => transfer.destination),
        );

        return this.data.accounts.filter((account) => receivingAccountNames.has(account.name));
    }

    getTransferredAmountInAtomicFromIssuerToAccount(accountName: string): number {
        const transfers = this.data.transfers.filter(
            (transfer) => transfer.source === 'issuer' && transfer.destination === accountName,
        );

        if (transfers.length === 0) {
            throw new Error(`No transfer from issuer to account ${accountName}`);
        }

        if (transfers.length > 1) {
            throw new Error(`Multiple transfers from issuer to account ${accountName}`);
        }

        return CMTSToken.createCMTS(transfers[0].amount).getAmountAsAtomic();
    }

    /**
     * Returns transfers ordered according to a DAG (Directed Acyclic Graph).
     *
     * A transfer from A to B can only be executed if A has already received tokens
     * (either from the issuer or from previous transfers).
     *
     * The method uses topological sorting to ensure transfers are executed in the correct order.
     *
     * @throws {Error} If there is a cycle in the transfer graph
     * @return {GenesisRunoffTransferType[]} An array of transfers ordered by execution order
     */
    getOrderedTransfers(): GenesisRunoffTransferType[] {
        if (this.data.transfers.length === 0) {
            return [];
        }

        // Build adjacency list and in-degree count
        const adjacencyList = new Map<string, string[]>();
        const inDegree = new Map<string, number>();
        const accountSet = new Set<string>();

        // Initialize issuer with in-degree 0 (it has unlimited tokens)
        inDegree.set('issuer', 0);
        accountSet.add('issuer');

        // Initialize all accounts
        for (const account of this.data.accounts) {
            accountSet.add(account.name);
            inDegree.set(account.name, 0);
            adjacencyList.set(account.name, []);
        }

        adjacencyList.set('issuer', []);

        // Build the graph: for each transfer, create an edge from source to destination
        for (const transfer of this.data.transfers) {
            const source = transfer.source;
            const destination = transfer.destination;

            if (!adjacencyList.has(source)) {
                adjacencyList.set(source, []);
            }
            const adjacencyListForSource = adjacencyList.get(source);
            if (adjacencyListForSource) {
                adjacencyListForSource.push(destination);
            } else {
                adjacencyList.set(source, [destination]);
            }

            // Increment in-degree for destination
            inDegree.set(destination, (inDegree.get(destination) || 0) + 1);
        }

        // Topological sort using Kahn's algorithm
        const queue: string[] = [];
        const ordered: string[] = [];

        // Start with nodes that have no incoming edges (only issuer initially)
        for (const [account, degree] of inDegree.entries()) {
            if (degree === 0) {
                queue.push(account);
            }
        }

        while (queue.length > 0) {
            const current = queue.shift();
            if (!current) continue;
            ordered.push(current);

            // For each neighbor, decrease in-degree
            const neighbors = adjacencyList.get(current) || [];
            for (const neighbor of neighbors) {
                inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1);
                if (inDegree.get(neighbor) === 0) {
                    queue.push(neighbor);
                }
            }
        }

        // Check for cycles
        if (ordered.length !== accountSet.size) {
            throw new Error('Cycle detected in transfer graph: transfers cannot be ordered');
        }

        // Build the ordered transfer list based on topological order
        const accountIndex = new Map<string, number>();
        ordered.forEach((account, index) => accountIndex.set(account, index));

        // Sort transfers by source account order
        const sortedTransfers = [...this.data.transfers].sort((a, b) => {
            const aIndex = accountIndex.get(a.source) ?? Number.MAX_SAFE_INTEGER;
            const bIndex = accountIndex.get(b.source) ?? Number.MAX_SAFE_INTEGER;
            return aIndex - bIndex;
        });

        return sortedTransfers;
    }

    getPrivateKeyForAccountByName(sourceAccountName: string) {
        const encoder = CryptoEncoderFactory.defaultStringSignatureEncoder();
        const account = this.data.accounts.find((acc) => acc.name === sourceAccountName);
        if (!account) throw new Error(`Account ${sourceAccountName} not found in genesis runoff`);
        if (!account.privateKey) throw new Error(
            `Account ${sourceAccountName} does not have a private key defined in the genesis runoff`
        )
        return encoder.decodePrivateKey(account.privateKey);
    }

    async getPublicKeyForAccountByName(destinationAccountName: string) {
        const encoder = CryptoEncoderFactory.defaultStringSignatureEncoder();
        const account = this.data.accounts.find((acc) => acc.name === destinationAccountName);
        if (!account) {
            throw new Error(`Account ${destinationAccountName} not found in genesis runoff`);
        }
        return await encoder.decodePublicKey(account.publicKey);
    }

    getVestingByName(vestinName: string) {
        const vesting = this.data.vesting.find((v) => v.name === vestinName);
        if (!vesting) {
            throw new Error(`Vesting ${vestinName} not found in genesis runoff`);
        }
        return vesting;
    }
}