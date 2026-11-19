// Creation and publication of account, organization, application and application-ledger microblocks, processed by
// the GlobalStateUpdater through the same pipeline as FinalizeBlock (consistency checks + state update).
// NB: ./helpers/testState must be imported first (it loads LevelDb before CachedLevelDb, avoiding a circular import).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    TestNode, TestAccount, createTestNode, createIssuer, buildAccountCreation, applyMicroblock, balanceOf,
    blockFeesAccountId, stateFingerprint, REFERENCE_TIMESTAMP,
} from './helpers/testState';
import {
    CMTSToken, Hash, Microblock, Provider, Secp256k1PrivateSignatureKey, SectionType, Utils, VirtualBlockchainType,
} from '@cmts-dev/carmentis-sdk-core';
import { GlobalState } from '../../abci/state/GlobalState';

const CMTS = (n: number) => CMTSToken.createCMTS(n).getAmountAsAtomic();
const T0 = REFERENCE_TIMESTAMP;

let node: TestNode;
let issuer: TestAccount;
beforeEach(async () => {
    node = await createTestNode();
    issuer = await createIssuer(node);
});
afterEach(async () => { await node.cleanup(); });

// ---------------------------------------------------------------------------------------------------------------
// helpers

type Sections = Parameters<Microblock['addSections']>[0];

async function seal(mb: Microblock, payer: TestAccount, opts: { signWith?: TestAccount; timestamp?: number } = {}) {
    mb.setFeesPayerAccount(payer.id);
    mb.setTimestamp(opts.timestamp ?? T0);
    mb.setGasPrice(CMTSToken.createMilliToken(1));
    await mb.setGasAndSeal(node.state as unknown as Provider, (opts.signWith ?? payer).sk);
    return { serialized: new Uint8Array(mb.serialize().microblockData), id: mb.getHashAsBytes() };
}

/** builds a genesis microblock (of the type given by `create`) holding `sections`, paid and signed by `payer` */
async function genesis(create: () => Microblock, sections: Sections, payer: TestAccount, opts: { signWith?: TestAccount } = {}) {
    const mb = create();
    mb.addSections(sections);
    return seal(mb, payer, opts);
}

/** builds a microblock extending an existing virtual blockchain */
async function append(
    load: (id: Hash) => Promise<{ createMicroblock(): Promise<Microblock> }>,
    vbId: Uint8Array,
    sections: Sections,
    payer: TestAccount,
    opts: { signWith?: TestAccount } = {},
) {
    const vb = await load(Hash.from(vbId));
    const mb = await vb.createMicroblock();
    mb.addSections(sections);
    return seal(mb, payer, opts);
}

const loadOrg = (id: Hash) => node.state.loadOrganizationVirtualBlockchain(id);
const loadApp = (id: Hash) => node.state.loadApplicationVirtualBlockchain(id);
const loadLedger = (id: Hash) => node.state.loadApplicationLedgerVirtualBlockchain(id);

async function accepted(serialized: Uint8Array) {
    const result = await applyMicroblock(node, serialized);
    expect(result.error).toBeUndefined();
    expect(result.accepted).toBe(true);
}

async function rejected(serialized: Uint8Array, ids: Uint8Array[] = []) {
    const before = await stateFingerprint(node, ids);
    const result = await applyMicroblock(node, serialized);
    expect(result.accepted).toBe(false);
    expect(await stateFingerprint(node, ids)).toEqual(before);
    return result.error;
}

async function newAccount(amount = CMTS(10)) {
    const { serialized, account } = await buildAccountCreation(node, issuer, amount);
    await accepted(serialized);
    return account;
}

const orgSections = (account: TestAccount, name = 'ACME'): Sections => [
    { type: SectionType.ORG_CREATION, accountId: account.id },
    { type: SectionType.ORG_DESCRIPTION, name, website: 'https://acme.test', countryCode: 'FR', city: 'Paris' },
];
const appSections = (organizationId: Uint8Array, name = 'my app'): Sections => [
    { type: SectionType.APP_CREATION, organizationId },
    { type: SectionType.APP_DESCRIPTION, name, logoUrl: '', homepageUrl: '', description: 'an application' },
];

async function createOrganization(owner: TestAccount) {
    const { serialized, id } = await genesis(() => Microblock.createGenesisOrganizationMicroblock(), orgSections(owner), owner);
    await accepted(serialized);
    return id;
}

