import { LevelDbTable } from './LevelDbTable';
import {describe, it, expect, beforeAll, afterAll} from 'vitest'

describe('', () => {
    it("test", () => {
        for (const [tableName, tableId] of Object.entries(LevelDbTable)) {
            console.log(tableName, tableId)
        }
    })
})