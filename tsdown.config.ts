import { defineConfig } from 'tsdown';
export default defineConfig({ entry: ['src/cli.ts'], format: 'esm', outExtensions: () => ({ js: '.js' }), sourcemap: true, clean: true });
