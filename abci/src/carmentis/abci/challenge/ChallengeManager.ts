import { CachedStorage } from '../storage/CachedStorage';
import { Utils } from '@cmts-dev/carmentis-sdk/server';
import { CachedLevelDb } from '../database/CachedLevelDb';
import { NodeCrypto } from '../crypto/NodeCrypto';
import { ChallengeFile } from './ChallengeFile';
import { Storage } from '../storage/Storage';
import { getLogger } from '@logtape/logtape';

const CHALLENGE_FILES_PER_CHALLENGE = 8;
const CHALLENGE_PARTS_PER_FILE = 256;
const CHALLENGE_BYTES_PER_PART = 1024;

export class ChallengeManager {
    private logger = getLogger(["node", "challenge", ChallengeManager.name])

    constructor(
       private storage: CachedStorage,
       private db: CachedLevelDb,
    ) {}

    /**
     * Processes a storage challenge for a given seed.
     */
    async processChallenge(seed: Uint8Array) {
        const buffer = new Uint8Array(CHALLENGE_PARTS_PER_FILE * CHALLENGE_BYTES_PER_PART);
        let prngValue = seed;
        let prngCounter = 0;
        let hash: Uint8Array = Utils.getNullHash();

        //const dataFileTable = await this.db.getFullTable(NODE_SCHEMAS.DB_DATA_FILE);
        const dataFileTable = await this.db.getFullDataFileTable();
        if (dataFileTable === null) {
            return hash;
        }

        // fileEntries[] is the list of all pairs [ fileIdentifier, fileSize ],
        // sorted by file identifiers in ascending order
        const fileEntries = [];
        for (const dataFileEntry of dataFileTable) {
            const dataFileKey = dataFileEntry.dataFileKey;
            const dataFile = dataFileEntry.dataFile;
            fileEntries.push([
                dataFileKey.reduce((t, n) => t * 0x100 + n, 0),
                dataFile.fileSize
                //value.slice(0, 6).reduce((t, n) => t * 0x100 + n, 0),
            ]);
        }
        fileEntries.sort(([key0], [key1]) => key0 - key1);
        const filesCount = fileEntries.length;

        if (!filesCount) {
            return hash;
        }

        for (let fileNdx = 0; fileNdx < CHALLENGE_FILES_PER_CHALLENGE; fileNdx++) {
            const fileRank = getRandom48() % filesCount;
            const [fileIdentifier, fileSize] = fileEntries[fileRank];
            const filePath = this.storage.getFilePath(fileIdentifier);
            const pendingTxs = this.storage.getPendingTransactionsByFileIdentifier(fileIdentifier) ?? [];

            this.logger.debug(`Opening file ${filePath} to access ${pendingTxs.length} (pending) transactions`);
            this.logger.debug(`File ${filePath} is expected to have size ${fileSize}`)
            const challengeFile = new ChallengeFile(filePath, pendingTxs);
            await challengeFile.open();
            let bufferOffset = 0;

            for (let partNdx = 0; partNdx < CHALLENGE_PARTS_PER_FILE; partNdx++) {
                let remainingBytes = CHALLENGE_BYTES_PER_PART;
                let fileOffset = getRandom48() % fileSize;

                while (remainingBytes) {
                    const sizeToRead = Math.min(fileSize - fileOffset, remainingBytes);
                    const rd = await challengeFile.read(
                        buffer,
                        bufferOffset,
                        sizeToRead,
                        fileOffset,
                    );

                    if (rd.bytesRead < sizeToRead) {
                        throw new Error(
                            `PANIC - Failed to read enough bytes from '${filePath}' during storage challenge (read ${rd.bytesRead} but expected ${sizeToRead})`,
                        );
                    }

                    bufferOffset += sizeToRead;
                    fileOffset += sizeToRead;
                    fileOffset %= fileSize;
                    remainingBytes -= sizeToRead;
                }
            }
            await challengeFile.close();

            const newHash = NodeCrypto.Hashes.sha256AsBinary(buffer);
            hash = NodeCrypto.Hashes.sha256AsBinary(Utils.binaryFrom(hash, newHash));
        }

        return hash;

        // we extract 5 pseudo-random 48-bit values per hash and renew the hash every 5 calls
        function getRandom48() {
            const index = (prngCounter++ % 5) * 6;

            if (index == 0) {
                prngValue = NodeCrypto.Hashes.sha256AsBinary(prngValue);
            }
            return prngValue.slice(index, index + 6).reduce((t, n) => t * 0x100 + n, 0);
        }
    }
}