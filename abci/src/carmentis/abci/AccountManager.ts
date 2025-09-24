import { NODE_SCHEMAS } from './constants/constants';

import { Crypto, ECO, Economics, SchemaSerializer, Utils } from '@cmts-dev/carmentis-sdk/server';
import { AccountInformation } from './types/AccountInformation';

interface Transfer {
    type: number;
    payerAccount: Uint8Array | null;
    payeeAccount: Uint8Array | null;
    amount: number;
}

export class AccountManager {
    db: any;
    radix: any;

    constructor(db: any, radix: any) {
        this.db = db;
        this.radix = radix;
    }

    async tokenTransfer(transfer: Transfer, chainReference: any, timestamp: number, logger: any) {
        const accountCreation =
            transfer.type == ECO.BK_SENT_ISSUANCE || transfer.type == ECO.BK_SALE;
        let payeeBalance;
        let payerBalance;

        const shortPayerAccountString = this.getShortAccountString(transfer.payerAccount);
        const shortPayeeAccountString = this.getShortAccountString(transfer.payeeAccount);

        if (transfer.payerAccount === null) {
            payerBalance = null;
        } else {
            const payerInfo = await this.loadInformation(transfer.payerAccount);

            if (!Economics.isAllowedTransfer(payerInfo.type, transfer.type)) {
                throw `account of type '${ECO.ACCOUNT_NAMES[payerInfo.type]}' not allowed for transfer of type '${ECO.BK_NAMES[transfer.type]}'`;
            }

            payerBalance = payerInfo.state.balance;

            if (payerBalance < transfer.amount) {
                throw (
                  `insufficient funds to transfer ${transfer.amount / ECO.TOKEN} ${ECO.TOKEN_NAME} ` +
                  `from ${shortPayerAccountString} to ${shortPayeeAccountString}: ` +
                  `the current payer balance is ${payerBalance / ECO.TOKEN} ${ECO.TOKEN_NAME}`
                );
            }
        }

        if (transfer.payeeAccount === null) {
            payeeBalance = null;
        } else {
            const payeeInfo = await this.loadInformation(transfer.payeeAccount);

            if (!Economics.isAllowedTransfer(payeeInfo.type, transfer.type ^ ECO.BK_PLUS)) {
                throw `account of type ${ECO.ACCOUNT_NAMES[payeeInfo.type]} not allowed for transfer of type '${ECO.BK_NAMES[transfer.type ^ ECO.BK_PLUS]}'`;
            }

            if (accountCreation) {
                if (payeeInfo.exists) {
                    throw `account already exists`;
                }
            } else {
                if (!payeeInfo.exists) {
                    throw `invalid payee`;
                }
            }

            payeeBalance = payeeInfo.state.balance;
        }

        if (payerBalance !== null) {
            await this.update(
                transfer.type,
                transfer.payerAccount,
                transfer.payeeAccount,
                transfer.amount,
                chainReference,
                timestamp,
            );
        }

        if (payeeBalance !== null) {
            await this.update(
                transfer.type ^ 1,
                transfer.payeeAccount,
                transfer.payerAccount,
                transfer.amount,
                chainReference,
                timestamp,
            );
        }

        logger.log(
            `${transfer.amount / ECO.TOKEN} ${ECO.TOKEN_NAME} transferred from ${shortPayerAccountString} to ${shortPayeeAccountString} (${ECO.BK_NAMES[transfer.type]})`,
        );
    }

    async loadInformation(accountHash: Uint8Array): Promise<AccountInformation> {
        const type = Economics.getAccountTypeFromIdentifier(accountHash);
        let state = await this.db.getObject(NODE_SCHEMAS.DB_ACCOUNT_STATE, accountHash);
        const exists = !!state;

        if (!exists) {
            state = {
                height: 0,
                balance: 0,
                lastHistoryHash: Utils.getNullHash(),
            };
        }

        return {
            exists: exists || type != ECO.ACCOUNT_STANDARD,
            type,
            state,
        };
    }