async function createApplication(owner: TestAccount, organizationId: Uint8Array) {
    const { serialized, id } = await genesis(() => Microblock.createGenesisApplicationMicroblock(), appSections(organizationId), owner);
    await accepted(serialized);
    return id;
}

// ---------------------------------------------------------------------------------------------------------------
describe('Account virtual blockchains', () => {
    it('an account creation microblock creates a funded account indexed by its public key', async () => {
        const { serialized, account, pk } = await buildAccountCreation(node, issuer, CMTS(5));
        await accepted(serialized);

        expect(await balanceOf(node, account.id)).toBe(CMTS(5));
        const byKey = await node.state.getAccountManager().loadAccountByPublicKey(pk);
        expect(Utils.binaryToHexa(byKey)).toBe(Utils.binaryToHexa(account.id));
        expect(await node.state.getAccountPublicKeyByAccountId(account.id)).toBeDefined();

        const vb = await node.state.loadAccountVirtualBlockchain(Hash.from(account.id));
        expect(vb.getHeight()).toBe(1);
    });

    it('the seller pays the amount and the fees, collected by the block fees account', async () => {
        const before = await balanceOf(node, issuer.id);
        const { serialized } = await buildAccountCreation(node, issuer, CMTS(5));
        await accepted(serialized);
        const fees = await balanceOf(node, blockFeesAccountId());
        expect(fees).toBeGreaterThan(0);
        expect(await balanceOf(node, issuer.id)).toBe(before - CMTS(5) - fees);
    });

    it('an account can be created with a zero balance', async () => {
        const account = await newAccount(0);
        expect(await balanceOf(node, account.id)).toBe(0);
    });

    it('the new account can then publish microblocks on its own virtual blockchain', async () => {
        const account = await newAccount(CMTS(10));
        const other = await newAccount(0);
        const { serialized } = await append(
            (id) => node.state.loadAccountVirtualBlockchain(id), account.id,
            [{ type: SectionType.ACCOUNT_TRANSFER, account: other.id, amount: CMTS(1), publicReference: 'ref', privateReference: '' }],
            account,
        );
        await accepted(serialized);
        expect(await balanceOf(node, other.id)).toBe(CMTS(1));
        expect((await node.state.loadAccountVirtualBlockchain(Hash.from(account.id))).getHeight()).toBe(2);
    });

    it('rejects an account creation without ACCOUNT_PUBLIC_KEY section', async () => {
        const { serialized } = await genesis(
            () => Microblock.createGenesisAccountMicroblock(),
            [{ type: SectionType.ACCOUNT_CREATION, amount: CMTS(1), sellerAccount: issuer.id }],
            issuer,
        );
        await rejected(serialized, [issuer.id]);
    });

    it('rejects an account creation without ACCOUNT_CREATION section (no seller)', async () => {
        const sk = Secp256k1PrivateSignatureKey.gen();
        const pk = await sk.getPublicKey();
        const { serialized } = await genesis(
            () => Microblock.createGenesisAccountMicroblock(),
            [{ type: SectionType.ACCOUNT_PUBLIC_KEY, publicKey: await pk.getPublicKeyAsBytes(), schemeId: pk.getSignatureSchemeId() }],
            issuer,
        );
        await rejected(serialized, [issuer.id]);
    });

    it('rejects a second ACCOUNT_CREATION on an existing account', async () => {
        const account = await newAccount(CMTS(5));
        const { serialized } = await append(
            (id) => node.state.loadAccountVirtualBlockchain(id), account.id,
            [{ type: SectionType.ACCOUNT_CREATION, amount: CMTS(1), sellerAccount: account.id }],
            account,
        );
        await rejected(serialized, [account.id]);
    });

    it('rejects a microblock written on an account by someone else', async () => {
        const account = await newAccount(CMTS(5));
        const stranger = await newAccount(CMTS(5));
        const { serialized } = await append(
            (id) => node.state.loadAccountVirtualBlockchain(id), account.id,
            [{ type: SectionType.ACCOUNT_TRANSFER, account: stranger.id, amount: CMTS(1), publicReference: '', privateReference: '' }],
            stranger,
        );
        await rejected(serialized, [account.id, stranger.id]);
    });
});

