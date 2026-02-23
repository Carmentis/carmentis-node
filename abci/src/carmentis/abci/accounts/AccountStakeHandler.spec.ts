import { AccountStakeHandler } from './AccountStakeHandler';
import { AccountStateManager } from './AccountStateManager';
import { LevelDb } from '../database/LevelDb';
import * as os from 'node:os';
import path from 'path';
import fs from 'node:fs';
import { RadixTree } from '../RadixTree';
import { LevelDbTable } from '../database/LevelDbTable';

describe("account stake handler", () => {

    let tempFilePath = '';

    beforeAll(() => {
        // Crée un chemin unique dans le dossier temp du système
        const tempDir = os.tmpdir();
        tempFilePath = path.join(tempDir, `test-file-${Date.now()}.txt`);
    });

    afterAll(() => {
        // Nettoyage manuel après les tests
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
    });

  it("Should do something", () => {
      // create the staking manager and the state manager
      const db = new LevelDb(tempFilePath);
      const stateManager = new AccountStateManager(
        db, new RadixTree(db, LevelDbTable.TOKEN_RADIX)
      );
      const stakeManager = new AccountStakeHandler(stateManager);

      // create an account
  })
})
