import { Utils } from "@cmts-dev/carmentis-sdk-core";

export class ModifiedAccounts {
    private readonly accounts: Set<string>;

    constructor() {
        this.accounts = new Set;
    }

    store(accountHash: Uint8Array) {
        this.accounts.add(Utils.binaryToHexa(accountHash));
    }

    snapshot(): Set<string> {
        return new Set(this.accounts);
    }

    restore(snapshot: Set<string>) {
        this.accounts.clear();
        for (const account of snapshot) this.accounts.add(account);
    }

    clear() {
        this.accounts.clear();
    }

    get() {
        return [...this.accounts].map((s) => Utils.binaryFromHexa(s));
    }
}
