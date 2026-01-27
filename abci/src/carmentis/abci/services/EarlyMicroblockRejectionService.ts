import { Injectable, OnModuleInit } from '@nestjs/common';
import { Microblock } from '@cmts-dev/carmentis-sdk/server';
import { Cron } from '@nestjs/schedule';
import { getLogger } from '@logtape/logtape';

@Injectable()
export class EarlyMicroblockRejectionService {
    private logger = getLogger(['node', 'early-rejection']);
    private shouldReject: Set<string> = new Set();

    markMicroblockAsRejected(microblock: Microblock) {
        this.logger.info(`Marking microblock ${microblock.getHash().encode()} as to be rejected`);
        this.shouldReject.add(microblock.getHash().encode());
    }

    shouldBeRejected(microblock: Microblock) {
        return this.shouldReject.has(microblock.getHash().encode());
    }

    @Cron('*/10 * * * * *', {
        name: 'Clear rejected microblocks',
    })
    clearRejectedMicroblocks() {
        this.logger.info(`Clearing rejected microblocks (${this.shouldReject.size} entries)`);
        this.shouldReject.clear();
    }
}