    async update(
        type: any,
        accountHash: any,
        linkedAccountHash: any,
        amount: any,
        chainReference: any,
        timestamp: any,
    ) {
        const state = (await this.loadInformation(accountHash)).state;

        state.height++;
        state.balance += type & ECO.BK_PLUS ? amount : -amount;
        state.lastHistoryHash = await this.addHistoryEntry(
            state,
            type,
            accountHash,
            linkedAccountHash,
            amount,
            chainReference,
            timestamp,
        );

        const record = this.db.serialize(NODE_SCHEMAS.DB_ACCOUNT_STATE, state);
        const stateHash = Crypto.Hashes.sha256AsBinary(record);

        await this.radix.set(accountHash, stateHash);

        await this.db.putRaw(NODE_SCHEMAS.DB_ACCOUNT_STATE, accountHash, record);
    }

    async loadHistory(accountHash: any, lastHistoryHash: any, maxRecords: any) {
        let historyHash = lastHistoryHash;
        const list = [];

        while (maxRecords-- && !Utils.binaryIsEqual(historyHash, Utils.getNullHash())) {
            const entry = await this.loadHistoryEntry(accountHash, historyHash);

            list.push(entry);
            historyHash = entry.previousHistoryHash;
        }

        return { list };
    }

    async loadHistoryEntry(accountHash: any, historyHash: any) {
        const entry = await this.db.getObject(NODE_SCHEMAS.DB_ACCOUNT_HISTORY, historyHash);

        if (!entry) {
            throw `Internal error: account history entry not found`;
        }

        return entry;
    }

    async addHistoryEntry(
        state: any,
        type: number,
        accountHash: any,
        linkedAccountHash: any,
        amount: any,
        chainReference: any,
        timestamp: any,
    ) {
        const serializer = new SchemaSerializer(
            NODE_SCHEMAS.ACCOUNT_REF_SCHEMAS[ECO.BK_REFERENCES[type]],
        );
        const chainReferenceBinary = serializer.serialize(chainReference);

        const entry = {
            height: state.height,
            previousHistoryHash: state.lastHistoryHash,
            type: type,
            timestamp: timestamp,
            linkedAccount: linkedAccountHash || Utils.getNullHash(),
            amount: amount,
            chainReference: chainReferenceBinary,
        };

        const record = this.db.serialize(NODE_SCHEMAS.DB_ACCOUNT_HISTORY, entry);
        const hash = this.getHistoryEntryHash(accountHash, Crypto.Hashes.sha256AsBinary(record));

        await this.db.putRaw(NODE_SCHEMAS.DB_ACCOUNT_HISTORY, hash, record);

        return hash;
    }

    getHistoryEntryHash(accountHash: any, recordHash: any) {
        return Crypto.Hashes.sha256AsBinary(Utils.binaryFrom(accountHash, recordHash));
    }

    async testPublicKeyAvailability(publicKey: Uint8Array) {
        const keyHash = Crypto.Hashes.sha256AsBinary(publicKey);

        const accountHash = await this.db.getRaw(NODE_SCHEMAS.DB_ACCOUNT_BY_PUBLIC_KEY, keyHash);

        if (accountHash) {
            throw `public key already in use`;
        }
    }

    async saveAccountByPublicKey(accountHash: Uint8Array, publicKey: Uint8Array) {
        const keyHash = Crypto.Hashes.sha256AsBinary(publicKey);

        await this.db.putRaw(NODE_SCHEMAS.DB_ACCOUNT_BY_PUBLIC_KEY, keyHash, accountHash);
    }

    async loadAccountByPublicKeyHash(keyHash: Uint8Array) {
        const accountHash = await this.db.getRaw(NODE_SCHEMAS.DB_ACCOUNT_BY_PUBLIC_KEY, keyHash);

        if (!accountHash) {
            throw `unknown account key hash`;
        }

        return accountHash;
    }

    getShortAccountString(account: Uint8Array | null): string {
        return account === null
            ? 'NULL'
            : Utils.truncateStringMiddle(Utils.binaryToHexa(account), 8, 4);
    }
}
