import { CachedLevelDb } from '../database/CachedLevelDb';
import { Storage } from '../storage/Storage';
import { AccountManager } from '../accounts/AccountManager';
import { RadixTree } from '../radixTree/RadixTree';
import { Provider } from '@cmts-dev/carmentis-sdk-core';
import { CachedStorage } from '../storage/CachedStorage';
import { ValidatorSetUpdate } from './ValidatorSetUpdate';

/**
 * Context represents the cached state used during transaction processing
 * in the ABCI application. It encapsulates all components needed for
 * validating and processing transactions.
 */
export interface Context {
    db: CachedLevelDb;
    storage: CachedStorage;
    provider: Provider;
    accountManager: AccountManager;
    vbRadix: RadixTree;
    tokenRadix: RadixTree;
    validatorSetUpdate: ValidatorSetUpdate[];
}