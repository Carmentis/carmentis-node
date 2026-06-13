import {mkdtemp, rm} from "fs/promises";
import {join} from "path";
import {tmpdir} from "os";
import {LevelDb} from "./LevelDb";
import {CachedLevelDb} from "./CachedLevelDb";

// creates a temporary LevelDB for test purposes only
export async function createTempLevel() {
    const rand = Math.floor(Math.random() * 36 ** 10).toString(36).padStart(10, "0");
    const dirName = join(tmpdir(), `level-test-${rand}`);
    const dir = await mkdtemp(dirName);
    const level = new LevelDb(dir);
    const cachedDb = new CachedLevelDb(level);

    return {
        cachedDb,
        async cleanup() {
            await rm(dir, {recursive: true, force: true})
        }
    }
}
