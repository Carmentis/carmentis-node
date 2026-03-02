import { Utils } from '@cmts-dev/carmentis-sdk/server';
import { LevelDb } from '../database/LevelDb';
import { NodeCrypto } from '../crypto/NodeCrypto';
import { ChallengeFile } from './ChallengeFile';
import { Storage } from '../storage/Storage';
import { getLogger } from '@logtape/logtape';
import {LevelDbTable} from "../database/LevelDbTable";
import {NodeEncoder} from "../NodeEncoder";

const CHALLENGE_FILES_PER_CHALLENGE = 8;
const CHALLENGE_PARTS_PER_FILE = 256;
const CHALLENGE_BYTES_PER_PART = 1024;

export class ChallengeManager {
    private logger = getLogger(["node", "challenge", ChallengeManager.name])

    constructor(
       private storage: Storage,
       private db: LevelDb,
    ) {}

    /**
     * Processes a storage challenge for a given seed.
     */
    async processChallenge(seed: Uint8Array) {
        const buffer = new Uint8Array(CHALLENGE_PARTS_PER_FILE * CHALLENGE_BYTES_PER_PART);
        let prngValue = seed;
        let prngCounter = 0;
        let hash: Uint8Array = Utils.getNullHash();

        const dataFileTable = await this.db.getFullTable(LevelDbTable.DATA_FILE);
        const dataFileEntries = NodeEncoder.decodeDataFileTable(dataFileTable);

        // fileEntries[] is the list of all pairs [ fileIdentifier, fileSize ],
        // sorted by file identifiers in ascending order
        const fileEntries = [];
        for (const dataFileEntry of dataFileEntries) {
            const dataFileKey = dataFileEntry.dataFileKey;
            const dataFile = dataFileEntry.dataFile;
            fileEntries.push([
                dataFileKey.reduce((t, n) => t * 0x100 + n, 0),
                dataFile.fileSize
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
            const challengeFile = new ChallengeFile(filePath);
            await challengeFile.open();
            challengeFile.checkSizeOrFail(fileSize);

            let bufferOffset = 0;

            for (let partNdx = 0; partNdx < CHALLENGE_PARTS_PER_FILE; partNdx++) {
                const sizeToRead = CHALLENGE_BYTES_PER_PART;
                const fileOffset = getRandom48() % fileSize;

                // NB: this makes the log very verbose
                // this.logger.debug(`processChallenge: read ${sizeToRead} from ${fileOffset}`);

                await challengeFile.readOrFail(
                    buffer,
                    bufferOffset,
                    sizeToRead,
                    fileOffset,
                );
                bufferOffset += sizeToRead;
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