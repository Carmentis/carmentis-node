function timeit(fn: () => void, n = 1_000): number {
  const start = process.hrtime.bigint();
  for (let i = 0; i < n; i++) fn();
  const end = process.hrtime.bigint();
  return Number(end - start) / 1e6; // ms
}

console.log("push:", timeit(() => {
  const arr: number[] = [];
  for (let i = 0; i < 10000; i++) arr.push(i);
}));

console.log("prealloc:", timeit(() => {
  const arr = new Array<number>(10000);
  for (let i = 0; i < 10000; i++) arr[i] = i;
}));