// ---------------------------------------------------------------------------------------------------------------
describe('Organization virtual blockchains', () => {
    it('creates an organization attached to the account of its creator', async () => {
        const owner = await newAccount();
        const orgId = await createOrganization(owner);

        const org = await loadOrg(Hash.from(orgId));
        expect(org.getHeight()).toBe(1);
        expect(Utils.binaryToHexa(org.getAccountId().toBytes())).toBe(Utils.binaryToHexa(owner.id));
        expect(org.getType()).toBe(VirtualBlockchainType.ORGANIZATION_VIRTUAL_BLOCKCHAIN);
    });

    it('the creator pays the fees of the organization creation', async () => {
        const owner = await newAccount();
        const before = await balanceOf(node, owner.id);
        await createOrganization(owner);
        const after = await balanceOf(node, owner.id);
        expect(after).toBeLessThan(before);
        expect(before - after).toBeGreaterThan(0);
    });

    it('the description can be updated by the owner', async () => {
        const owner = await newAccount();
        const orgId = await createOrganization(owner);
        const { serialized } = await append(loadOrg, orgId, [
            { type: SectionType.ORG_DESCRIPTION, name: 'ACME 2', website: '', countryCode: 'FR', city: 'Lyon' },
        ], owner);
        await accepted(serialized);
        expect((await loadOrg(Hash.from(orgId))).getHeight()).toBe(2);
    });

    it('the description cannot be updated by a stranger', async () => {
        const owner = await newAccount();
        const stranger = await newAccount();
        const orgId = await createOrganization(owner);
        const { serialized } = await append(loadOrg, orgId, [
            { type: SectionType.ORG_DESCRIPTION, name: 'hijacked', website: '', countryCode: 'FR', city: 'Lyon' },
        ], stranger);
        await rejected(serialized, [owner.id, stranger.id]);
    });

    it('rejects an organization creation without ORG_CREATION section', async () => {
        const owner = await newAccount();
        const { serialized } = await genesis(() => Microblock.createGenesisOrganizationMicroblock(), [
            { type: SectionType.ORG_DESCRIPTION, name: 'x', website: '', countryCode: 'FR', city: 'Paris' },
        ], owner);
        await rejected(serialized, [owner.id]);
    });

    it('rejects an organization attached to an account that does not exist', async () => {
        const owner = await newAccount();
        const { serialized } = await genesis(() => Microblock.createGenesisOrganizationMicroblock(), [
            { type: SectionType.ORG_CREATION, accountId: new Uint8Array(32).fill(3) },
            { type: SectionType.ORG_DESCRIPTION, name: 'x', website: '', countryCode: 'FR', city: 'Paris' },
        ], owner);
        await rejected(serialized, [owner.id]);
    });

    it('an organization cannot be created in the name of another existing account', async () => {
        const victim = await newAccount();
        const attacker = await newAccount();
        const { serialized } = await genesis(() => Microblock.createGenesisOrganizationMicroblock(),
            orgSections(victim), attacker);
        await rejected(serialized, [victim.id, attacker.id]);
    });
});

