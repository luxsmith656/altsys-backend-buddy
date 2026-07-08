import { copyFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';
const npxCmd = isWindows ? 'npx.cmd' : 'npx';
const gradleCmd = isWindows ? 'gradlew.bat' : './gradlew';
const apkSource = join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const publicDir = join(root, 'public', 'downloads');
const apkTarget = join(publicDir, 'mt-kalisungan.apk');
const manifestTarget = join(publicDir, 'app-release.json');
const androidSdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || (isWindows && process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : undefined);

function buildEnv() {
  const env = { ...process.env };
  if (androidSdk) {
    env.ANDROID_HOME = androidSdk;
    env.ANDROID_SDK_ROOT = androidSdk;
  }
  return env;
}

function run(command, args, cwd = root) {
  const commandLine = [command, ...args].join(' ');
  const result = spawnSync(commandLine, {
    cwd,
    env: buildEnv(),
    shell: true,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`Failed to run ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(npmCmd, ['run', 'build']);
run(npxCmd, ['cap', 'sync', 'android']);
run(gradleCmd, ['assembleDebug'], join(root, 'android'));

mkdirSync(publicDir, { recursive: true });
copyFileSync(apkSource, apkTarget);

const stats = statSync(apkTarget);
writeFileSync(
  manifestTarget,
  `${JSON.stringify(
    {
      name: 'Mt. Kalisungan Android App',
      file: '/downloads/mt-kalisungan.apk',
      sizeBytes: stats.size,
      updatedAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
);

console.log(`Updated ${apkTarget}`);
