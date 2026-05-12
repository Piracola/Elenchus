const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { freeFrontendPort } = require('./kill-backend-port.cjs');

const rootDir = path.resolve(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');
const env = { ...process.env };

if (env.ELENCHUS_BACKEND_PORT && !env.VITE_BACKEND_PORT) {
  env.VITE_BACKEND_PORT = env.ELENCHUS_BACKEND_PORT;
}

const viteBin = path.join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js');

if (!fs.existsSync(viteBin)) {
  console.error(`[elenchus] Frontend dev dependency is missing: ${viteBin}`);
  process.exit(1);
}

let child;

async function main() {
  await freeFrontendPort();

  child = spawn(process.execPath, [viteBin], {
    cwd: frontendDir,
    env,
    stdio: 'inherit',
  });

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
}

const forwardSignal = (signal) => {
  if (child && !child.killed) {
    child.kill(signal);
  }
};

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

main().catch((error) => {
  console.error(`[elenchus] Failed to start frontend: ${error.message}`);
  process.exit(1);
});
