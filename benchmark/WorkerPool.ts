import { Worker } from "worker_threads";
import os from "os";

interface Task {
    id: string;
    payload: Buffer;
    resolve: (value: boolean) => void;
    reject: (err: Error) => void;
}

export class WorkerPool {
    private workers: Worker[];
    private queue: Task[] = [];
    private roundRobin = 0;

    constructor(workerFile: string, size = os.cpus().length) {
        this.workers = Array.from({ length: size }, () => {
            const w = new Worker(workerFile);
            w.on("message", (msg: { id: string; isValid: boolean }) => {
                const taskIndex = this.queue.findIndex(t => t.id === msg.id);
                if (taskIndex !== -1) {
                    const [task] = this.queue.splice(taskIndex, 1);
                    task.resolve(msg.isValid);
                }
            });
            w.on("error", err => console.error("Worker error:", err));
            return w;
        });
    }

    verifySignature(id: string, payload: Buffer): Promise<boolean> {
        return new Promise((resolve, reject) => {
            const task: Task = { id, payload, resolve, reject };
            this.queue.push(task);

            const worker = this.workers[this.roundRobin];
            this.roundRobin = (this.roundRobin + 1) % this.workers.length;
            worker.postMessage({ id, payload });
        });
    }
}