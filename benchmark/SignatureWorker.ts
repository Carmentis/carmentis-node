import { parentPort } from "worker_threads";

if (!parentPort) {
    throw new Error("Must be run as a worker");
}

parentPort.on("message", (tx: { id: string; payload: Buffer }) => {
    const isValid = fakeVerifySignature(tx.payload);

    parentPort!.postMessage({ id: tx.id, isValid });
});

function fakeVerifySignature(data: Buffer): boolean {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
        sum ^= data[i];
    }
    return (sum % 2) === 0;
}
