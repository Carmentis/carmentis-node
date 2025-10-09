import path from 'path';
import fs from 'fs';
import { LeafDoc, schemaToJson } from './utils';
import { ConfigSchema } from '../src/carmentis/config/types/NodeConfig';


function generateMarkdownTOML(doc: LeafDoc, path: string[] = []): string {
	let md = "";

	if (doc.type === "object" && doc.properties) {
		// Section TOML pour l'objet courant si on est pas à la racine
		if (path.length > 0) {
			md += `## ${path.join(".")}\n\n`;
		}
		for (const [key, child] of Object.entries(doc.properties)) {
			md += generateMarkdownTOML(child, [...path, key]);
		}
	} else {
		// Champ simple ou array/enum
		const fieldName = path[path.length - 1];
		md += `### ${fieldName}\n\n`;
		if (doc.description) {
			md += `${doc.description}\n\n`;
		}
		md += `| Property | Value |\n`;
		md += `|----------|-------|\n`;
		md += `| Type | \`${doc.type}\` |\n`;
		md += `| Required | ${doc.required ? "Yes" : "No"} |\n`;
		md += `| Default | ${doc.defaultValue !== undefined ? `\`${doc.defaultValue}\`` : "-"} |\n`;
		md += `\n`;
	}

	return md;
}


function generateConfigExample() {
	const json = schemaToJson(
		ConfigSchema
	);
	const doc = generateMarkdownTOML(
		json
	)

	const outPath = path.join(__dirname, "../config.md");
	fs.writeFileSync(outPath, doc, "utf-8");
	console.log("✅ doc-config.md généré !");
}

generateConfigExample();
