import { LevelDbTable } from './LevelDbTable';

describe('', () => {
    it("test", () => {
        for (const [tableName, tableId] of Object.entries(LevelDbTable)) {
            console.log(tableName, tableId)
        }
    })
})