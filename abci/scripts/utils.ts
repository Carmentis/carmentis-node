import {
	ZodTypeAny, ZodUnion, ZodDefault, ZodOptional, ZodNullable, ZodObject, ZodArray, ZodEnum, ZodLiteral, ZodPrefault, ZodString,
	ZodNumber, ZodBoolean, ZodURL
} from 'zod';

export type LeafDoc = {
	type: "string" | "number" | "boolean" | "object" | "array" | "enum" | "union" | "literal" | "unknown";
	description?: string;
	required: boolean;
	defaultValue?: unknown;
	properties?: Record<string, LeafDoc>;
};

export function schemaToJson(schema: ZodObject | ZodOptional | ZodPrefault | ZodString | ZodBoolean | ZodURL | ZodNumber | ZodDefault ): LeafDoc {
	if (schema instanceof ZodObject) {
		const shape = schema.shape;
		const properties = Object.entries(shape);
		const result: Record<string, LeafDoc> = {}
		for (const [a, b] of properties) {
			result[a] = schemaToJson(b)
		}

		// decide if the object is required or not based on the fact that the object contains at least one non-object field
		const isRequired = Object.values(result).some(value => value.type !== "object");
		return {
			type: "object",
			properties: result,
			description: schema.description,
			required: isRequired,
		}
	}

	if (schema instanceof ZodPrefault) {
		return schemaToJson(schema.def.innerType as ZodObject)
	}

	if (schema instanceof ZodString) {
		return {
			type: "string",
			properties: {},
			description: schema.description,
			required: true,
		}
	}

	if (schema instanceof ZodNumber) {
		return {
			type: "number",
			properties: {},
			description: schema.description,
			required: true,
		}
	}

	if (schema instanceof ZodBoolean) {
		return {
			type: "boolean",
			properties: {},
			description: schema.description,
			required: true,
		}
	}

	if (schema instanceof ZodURL) {
		return {
			type: "string",
			properties: {},
			description: schema.description,
			required: true,
		}
	}

	if (schema instanceof ZodDefault || schema instanceof ZodOptional) {
		const innerType = schema.def.innerType;
		const hasDefaultValue = schema instanceof ZodDefault;
		const defaultValue = schema instanceof  ZodDefault ? schema.def.defaultValue : undefined;
		const isOptional = schema instanceof ZodOptional;
		const description = schema.description;
		if (innerType instanceof ZodString) {
			return {
				type: innerType.type,
				properties: {},
				description: description,
				required: false,
				defaultValue
			}
		}

		if (innerType instanceof ZodNumber) {
			return {
				type: innerType.type,
				properties: {},
				description: description,
				required: false,
				defaultValue
			}
		}

		if (innerType instanceof ZodBoolean) {
			return {
				type: innerType.type,
				properties: {},
				description: description,
				required: false,
				defaultValue
			}
		}

		if (innerType instanceof ZodURL) {
			return {
				type: 'string',
				properties: {},
				description: description,
				required: false,
				defaultValue
			}
		}



		if (innerType instanceof ZodObject) {
			const shape = innerType.shape;
			const properties = Object.entries(shape);
			const result = {}
			for (const [a, b] of properties) {
				result[a] = schemaToJson(b)
			}
			// @ts-ignore
			return {
				type: "object",
				properties: result,
				description: schema.description,
				required: false,
			}
		}
	}




	return {
		type: "object",
		properties: {},
		description: '',
		required: false,
	}
}