/**
 * Error messages used by AccountManager
 */
export const ErrorMessages = {
    UNDEFINED_FEES_PAYER: 'Undefined fees payer account',
    ACCOUNT_TYPE_NOT_ALLOWED: (accountType: string, transferType: string) =>
        `account of type '${accountType}' not allowed for transfer of type '${transferType}'`,
    INSUFFICIENT_FUNDS: (
        amount: number,
        tokenName: string,
        from: string,
        to: string,
        balance: number,
    ) =>
        `insufficient funds to transfer ${amount} ${tokenName} from ${from} to ${to}: the current payer balance is ${balance} ${tokenName}`,
    ACCOUNT_ALREADY_EXISTS: 'account already exists',
    INVALID_PAYEE: 'invalid payee',
    HISTORY_ENTRY_NOT_FOUND: 'Internal error: account history entry not found',
    PUBLIC_KEY_IN_USE: 'public key already in use',
    UNKNOWN_ACCOUNT_KEY_HASH: 'unknown account key hash',
    UNDEFINED_ACCOUNT_HASH: 'Cannot load information account: received undefined hash',
} as const;
