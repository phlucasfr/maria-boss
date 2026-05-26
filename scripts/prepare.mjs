import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

if (existsSync('dist/index.js')) {
  process.exit(0);
}

try {
  createRequire(import.meta.url).resolve('typescript');
  execSync('npm run build', { stdio: 'inherit' });
} catch {
  console.warn(
    '[mariaboss] Could not build on install. Use a published version from npm, or clone and run `npm run build` before linking.',
  );
}
