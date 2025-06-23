import { Level } from "level";
import { NODE_SCHEMAS } from "./constants/constants.js";
import * as sdk from "./index.mjs";

const { SchemaSerializer, SchemaUnserializer } = sdk.schemaSerializer;

const SUB_PREFIX = "SUB";

export class LevelDb {
  constructor(path, tableSchemas) {
    this.path = path;
    this.tableSchemas = tableSchemas;
  }

  async initialize() {
    const encoding = {
      keyEncoding: "view",
      valueEncoding: "view"
    };

    this.db = new Level(this.path, encoding);
    this.sub = [];

    const nTables = Object.keys(this.tableSchemas).length;

    for(let n = 0; n < nTables; n++) {
      this.sub[n] = this.db.sublevel(SUB_PREFIX + n.toString().padStart(2, "0"), encoding);
    }
  }

  async open() {
    await this.db.open();
  }

  async close() {
    await this.db.close();
  }

  async clear() {
    await this.db.clear();
  }

  async getRaw(tableId, key) {
    try {
      const b = await this.sub[tableId].get(key);
      if(b === undefined) {
        return b;
      }
      return new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    }
    catch(e) {
      console.error(e);
      return undefined;
    }
  }

  async getObject(tableId, key) {
    const data = await this.getRaw(tableId, key);

    if(data === undefined) {
      return data;
    }

    const unserializer = new SchemaUnserializer(NODE_SCHEMAS.DB[tableId]);
    return unserializer.unserialize(data);
  }

  async putRaw(tableId, key, data) {
    try {
      await this.sub[tableId].put(key, data);
      return true;
    }
    catch(e) {
      console.error(e);
      return false;
    }
  }

  serialize(tableId, object) {
    const serializer = new SchemaSerializer(NODE_SCHEMAS.DB[tableId]);
    const data = serializer.serialize(object);
    return data;
  }

  async putObject(tableId, key, object) {
    const data = this.serialize(tableId, object);
    return await this.putRaw(tableId, key, data);
  }

  async query(tableId, query) {
    try {
      return this.sub[tableId].iterator(query);
    }
    catch(e) {
      console.error(e);
      return null;
    }
  }

  async del(tableId, key) {
    try {
      await this.db.sub[tableId].del(key);
      return true;
    }
    catch(e) {
      console.error(e);
      return false;
    }
  }

  getBatch() {
    const batchObject = this.db.batch();
    const sub = this.sub;

    const obj = {
      del: function(tableId, list) {
        const options = { sublevel: sub[tableId] };

        for(const key of list) {
          batchObject.del(key, options);
        }
        return obj;
      },
      put: function(tableId, list) {
        const options = { sublevel: sub[tableId] };

        for(const [ key, value ] of list) {
          batchObject.put(key, value, options);
        }
        return obj;
      },
      write: async function() {
        try {
          await batchObject.write();
          return true;
        }
        catch(e) {
          console.error(e);
          return e;
        }
      }
    };

    return obj;
  }
}
