import * as v from 'valibot';

const GenesisRunoffOrganizationSchema = v.object({
    id: v.string(),
    name: v.string(),
    website: v.string(),
    countryCode: v.string(),
    city: v.string(),
});

const GenesisRunoffNodeSchema = v.object({
    id: v.string(),
    publicKey: v.string(),
    rpcEndpoint: v.string(),
});

const GenesisRunoffVestingSchema = v.object({
    id: v.string(),
    cliffDurationInDays: v.number(),
    vestingDurationInDays: v.number(),
});

const GenesisRunoffAccountSchema = v.object({
    id: v.string(),
    publicKey: v.string(),
    privateKey: v.optional(v.string()),
});

const GenesisRunoffTokenIssuanceActionSchema = v.object({
    type: v.literal('tokenIssuance'),
    account: v.string(),
});

const GenesisRunoffProtocolCreationActionSchema = v.object({
    type: v.literal('protocolCreation'),
    organization: v.string(),
});

const GenesisRunoffOrganizationCreationActionSchema = v.object({
    type: v.literal('organizationCreation'),
    organization: v.string(),
    account: v.string(),
});

const GenesisRunoffNodeCreationActionSchema = v.object({
    type: v.literal('nodeCreation'),
    node: v.string(),
    organization: v.string(),
});

const GenesisRunoffStakingActionSchema = v.object({
    type: v.literal('staking'),
    node: v.string(),
    amount: v.number(),
});

const GenesisRunoffNodeApprovalActionSchema = v.object({
    type: v.literal('nodeApproval'),
    node: v.string(),
    account: v.string(),
});

const GenesisRunoffTransferActionSchema = v.object({
    type: v.literal('transfer'),
    source: v.string(),
    destination: v.string(),
    amount: v.number(),
    vesting: v.optional(v.string()),
});

const GenesisRunoffActionSchema = v.variant(
    'type', [
        GenesisRunoffTokenIssuanceActionSchema,
        GenesisRunoffProtocolCreationActionSchema,
        GenesisRunoffOrganizationCreationActionSchema,
        GenesisRunoffNodeCreationActionSchema,
        GenesisRunoffStakingActionSchema,
        GenesisRunoffNodeApprovalActionSchema,
        GenesisRunoffTransferActionSchema,
    ]
);

export const GenesisRunoffSchema = v.object({
    vesting: v.array(GenesisRunoffVestingSchema),
    accounts: v.array(GenesisRunoffAccountSchema),
    organizations: v.array(GenesisRunoffOrganizationSchema),
    nodes: v.array(GenesisRunoffNodeSchema),
    actions: v.array(GenesisRunoffActionSchema),
});

export type GenesisRunoffVestingType = v.InferOutput<typeof GenesisRunoffVestingSchema>;
export type GenesisRunoffAccountType = v.InferOutput<typeof GenesisRunoffAccountSchema>;
export type GenesisRunoffOrganizationType = v.InferOutput<typeof GenesisRunoffOrganizationSchema>;
export type GenesisRunoffNodeType = v.InferOutput<typeof GenesisRunoffNodeSchema>;
export type GenesisRunoffTokenIssuanceActionType = v.InferOutput<typeof GenesisRunoffTokenIssuanceActionSchema>;
export type GenesisRunoffProtocolCreationActionType = v.InferOutput<typeof GenesisRunoffProtocolCreationActionSchema>;
export type GenesisRunoffOrganizationCreationActionType = v.InferOutput<typeof GenesisRunoffOrganizationCreationActionSchema>;
export type GenesisRunoffNodeCreationActionType = v.InferOutput<typeof GenesisRunoffNodeCreationActionSchema>;
export type GenesisRunoffStakingActionType = v.InferOutput<typeof GenesisRunoffStakingActionSchema>;
export type GenesisRunoffNodeApprovalActionType = v.InferOutput<typeof GenesisRunoffNodeApprovalActionSchema>;
export type GenesisRunoffTransferActionType = v.InferOutput<typeof GenesisRunoffTransferActionSchema>;
export type GenesisRunoffActionType = v.InferOutput<typeof GenesisRunoffActionSchema>;
export type GenesisRunoffType = v.InferOutput<typeof GenesisRunoffSchema>;
