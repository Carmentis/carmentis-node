import { z } from 'zod';

const GenesisRunoffVestingSchema = z.object({
    name: z.string(),
    cliffPeriod: z.number(),
    vestingPeriod: z.number(),
});

const GenesisRunoffAccountSchema = z.object({
    name: z.string(),
    publicKey: z.string(),
});

const GenesisRunoffTransferSchema = z.object({
    source: z.string(),
    destination: z.string(),
    amount: z.number(),
    vesting: z.string().optional(),
});

export const GenesisRunoffSchema = z.object({
    vesting: z.array(GenesisRunoffVestingSchema),
    accounts: z.array(GenesisRunoffAccountSchema),
    transfers: z.array(GenesisRunoffTransferSchema),
});


export type GenesisRunoffVestingType = z.infer<typeof GenesisRunoffVestingSchema>;
export type GenesisRunoffAccountType = z.infer<typeof GenesisRunoffAccountSchema>;
export type GenesisRunoffTransferType = z.infer<typeof GenesisRunoffTransferSchema>;
export type GenesisRunoffType = z.infer<typeof GenesisRunoffSchema>;
