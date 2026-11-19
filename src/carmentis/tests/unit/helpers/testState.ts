import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
    CMTSToken,
    ECO,
    Hash,
    Economics,
    Microblock,
    MicroblockConsistencyChecker,
    PrivateSignatureKey,
    Provider,
    Secp256k1PrivateSignatureKey,
    Section,
    SectionType,
    Utils,
} from '@cmts-dev/carmentis-sdk-core';
import { LevelDb } from '../../../abci/database/LevelDb';
import { Storage } from '../../../abci/storage/Storage';
import { GlobalState } from '../../../abci/state/GlobalState';
import { GlobalStateUpdater } from '../../../abci/state/GlobalStateUpdater';

export interface TestNode {
    db: LevelDb;
    storage: Storage;
    state: GlobalState;
    updater: GlobalStateUpdater;
    cleanup(): Promise<void>;
}

/** Creates an opened LevelDb + Storage on a temporary directory, wrapped in a GlobalState. */
export async function createTestNode(): Promise<TestNode> {
    const dir = await mkdtemp(join(tmpdir(), 'node-test-'));
    const db = new LevelDb(join(dir, 'db'));
    db.initialize();
    await db.open();
    const storage = new Storage(db, join(dir, 'storage'));
    return {
        db,
        storage,
        state: new GlobalState(db, storage),
        updater: GlobalStateUpdater.createUpdater(),
        async cleanup() {
            await db.close();
            await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
        },
    };
}

export interface TestAccount {
    id: Uint8Array;
    sk: PrivateSignatureKey;
    /** serialized genesis microblock (only for issuers), so that it can be replayed on another node */
    genesis?: Uint8Array;
}

/**
 * Creates a funded issuer account the way genesis does: a token-issuance account microblock processed
 * through updateGlobalStateOnMicroblockDuringGenesis. The account id is the genesis microblock hash.
 */
export async function createIssuer(node: TestNode): Promise<TestAccount> {
    const sk = Secp256k1PrivateSignatureKey.gen();
    const pk = await sk.getPublicKey();
    const mb = Microblock.createGenesisAccountMicroblock();
    mb.addSections([
        {
            type: SectionType.ACCOUNT_PUBLIC_KEY,
            publicKey: await pk.getPublicKeyAsBytes(),
            schemeId: pk.getSignatureSchemeId(),
        },
        {
            type: SectionType.ACCOUNT_TOKEN_ISSUANCE,
            amount: ECO.INITIAL_OFFER,
        },
    ]);
    mb.setTimestamp(REFERENCE_TIMESTAMP);
    await mb.seal(sk);
    const { microblockData, microblockHash } = mb.serialize();
    const genesis = new Uint8Array(microblockData);
    await applyGenesisMicroblock(node, genesis);
    return { id: new Uint8Array(microblockHash), sk, genesis };
}

/** Applies a serialized genesis-mode microblock (no gas checks, no fees), as the genesis block does. */
export async function applyGenesisMicroblock(node: TestNode, serialized: Uint8Array) {
    const parsed = Microblock.loadFromSerializedMicroblock(serialized);
    const checker = new MicroblockConsistencyChecker(node.state, parsed);
    await checker.checkVirtualBlockchainConsistencyOrFail();
    checker.checkTimestampOrFail(REFERENCE_TIMESTAMP);
    await node.updater.updateGlobalStateOnMicroblockDuringGenesis(
        node.state,
        checker.getVirtualBlockchain(),
        parsed,
        cometParameters(1),
        serialized,
    );
}

export const REFERENCE_TIMESTAMP = Math.floor(Date.parse('2026/06/01 12:00') / 1000);

export function cometParameters(blockHeight = 2, blockTimestamp = REFERENCE_TIMESTAMP) {
    return { blockHeight, blockTimestamp, blockMisbehaviors: [] };
}

export interface BuildOptions {
    timestamp?: number;
    /** override of the fees payer (undefined = payer account, null = no fees payer) */
    feesPayer?: Uint8Array | null;
    /** key used to seal the microblock (default: the payer's key) */
    signWith?: PrivateSignatureKey;
    /** declared gas (default: computed by the node) */
    gas?: number;
    gasPriceInMilliTokens?: number;
}

async function sealWith(node: TestNode, mb: Microblock, payer: TestAccount, opts: BuildOptions) {
    if (opts.feesPayer !== null) mb.setFeesPayerAccount(opts.feesPayer ?? payer.id);
    mb.setTimestamp(opts.timestamp ?? REFERENCE_TIMESTAMP);
    mb.setGasPrice(CMTSToken.createMilliToken(opts.gasPriceInMilliTokens ?? 1));
    const signer = opts.signWith ?? payer.sk;
    if (opts.gas !== undefined) {
        mb.setGas(opts.gas);
        await mb.seal(signer);
    } else {
        await mb.setGasAndSeal(node.state as unknown as Provider, signer);
    }
    return new Uint8Array(mb.serialize().microblockData);
}

