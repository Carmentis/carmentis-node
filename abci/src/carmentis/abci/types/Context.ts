import { CachedLevelDb } from '../database/CachedLevelDb';
import { Storage } from '../storage/Storage';
//import { Blockchain } from '@cmts-dev/carmentis-sdk/server';
import { AccountManager } from '../AccountManager';
import { RadixTree } from '../RadixTree';
import { Provider } from '@cmts-dev/carmentis-sdk/server';
import { CachedStorage } from '../storage/CachedStorage';

export interface Context {
    db: CachedLevelDb;
    storage: CachedStorage;
    provider: Provider;
    accountManager: AccountManager;
    vbRadix: RadixTree;
    tokenRadix: RadixTree;
    validatorSetUpdate: any[];
}