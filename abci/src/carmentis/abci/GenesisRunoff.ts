import { readFileSync, existsSync } from 'fs';
import { GenesisRunoffSchema, GenesisRunoffType } from './types/GenesisRunoffType';

export class GenesisRunoff {
    private constructor(private readonly data: GenesisRunoffType) {}

    static loadFromFilePathOrCreate(path: string): GenesisRunoff {
        // Si le fichier n'existe pas, retourner une instance vide
        if (!existsSync(path)) {
            return GenesisRunoff.noRunoff();
        }

        try {
            // Lire le fichier JSON
            const fileContent = readFileSync(path, 'utf-8');

            // Parser le JSON
            const parsedData = JSON.parse(fileContent);

            // Valider avec le schema Zod
            const validatedData = GenesisRunoffSchema.parse(parsedData);

            return new GenesisRunoff(validatedData);
        } catch (error) {
            throw new Error(`Invalid genesis runoff file at ${path}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    static noRunoff(): GenesisRunoff {
        return new GenesisRunoff({
            vesting: [],
            accounts: [],
        });
    }

    getData(): GenesisRunoffType {
        return this.data;
    }
}