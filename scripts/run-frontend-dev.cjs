const { spawn } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');
const env = { ...process.env };

if (env.ELENCHUS_BACKEND_PORT && !env.VITE_BACKEND_PORT) {
  env.VITE_BACKEND_PORT = env.ELENCHUS_BACKEND_PORT;
}

const command = process.platform === 'win32' ? 'cmd.exe' : 'npm';
const args = process.platform === 'win32'
  ? ['/d', '/s', '/c', 'npm run dev']
  : ['run', 'dev'];

// Going through cmd.exe avoids Windows-specific spawn issues with npm.cmd.
const child = spawn(command, args, {
  cwd: frontendDir,
  env,
  stdio: 'inherit',
});

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

child.on('error', (error) => {
  console.error(`[elenchus] Failed to start frontend: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
