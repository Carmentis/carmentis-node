import { getLogger } from '@logtape/logtape';

const MAX_HISTORY = 50;

interface Sample {
    total: number;
    values: number[];
}

class PerformanceMeasure {
    parent: Performance;
    private title: string;
    private startTs: number;
    private lastTs: number;

    constructor(parent: Performance, title: string) {
        this.parent = parent;

        // TODO: study why a return here
        /*
        if(!this.parent.enabled) {
            return;
        }

         */

        this.title = title;
        this.startTs = performance.now();
        this.lastTs = this.startTs;
        this.parent.logger.debug(`[${this.title}] start at ${this.clock()}`);
    }

    event(eventName: string) {
        if(!this.parent.enabled) {
            return;
        }

        const ts = performance.now();
        const time = ts - this.lastTs;
        const { avg, nSamples } = this.parent.addSample(this.title + '|' + eventName, time);

        this.parent.logger.debug(
            [
                `[${this.title}] ${eventName}`,
                `time = ${this.format(time)}`,
                `avg = ${this.format(avg)} (${nSamples} sample${nSamples > 1 ? 's' : ''})`,
                `total = ${this.format(ts - this.startTs)}`
            ].join(' / ')
        );
        this.lastTs = ts;
    }

    end() {
        if(!this.parent.enabled) {
            return;
        }

        const ts = performance.now();
        const totalTime = ts - this.startTs;
        const { avg, nSamples } = this.parent.addSample(this.title, totalTime);

        this.parent.logger.debug(
            [
                `[${this.title}] end at ${this.clock()}`,
                `total = ${this.format(totalTime)}`,
                `avg = ${this.format(avg)} (${nSamples} sample${nSamples > 1 ? 's' : ''})`
            ].join(' / ')
        );
    }

    format(time: number) {
        return time.toFixed(2);
    }

    clock() {
        return (new Date).toJSON().slice(11, 23);
    }
}

export class Performance {
    logger = getLogger(['node', 'perf']);
    enabled: boolean;
    samples: Map<string, Sample>;

    constructor(logger: unknown, enabled = true) {
        this.enabled = enabled;
        this.samples = new Map;
    }

    start(title: string) {
        return new PerformanceMeasure(this, title);
    }

    addSample(key: string, time: number) {
        if(!this.samples.has(key)) {
            this.samples.set(key, { total: 0, values: [] });
        }

        const object = this.samples.get(key);
        if (object === undefined) throw new Error(
            `Performance.addSample(): object for key '${key}' not found`
        )

        if(object.values.length == MAX_HISTORY) {
            const el = object.values.shift();
            if (el) {
                object.total -= el;
            } else {
                // TODO: missing case
            }

        }

        // TODO(scalability): Remove the list of values, the total is sufficient to compute the avg
        object.values.push(time);
        object.total += time;

        const nSamples = object.values.length;
        const avg = object.total / nSamples;

        return { avg, nSamples };
    }
}
