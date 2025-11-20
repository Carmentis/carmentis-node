import { CachedLevelDb } from '../database/CachedLevelDb';
import { Storage } from '../Storage';
//import { Blockchain } from '@cmts-dev/carmentis-sdk/server';
import { AccountManager } from '../AccountManager';
import { RadixTree } from '../RadixTree';
import { Provider } from '@cmts-dev/carmentis-sdk/server';

export interface Context {
    db: CachedLevelDb;
    storage: Storage;
    provider: Provider;
    accountManager: AccountManager;
    vbRadix: RadixTree;
    tokenRadix: RadixTree;
    validatorSetUpdate: any[];
}