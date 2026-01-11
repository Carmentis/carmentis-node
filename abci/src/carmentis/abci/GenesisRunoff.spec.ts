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

    describe('areTransferValid', () => {
        it('should return true for empty transfers', () => {
            const runoff = GenesisRunoff.noRunoff();
            expect(runoff.areTransferValid()).toBe(true);
        });

        it('should return true for valid simple transfer from issuer', () => {
            const data = {
                vesting: [],
                accounts: [{ name: 'account1', publicKey: 'key1' }],
                transfers: [{ source: 'issuer', destination: 'account1', amount: 1000 }],
            };
            writeFileSync(testFilePath, JSON.stringify(data));

            const runoff = GenesisRunoff.loadFromFilePathOrCreateNoRunoff(testFilePath);
            expect(runoff.areTransferValid()).toBe(true);
        });

        it('should return false when source account is not defined', () => {
            const data = {
                vesting: [],
                accounts: [{ name: 'account1', publicKey: 'key1' }],
                transfers: [{ source: 'unknown', destination: 'account1', amount: 1000 }],
            };
            writeFileSync(testFilePath, JSON.stringify(data));

            const runoff = GenesisRunoff.loadFromFilePathOrCreateNoRunoff(testFilePath);
            expect(runoff.areTransferValid()).toBe(false);
        });

        it('should return false when destination account is not defined', () => {
            const data = {
                vesting: [],
                accounts: [{ name: 'account1', publicKey: 'key1' }],
                transfers: [{ source: 'issuer', destination: 'unknown', amount: 1000 }],
            };
            writeFileSync(testFilePath, JSON.stringify(data));

            const runoff = GenesisRunoff.loadFromFilePathOrCreateNoRunoff(testFilePath);
            expect(runoff.areTransferValid()).toBe(false);
        });

        it('should return false when vesting is not defined', () => {
            const data = {
                vesting: [],
                accounts: [{ name: 'account1', publicKey: 'key1' }],
                transfers: [
                    { source: 'issuer', destination: 'account1', amount: 1000, vesting: 'unknown' },
                ],
            };
            writeFileSync(testFilePath, JSON.stringify(data));

            const runoff = GenesisRunoff.loadFromFilePathOrCreateNoRunoff(testFilePath);
            expect(runoff.areTransferValid()).toBe(false);
        });

        it('should return true for valid transfer with vesting', () => {
            const data = {
                vesting: [{ name: 'vesting1', cliffPeriod: 100, vestingPeriod: 200 }],
                accounts: [{ name: 'account1', publicKey: 'key1' }],
                transfers: [
                    { source: 'issuer', destination: 'account1', amount: 1000, vesting: 'vesting1' },
                ],
            };
            writeFileSync(testFilePath, JSON.stringify(data));

            const runoff = GenesisRunoff.loadFromFilePathOrCreateNoRunoff(testFilePath);
            expect(runoff.areTransferValid()).toBe(true);
        });

        it('should return false when account with vested tokens tries to transfer', () => {
            const data = {
                vesting: [{ name: 'vesting1', cliffPeriod: 100, vestingPeriod: 200 }],
                accounts: [
                    { name: 'account1', publicKey: 'key1' },
                    { name: 'account2', publicKey: 'key2' },
                ],
                transfers: [
                    { source: 'issuer', destination: 'account1', amount: 1000, vesting: 'vesting1' },
                    { source: 'account1', destination: 'account2', amount: 500 },
                ],
            };
            writeFileSync(testFilePath, JSON.stringify(data));

            const runoff = GenesisRunoff.loadFromFilePathOrCreateNoRunoff(testFilePath);
            expect(runoff.areTransferValid()).toBe(false);
        });

        it('should return true for chained transfers with sufficient balance', () => {
            const data = {
                vesting: [],
                accounts: [
                    { name: 'account1', publicKey: 'key1' },
                    { name: 'account2', publicKey: 'key2' },
                ],
                transfers: [
                    { source: 'issuer', destination: 'account1', amount: 1000 },
                    { source: 'account1', destination: 'account2', amount: 500 },
                ],
            };
            writeFileSync(testFilePath, JSON.stringify(data));

            const runoff = GenesisRunoff.loadFromFilePathOrCreateNoRunoff(testFilePath);
            expect(runoff.areTransferValid()).toBe(true);
        });

        it('should return false when account transfers more than received', () => {
            const data = {
                vesting: [],
                accounts: [
                    { name: 'account1', publicKey: 'key1' },
                    { name: 'account2', publicKey: 'key2' },
                ],
                transfers: [
                    { source: 'issuer', destination: 'account1', amount: 1000 },
                    { source: 'account1', destination: 'account2', amount: 1500 },
                ],
            };
            writeFileSync(testFilePath, JSON.stringify(data));

            const runoff = GenesisRunoff.loadFromFilePathOrCreateNoRunoff(testFilePath);
            expect(runoff.areTransferValid()).toBe(false);
        });

        it('should return false when issuer transfers more than 1 billion', () => {
            const data = {
                vesting: [],
                accounts: [{ name: 'account1', publicKey: 'key1' }],
                transfers: [{ source: 'issuer', destination: 'account1', amount: 1_000_000_001 }],
            };
            writeFileSync(testFilePath, JSON.stringify(data));

            const runoff = GenesisRunoff.loadFromFilePathOrCreateNoRunoff(testFilePath);
            expect(runoff.areTransferValid()).toBe(false);
        });

        it('should handle multiple transfers from same account correctly', () => {
            const data = {
                vesting: [],
                accounts: [
                    { name: 'account1', publicKey: 'key1' },
                    { name: 'account2', publicKey: 'key2' },
                    { name: 'account3', publicKey: 'key3' },
                ],
                transfers: [
                    { source: 'issuer', destination: 'account1', amount: 1000 },
                    { source: 'account1', destination: 'account2', amount: 300 },
                    { source: 'account1', destination: 'account3', amount: 700 },
                ],
            };
            writeFileSync(testFilePath, JSON.stringify(data));

            const runoff = GenesisRunoff.loadFromFilePathOrCreateNoRunoff(testFilePath);
            expect(runoff.areTransferValid()).toBe(true);
        });

        it('should return false when multiple transfers exceed balance', () => {
            const data = {
                vesting: [],
                accounts: [
                    { name: 'account1', publicKey: 'key1' },
                    { name: 'account2', publicKey: 'key2' },
                    { name: 'account3', publicKey: 'key3' },
                ],
                transfers: [
                    { source: 'issuer', destination: 'account1', amount: 1000 },
                    { source: 'account1', destination: 'account2', amount: 600 },
                    { source: 'account1', destination: 'account3', amount: 600 },
                ],
            };
            writeFileSync(testFilePath, JSON.stringify(data));

            const runoff = GenesisRunoff.loadFromFilePathOrCreateNoRunoff(testFilePath);
            expect(runoff.areTransferValid()).toBe(false);
        });
    });
});
