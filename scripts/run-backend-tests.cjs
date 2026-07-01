const { spawn } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');

const extraArgs = process.argv.slice(2);
const normalizedArgs = extraArgs.map((arg) => {
  if (typeof arg !== 'string') {
    return arg;
  }
  if (arg.startsWith('backend/')) {
    return arg.slice('backend/'.length);
  }
  if (arg.startsWith('backend\\')) {
    return arg.slice('backend\\'.length);
  }
  return arg;
});
const child = spawn(
  'uv',
  ['run', '--frozen', '--group', 'dev', 'pytest', ...normalizedArgs],
  {
    cwd: backendDir,
    stdio: 'inherit',
  },
);

child.on('error', (error) => {
  console.error(`[elenchus] Failed to start backend tests: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
