import { readFileSync, existsSync } from 'fs';
import * as v from 'valibot';
import {
    GenesisRunoffAccountType,
    GenesisRunoffOrganizationType,
    GenesisRunoffNodeType,
    GenesisRunoffSchema,
    GenesisRunoffTransferActionType,
    GenesisRunoffActionType,
    GenesisRunoffType,
} from './types/GenesisRunoffType';
import { getLogger } from '@logtape/logtape';

export class GenesisRunoff {
    private static readonly logger = getLogger(['node', GenesisRunoff.name]);
    private constructor(private readonly data: GenesisRunoffType) {}

    static loadFromFilePathOrCreateNoRunoff(path: string): GenesisRunoff {
        // If the file does not exist, return an empty instance
        if (!existsSync(path)) {
            this.logger.info(`No genesis runoffs file found at ${path}: Assuming no runoffs`)
            return GenesisRunoff.noRunoff();
        }

        try {
            // Read and parse the JSON file
            GenesisRunoff.logger.info(`Reading genesis runoff file from: ${path}`);
            const fileContent = readFileSync(path, 'utf-8');
            const parsedData = JSON.parse(fileContent);

            // Validate against Valibot schema
            const validatedData = v.parse(GenesisRunoffSchema, parsedData);

            const runoffs = new GenesisRunoff(validatedData);
            return runoffs
        } catch (error) {
            throw new Error(
                `Invalid genesis runoff file at ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
        }
    }

    static noRunoff(): GenesisRunoff {
        return new GenesisRunoff({
            organizations: [],
            nodes: [],
            vesting: [],
            accounts: [],
            actions: [],
        });
    }

    getAccountByIdOrFail(id: string): GenesisRunoffAccountType {
        const account = this.data.accounts.find((obj) => obj.id === id);
        if (!account) throw new Error(`Account '${id}' not found in genesis runoff`);
        return account;
    }

    getOrganizationByIdOrFail(id: string): GenesisRunoffOrganizationType {
        const organization = this.data.organizations.find((obj) => obj.id === id);
        if (!organization) throw new Error(`Organization '${id}' not found in genesis runoff`);
        return organization;
    }

    getNodeByIdOrFail(id: string): GenesisRunoffNodeType {
        const node = this.data.nodes.find((obj) => obj.id === id);
        if (!node) throw new Error(`Node '${id}' not found in genesis runoff`);
        return node;
    }

    getAccounts(): GenesisRunoffAccountType[] {
        return this.data.accounts;
    }

    getActions(): GenesisRunoffActionType[] {
        return this.data.actions;
    }

    getData(): GenesisRunoffType {
        return this.data;
    }

    getVestingById(vestingId: string) {
        const vesting = this.data.vesting.find((obj) => obj.id === vestingId);
        if (!vesting) {
            throw new Error(`Vesting ${vestingId} not found in genesis runoff`);
        }
        return vesting;
    }
}
