import * as v from 'valibot';
import { uint8array } from '../db/db';

export const AccountHistoryEntrySchema = v.object({
    height: v.number(),
    previousHistoryHash: uint8array(),
    type: v.number(),
    timestamp: v.number(),
    linkedAccount: uint8array(),
    amount: v.number(),
    chainReference: uint8array(),
});
export type AccountHistoryEntry = v.InferOutput<typeof AccountHistoryEntrySchema>;
