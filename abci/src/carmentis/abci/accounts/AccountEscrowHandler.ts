import { AccountStateManager } from './AccountStateManager';
import { LevelDbTable } from '../database/LevelDbTable';
import { Transfer } from './AccountManager';
import { ECO, LockType, Utils } from '@cmts-dev/carmentis-sdk/server';
import { AccountTokenTransferHandler } from './AccountTokenTransferHandler';
import { DbInterface } from '../database/DbInterface';

export class AccountEscrowHandler {

    private readonly db: DbInterface;
    constructor(
        private readonly accountStateManager: AccountStateManager,
        private readonly accountTokenTransferHandler: AccountTokenTransferHandler,
    ) {
        this.db = accountStateManager.getDatabase();
    }

    /**
     * Processes the settlement of an escrow by the agent. It may be either confirmed or canceled.
     */
    async escrowSettlement(
        account: Uint8Array,
        escrowIdentifier: Uint8Array,
        confirmed: boolean,
        timestamp: number,
        chainReference: unknown,
    ) {
        const escrow = await this.db.getEscrow(escrowIdentifier);

        // make sure that this escrow exists
        if (escrow === undefined) {
            throw new Error(`rejected escrow settlement: unknown or out-of-date escrow identifier`);
        }
        // make sure that the caller is the agent
        if (!Utils.binaryIsEqual(account, escrow.agentAccount)) {
            throw new Error(`rejected escrow settlement: caller is not the agent`);
        }

        // retrieve the lock from the payee account, get the amount, then remove the lock
        const accountInformation = await this.accountStateManager.loadAccountInformation(escrow.payeeAccount);
        const payeeAccountState = accountInformation.state;
        const lockIndex = payeeAccountState.locks.findIndex(
            (lock) =>
                lock.type == LockType.Escrow &&
                Utils.binaryIsEqual(lock.parameters.escrowIdentifier, escrowIdentifier),
        );

        if (lockIndex === -1) {
            throw new Error(`PANIC - unable to find the lock of the escrow to be settled`);
        }

        const amount = payeeAccountState.locks[lockIndex].lockedAmountInAtomics;

        payeeAccountState.locks.splice(lockIndex, 1);

        await this.accountStateManager.saveAccountState(escrow.payeeAccount, payeeAccountState);

        // if the escrow is canceled, send the funds back to the payer
        if (!confirmed) {
            const tokenTransfer: Transfer = {
                type: ECO.BK_SENT_ESCROW_REFUND,
                payerAccount: escrow.payeeAccount,
                payeeAccount: escrow.payerAccount,
                amount,
            };

            await this.accountTokenTransferHandler.tokenTransfer(
                tokenTransfer,
                chainReference,
                timestamp,
            );
        }

        // remove the escrow from the DB
        await this.db.del(LevelDbTable.ESCROWS, escrowIdentifier);
    }
}