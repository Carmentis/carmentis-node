import {SnapshotsManager} from "../SnapshotsManager";
import {Storage} from "./Storage";
import {rm} from "node:fs/promises";
import {getLogger} from "@logtape/logtape";

export class StorageCleaner {
    private snapshotsManager: SnapshotsManager;
    private storage: Storage;

    private static logger = getLogger(['node', 'storage', StorageCleaner.name]);
    private logger = StorageCleaner.logger;

    constructor(snapshotsManager: SnapshotsManager, storage: Storage) {
        this.snapshotsManager = snapshotsManager;
        this.storage = storage;
    }

    /**
     * Removes expired data files.
     * A data file may be deleted if the following conditions are both met:
     * - The data it contains has expired, i.e. its file identifier is less than the day timestamp.
     * - It is not referenced by any of the snapshots that this node still stores.
     *
     * @param dayTimestamp - the day timestamp of the block that triggered the call
     */
    async removeExpiredDataFiles(dayTimestamp: number) {
        const earliestSnapshotFileTimestamp = await this.getEarliestSnapshotFileTimestamp();
        this.logger.debug(`dayTimestamp = ${dayTimestamp}, earliestSnapshotFileTimestamp = ${earliestSnapshotFileTimestamp}`);
        const minimumTimestamp = Math.min(dayTimestamp, earliestSnapshotFileTimestamp);
        const minimumDate = new Date(minimumTimestamp * 1000).toISOString();
        this.logger.info(`looking for data files to delete with expiration before ${minimumDate}`);
        const fileList = await this.storage.getFilesWithExpirationDayBefore(minimumTimestamp);
        this.logger.info(`found ${fileList.length} data file(s) to delete`);

        for (const file of fileList) {
            this.logger.info(`deleting data file ${file}`);
            await rm(file);
        }
    }

    /**
     * Look at the 'earliestFileDate' field in all stored snapshots and return the earliest date
     * as a timestamp. This may be 'Infinity' if endless storage is used for all files referenced
     * in the snapshots.
     */
    async getEarliestSnapshotFileTimestamp(): Promise<number> {
        const snapshotList = await this.snapshotsManager.getList();
        const snapshotFileTimestampList = snapshotList.map((entry) => {
            const dateStr = entry.metadata.earliestFileDate;
            if (!/^\d{8}$/.test(dateStr)) {
                return Infinity;
            }
            const year = Number(dateStr.slice(0, 4));
            const month = Number(dateStr.slice(4, 6));
            const day = Number(dateStr.slice(6));
            const date = new Date(Date.UTC(year, month - 1, day));
            return Math.floor(date.getTime() / 1000);
        });
        const earliestSnapshotFileTimestamp = Math.min(...snapshotFileTimestampList);
        return earliestSnapshotFileTimestamp;
    }
}
