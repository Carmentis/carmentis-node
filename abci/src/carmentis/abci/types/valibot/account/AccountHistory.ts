import * as v from 'valibot';
import { AccountHistoryEntrySchema } from './AccountHistoryEntry';

export const AccountHistorySchema = v.object({
    list: v.array(AccountHistoryEntrySchema),
});
export type AccountHistory = v.InferOutput<typeof AccountHistorySchema>;