// ---------------------------------------------------------------------------------------------------------------
describe('Application virtual blockchains', () => {
    it('creates an application attached to an organization', async () => {
        const owner = await newAccount();
        const orgId = await createOrganization(owner);
        const appId = await createApplication(owner, orgId);

        const app = await loadApp(Hash.from(appId));
        expect(app.getHeight()).toBe(1);
        expect(app.getType()).toBe(VirtualBlockchainType.APPLICATION_VIRTUAL_BLOCKCHAIN);
        expect(Utils.binaryToHexa(app.getOrganizationId().toBytes())).toBe(Utils.binaryToHexa(orgId));
        expect((await app.getApplicationDescription() as any).name).toBe('my app');
    });

    it('the description can be updated by the owner of the organization', async () => {
        const owner = await newAccount();
        const appId = await createApplication(owner, await createOrganization(owner));
        const { serialized } = await append(loadApp, appId, [
            { type: SectionType.APP_DESCRIPTION, name: 'renamed', logoUrl: '', homepageUrl: '', description: '' },
        ], owner);
        await accepted(serialized);
        expect(((await (await loadApp(Hash.from(appId))).getApplicationDescription()) as any).name).toBe('renamed');
    });

    it('the description cannot be updated by a stranger', async () => {
        const owner = await newAccount();
        const stranger = await newAccount();
        const appId = await createApplication(owner, await createOrganization(owner));
        const { serialized } = await append(loadApp, appId, [
            { type: SectionType.APP_DESCRIPTION, name: 'hijacked', logoUrl: '', homepageUrl: '', description: '' },
        ], stranger);
        await rejected(serialized, [owner.id, stranger.id]);
    });

    it('rejects an application attached to an organization that does not exist', async () => {
        const owner = await newAccount();
        const { serialized } = await genesis(() => Microblock.createGenesisApplicationMicroblock(),
            appSections(new Uint8Array(32).fill(4)), owner);
        await rejected(serialized, [owner.id]);
    });

    it('a stranger cannot create an application inside someone else\'s organization', async () => {
        const owner = await newAccount();
        const stranger = await newAccount();
        const orgId = await createOrganization(owner);
        const { serialized } = await genesis(() => Microblock.createGenesisApplicationMicroblock(),
            appSections(orgId), stranger);
        await rejected(serialized, [owner.id, stranger.id]);
    });

    it('rejects an application creation without APP_CREATION section', async () => {
        const owner = await newAccount();
        const { serialized } = await genesis(() => Microblock.createGenesisApplicationMicroblock(), [
            { type: SectionType.APP_DESCRIPTION, name: 'x', logoUrl: '', homepageUrl: '', description: '' },
        ], owner);
        await rejected(serialized, [owner.id]);
    });
});

