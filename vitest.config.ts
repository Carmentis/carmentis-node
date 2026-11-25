import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['**/unit/**/*.spec.ts'],
        exclude: ['**/local/*.spec.ts', "node_modules"],
    },
});
