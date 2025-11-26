import { readFileSync, existsSync } from 'fs';
import {
    GenesisRunoffAccountType,
    GenesisRunoffSchema,
    GenesisRunoffType,
} from './types/GenesisRunoffType';
import { getLogger } from '@logtape/logtape';

export class GenesisRunoff {
    private static readonly logger = getLogger(['node', GenesisRunoff.name]);
    private constructor(private readonly data: GenesisRunoffType) {}

    static loadFromFilePathOrCreateNoRunoff(path: string): GenesisRunoff {
        // Si le fichier n'existe pas, retourner une instance vide
        if (!existsSync(path)) {
            return GenesisRunoff.noRunoff();
        }

        try {
            // Lire le fichier JSON
            GenesisRunoff.logger.debug(`Reading genesis runoff file from: ${path}`);
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
     * - If the vesting parameter is used, then the vesting should be defined.
     * - If a transfer includes a vesting, then it cannot be transferred.
     * - The total transferred by an account cannot exceed the total received by the account.
     * Note that vested received tokens are deducted from the total received as they are blocked by definition.
     *
     * Note: the issuer account is always defined and is implicitly initialized with 1 billion tokens.
     */
    areTransferValid(): boolean {
        const accountNames = new Set(this.data.accounts.map((acc) => acc.name));
        accountNames.add('issuer'); // Issuer is always defined

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
                return false;
            }

            // Check destination account is defined
            if (!accountNames.has(transfer.destination)) {
                return false;
            }

            // Check vesting is defined if used
            if (transfer.vesting !== undefined && !vestingNames.has(transfer.vesting)) {
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
                balances.set(
                    transfer.destination,
                    balances.get(transfer.destination) + transfer.amount,
                );
            }
        }

        // Second pass: check if accounts with vested tokens try to transfer
        for (const transfer of this.data.transfers) {
            if (vestedReceipts.has(transfer.source)) {
                return false;
            }

            // Deduct transferred amounts
            if (!balances.has(transfer.source)) {
                balances.set(transfer.source, 0);
            }
            balances.set(transfer.source, balances.get(transfer.source) - transfer.amount);
        }

        // Check that no account has negative balance
        for (const [account, balance] of balances.entries()) {
            if (balance < 0) {
                return false;
            }
        }

        return true;
    }

    getData(): GenesisRunoffType {
        return this.data;
    }
}