// ---------------------------------------------------------------------------------------------------------------
describe('Application ledger virtual blockchains', () => {
    async function setup() {
        const owner = await newAccount();
        const orgId = await createOrganization(owner);
        const appId = await createApplication(owner, orgId);
        return { owner, orgId, appId };
    }

    const ledgerCreation = (appId: Uint8Array): Sections => [{ type: SectionType.APP_LEDGER_CREATION, applicationId: appId }];

    async function createLedger(owner: TestAccount, appId: Uint8Array, extra: Sections = []) {
        const { serialized, id } = await genesis(() => Microblock.createGenesisApplicationLedgerMicroblock(),
            [...ledgerCreation(appId), ...extra], owner);
        await accepted(serialized);
        return id;
    }

    it('creates an application ledger attached to an application', async () => {
        const { owner, appId } = await setup();
        const ledgerId = await createLedger(owner, appId);
        const ledger = await loadLedger(Hash.from(ledgerId));
        expect(ledger.getHeight()).toBe(1);
        expect(ledger.getType()).toBe(VirtualBlockchainType.APP_LEDGER_VIRTUAL_BLOCKCHAIN);
    });

    it('the creator pays the fees and the microblock is stored with its size and sections', async () => {
        const { owner, appId } = await setup();
        const before = await balanceOf(node, owner.id);
        const feesBefore = await balanceOf(node, blockFeesAccountId());
        const ledgerId = await createLedger(owner, appId);
        expect(await balanceOf(node, owner.id)).toBeLessThan(before);
        expect(await balanceOf(node, blockFeesAccountId())).toBeGreaterThan(feesBefore);
        expect(await node.state.getFullSerializedMicroblock(Hash.from(ledgerId))).not.toBeNull();
    });

    it('rejects an application ledger attached to an application that does not exist', async () => {
        const { owner } = await setup();
        const { serialized } = await genesis(() => Microblock.createGenesisApplicationLedgerMicroblock(),
            ledgerCreation(new Uint8Array(32).fill(6)), owner);
        await rejected(serialized, [owner.id]);
    });

    it('rejects an application ledger creation without APP_LEDGER_CREATION section', async () => {
        const { owner } = await setup();
        const { serialized } = await genesis(() => Microblock.createGenesisApplicationLedgerMicroblock(), [
            { type: SectionType.APP_LEDGER_ACTOR_CREATION, id: 0, actorType: 0, name: 'alice' },
        ], owner);
        await rejected(serialized, [owner.id]);
    });

    it('rejects a second APP_LEDGER_CREATION in an existing ledger', async () => {
        const { owner, appId } = await setup();
        const ledgerId = await createLedger(owner, appId);
        const { serialized } = await append(loadLedger, ledgerId, ledgerCreation(appId), owner);
        await rejected(serialized, [owner.id]);
    });

    it('the owner publishes actors, channels and data in a ledger', async () => {
        const { owner, appId } = await setup();
        const ledgerId = await createLedger(owner, appId);
        const { serialized } = await append(loadLedger, ledgerId, [
            { type: SectionType.APP_LEDGER_ACTOR_CREATION, id: 0, actorType: 0, name: 'alice' },
            { type: SectionType.APP_LEDGER_CHANNEL_CREATION, id: 0, isPrivate: false, creatorId: 0, name: 'public' },
            { type: SectionType.APP_LEDGER_PUBLIC_CHANNEL_DATA, channelId: 0, data: new Uint8Array([1, 2, 3]) },
        ], owner);
        await accepted(serialized);
        expect((await loadLedger(Hash.from(ledgerId))).getHeight()).toBe(2);
    });

    const publication = (n = 0): Sections => [
        { type: SectionType.APP_LEDGER_ACTOR_CREATION, id: n, actorType: 0, name: `actor-${n}` },
    ];

    it('a stranger cannot publish in a ledger', async () => {
        const { owner, appId } = await setup();
        const stranger = await newAccount();
        const ledgerId = await createLedger(owner, appId);
        const { serialized } = await append(loadLedger, ledgerId, publication(), stranger);
        await rejected(serialized, [owner.id, stranger.id]);
    });

    it('a writer authorized by the owner can publish, and a stranger still cannot', async () => {
        const { owner, appId } = await setup();
        const writer = await newAccount();
        const stranger = await newAccount();
        const ledgerId = await createLedger(owner, appId);

        // not allowed yet
        await rejected((await append(loadLedger, ledgerId, publication(0), writer)).serialized, [owner.id, writer.id]);

        // the owner authorizes the writer
        await accepted((await append(loadLedger, ledgerId, [
            { type: SectionType.ALLOWED_ADDITIONAL_WRITER, allowedWriterAccountId: writer.id },
        ], owner)).serialized);

        // the writer publishes (and pays the fees)
        const writerBefore = await balanceOf(node, writer.id);
        const ownerBefore = await balanceOf(node, owner.id);
        await accepted((await append(loadLedger, ledgerId, publication(0), writer)).serialized);
        expect(await balanceOf(node, writer.id)).toBeLessThan(writerBefore);
        expect(await balanceOf(node, owner.id)).toBe(ownerBefore);
        expect((await loadLedger(Hash.from(ledgerId))).getHeight()).toBe(3);

        // other accounts remain excluded
        await rejected((await append(loadLedger, ledgerId, publication(1), stranger)).serialized, [stranger.id]);
    });

    it('microblocks are chained: a replayed or out-of-order publication is rejected', async () => {
        const { owner, appId } = await setup();
        const ledgerId = await createLedger(owner, appId);
        const first = await append(loadLedger, ledgerId, publication(0), owner);
        await accepted(first.serialized);
        await rejected(first.serialized, [owner.id]);
    });

    it('a publication whose fees payer cannot pay is rejected and leaves the ledger unchanged', async () => {
        const { owner, appId } = await setup();
        const poor = await newAccount(0);
        const ledgerId = await createLedger(owner, appId);
        await accepted((await append(loadLedger, ledgerId, [
            { type: SectionType.ALLOWED_ADDITIONAL_WRITER, allowedWriterAccountId: poor.id },
        ], owner)).serialized);
        await rejected((await append(loadLedger, ledgerId, publication(0), poor)).serialized, [poor.id, owner.id]);
        expect((await loadLedger(Hash.from(ledgerId))).getHeight()).toBe(2);
    });

    it('committed organization, application and ledger virtual blockchains are readable from a fresh state', async () => {
        const { owner, orgId, appId } = await setup();
        const ledgerId = await createLedger(owner, appId);
        await accepted((await append(loadLedger, ledgerId, publication(0), owner)).serialized);
        await node.state.commit();

        const fresh = new GlobalState(node.db, node.storage);
        expect((await fresh.loadOrganizationVirtualBlockchain(Hash.from(orgId))).getHeight()).toBe(1);
        expect((await fresh.loadApplicationVirtualBlockchain(Hash.from(appId))).getHeight()).toBe(1);
        expect((await fresh.loadApplicationLedgerVirtualBlockchain(Hash.from(ledgerId))).getHeight()).toBe(2);
    });
});
