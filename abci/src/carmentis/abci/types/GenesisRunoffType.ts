import { z } from 'zod';

const VestingSchema = z.object({
    name: z.string(),
    cliffPeriod: z.number(),
    vestingPeriod: z.number(),
});

const AccountSchema = z.object({
    name: z.string(),
    publicKey: z.string(),
    amount: z.number(),
    origin: z.string(),
    vesting: z.string().optional(),
});

export const GenesisRunoffSchema = z.object({
    vesting: z.array(VestingSchema),
    accounts: z.array(AccountSchema),
});

export type GenesisRunoffType = z.infer<typeof GenesisRunoffSchema>;
