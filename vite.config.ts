import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

/** Game version: package.json semver (bumped by the pre-commit hook) + git short hash. */
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
let hash = 'dev';
try { hash = execSync('git rev-parse --short HEAD').toString().trim(); } catch { /* no git (e.g. tarball) */ }

export default defineConfig({
  base: './',
  server: { port: 5181 },
  // bot balance runs are long simulations
  test: { testTimeout: 60000 },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD__: JSON.stringify(hash),
  },
} as never);
