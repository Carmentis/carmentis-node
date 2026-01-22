import { GenesisRunoff } from './GenesisRunoff';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

describe('GenesisRunoff', () => {
    const testFilePath = join(__dirname, 'test-genesis-runoff.json');

    afterEach(() => {
        if (existsSync(testFilePath)) {
            unlinkSync(testFilePath);
        }
    });

    describe('loadFromFilePathOrCreate', () => {
        it('should return empty runoff when file does not exist', () => {
            const runoff = GenesisRunoff.loadFromFilePathOrCreateNoRunoff('non-existent-file.json');
            expect(runoff.getData()).toEqual({
                vesting: [],
                accounts: [],
                transfers: [],
            });
        });

        it('should load valid genesis runoff from file', () => {
            const data = {
                vesting: [{ name: 'vesting1', cliffPeriod: 100, vestingPeriod: 200 }],
                accounts: [{ name: 'account1', publicKey: 'key1' }],
                transfers: [{ source: 'issuer', destination: 'account1', amount: 1000 }],
            };
            writeFileSync(testFilePath, JSON.stringify(data));

            const runoff = GenesisRunoff.loadFromFilePathOrCreateNoRunoff(testFilePath);
            expect(runoff.getData()).toEqual(data);
        });

        it('should throw error for invalid JSON', () => {
            writeFileSync(testFilePath, 'invalid json');
            expect(() => GenesisRunoff.loadFromFilePathOrCreateNoRunoff(testFilePath)).toThrow();
        });

        it('should throw error for invalid schema', () => {
            const invalidData = {
                vesting: [{ name: 'vesting1' }], // missing required fields
                accounts: [],
                transfers: [],
            };
            writeFileSync(testFilePath, JSON.stringify(invalidData));
            expect(() => GenesisRunoff.loadFromFilePathOrCreateNoRunoff(testFilePath)).toThrow();
        });
    });

    describe('noRunoff', () => {
        it('should create empty runoff', () => {
            const runoff = GenesisRunoff.noRunoff();
            expect(runoff.getData()).toEqual({
                vesting: [],
                accounts: [],
                transfers: [],
            });
        });
    });

    describe('getAccounts', () => {
        it('should return accounts from data', () => {
            const data = {
                vesting: [],
                accounts: [
                    { name: 'account1', publicKey: 'key1' },
                    { name: 'account2', publicKey: 'key2' },
                ],
                transfers: [],
            };
            writeFileSync(testFilePath, JSON.stringify(data));

            const runoff = GenesisRunoff.loadFromFilePathOrCreateNoRunoff(testFilePath);
            expect(runoff.getAccounts()).toEqual(data.accounts);
        });
    });


});
