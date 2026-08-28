import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

if (process.env.CI || !existsSync('.git')) process.exit(0);

try {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
  console.log('Git hooks configured at .githooks.');
} catch {
  console.warn('Could not configure Git hooks automatically. Run: git config core.hooksPath .githooks');
}