/**
 * Builds a sealed microblock creating a new account funded by `seller`.
 * The returned account id is the hash of the genesis microblock.
 */
export async function buildAccountCreation(
    node: TestNode,
    seller: TestAccount,
    amountInAtomics: number,
    opts: BuildOptions & { sellerAccount?: Uint8Array; publicKeyOf?: PrivateSignatureKey } = {},
) {
    const sk = opts.publicKeyOf ?? Secp256k1PrivateSignatureKey.gen();
    const pk = await sk.getPublicKey();
    const mb = Microblock.createGenesisAccountMicroblock();
    mb.addSections([
        {
            type: SectionType.ACCOUNT_PUBLIC_KEY,
            publicKey: await pk.getPublicKeyAsBytes(),
            schemeId: pk.getSignatureSchemeId(),
        },
        {
            type: SectionType.ACCOUNT_CREATION,
            amount: amountInAtomics,
            sellerAccount: opts.sellerAccount ?? seller.id,
        },
    ]);
    const serialized = await sealWith(node, mb, seller, opts);
    const account: TestAccount = { id: mb.getHashAsBytes(), sk };
    return { serialized, account, pk };
}

/**
 * Builds a microblock extending the account virtual blockchain `vbOwner` with the given sections.
 * By default the owner pays the fees and signs; use opts.feesPayer / opts.signWith for another account.
 */
export async function buildOnAccount(
    node: TestNode,
    vbOwner: Uint8Array,
    sections: Section[],
    payer: TestAccount,
    opts: BuildOptions = {},
) {
    const vb = await node.state.loadAccountVirtualBlockchain(Hash.from(vbOwner));
    const mb = await vb.createMicroblock();
    mb.addSections(sections);
    return sealWith(node, mb, payer, opts);
}

/**
 * Builds a microblock extending the account virtual blockchain of `from`, with one ACCOUNT_TRANSFER
 * section per entry of `transfers`.
 */
export async function buildTransfers(
    node: TestNode,
    from: TestAccount,
    transfers: { to: Uint8Array; amountInAtomics: number }[],
    opts: BuildOptions = {},
) {
    return buildOnAccount(node, from.id, transfers.map((t) => ({
        type: SectionType.ACCOUNT_TRANSFER,
        account: t.to,
        amount: t.amountInAtomics,
        publicReference: '',
        privateReference: '',
    })), from, opts);
}

/**
 * Mirrors the per-transaction logic of AbciService.FinalizeBlock: consistency checks followed by the
 * global state update. Returns accepted=false (with the error) instead of throwing.
 */
export async function applyMicroblock(
    node: TestNode,
    serialized: Uint8Array,
    params = cometParameters(),
): Promise<{ accepted: boolean; error?: string }> {
    try {
        const mb = Microblock.loadFromSerializedMicroblock(serialized);
        const checker = new MicroblockConsistencyChecker(node.state, mb);
        await checker.checkVirtualBlockchainConsistencyOrFail();
        checker.checkTimestampOrFail(params.blockTimestamp);
        await checker.checkGasOrFail(params.blockTimestamp);
        await node.updater.updateGlobalStateOnMicroblock(
            node.state,
            checker.getVirtualBlockchain(),
            mb,
            params,
            serialized,
        );
        return { accepted: true };
    } catch (e) {
        return { accepted: false, error: e instanceof Error ? e.message : String(e) };
    }
}

export async function balanceOf(node: TestNode, accountId: Uint8Array): Promise<number> {
    return (await node.state.getAccountManager().getAccountBalanceByAccountId(accountId)).getAmountAsAtomic();
}

export function blockFeesAccountId() {
    return Economics.getSpecialAccountTypeIdentifier(ECO.ACCOUNT_BLOCK_FEES);
}

/** Fingerprint of the consensus-relevant working state, to compare states before and after an operation. */
export async function stateFingerprint(node: TestNode, accountIds: Uint8Array[]) {
    const balances = await Promise.all(accountIds.map((id) => balanceOf(node, id)));
    const hashes = await node.state.getApplicationStateHashes();
    return {
        balances,
        modifiedAccounts: node.state.getAccountManager().getModifiedAccounts().map((a) => Utils.binaryToHexa(a)).sort(),
        tokenRadix: Utils.binaryToHexa(hashes.tokenRadixHash),
        vbRadix: Utils.binaryToHexa(hashes.vbRadixHash),
        appHash: Utils.binaryToHexa(hashes.appHash),
    };
}

export { Utils };
