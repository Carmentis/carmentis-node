import { CachedLevelDb } from '../database/CachedLevelDb';
import { Storage } from '../storage';
import { Blockchain } from '@cmts-dev/carmentis-sdk/server';
import { AccountManager } from '../AccountManager';
import { RadixTree } from '../RadixTree';

export interface Cache {
    db: CachedLevelDb;
    storage: Storage;
    blockchain: Blockchain;
    accountManager: AccountManager;
    vbRadix: RadixTree;
    tokenRadix: RadixTree;
    validatorSetUpdate: any[];
}