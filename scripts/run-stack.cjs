/**
 * Runs backend and frontend dev servers concurrently.
 * Replaces the `concurrently` dependency with a lightweight native implementation.
 */
const { spawn } = require('child_process');
const path = require('path');
const { freeBackendPort } = require('./kill-backend-port.cjs');

const rootDir = path.resolve(__dirname, '..');
const env = { ...process.env };
const shouldFreeBackendPort = env.ELENCHUS_FREE_BACKEND_PORT === '1';

if (env.ELENCHUS_BACKEND_PORT && !env.VITE_BACKEND_PORT) {
  env.VITE_BACKEND_PORT = env.ELENCHUS_BACKEND_PORT;
}

function runService(name, command, args, cwd, colorCode) {
  const color = (text) => `\x1b[${colorCode}m${text}\x1b[0m`;
  const prefix = color(`[${name}]`);

  const child = spawn(command, args, { cwd, env, stdio: 'inherit' });

  child.on('error', (err) => {
    console.error(`${prefix} Failed to start: ${err.message}`);
  });

  return child;
}

const backendScript = path.join(rootDir, 'scripts', 'run-backend-dev.cjs');
const frontendScript = path.join(rootDir, 'scripts', 'run-frontend-dev.cjs');
const children = [];
let shuttingDown = false;
let exitCode = 0;

function shutdown(signal = 'SIGTERM') {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  children.forEach((child) => {
    if (child && !child.killed) {
      child.kill(signal);
    }
  });
}

function maybeExit() {
  const allStopped = children.every(
    (child) => child.killed || child.exitCode !== null || child.signalCode !== null,
  );

  if (shuttingDown && allStopped) {
    process.exit(exitCode);
  }
}

function attachLifecycle(child) {
  children.push(child);
  child.on('exit', (code, signal) => {
    if (!shuttingDown) {
      exitCode = code ?? (signal ? 1 : 0);
      shutdown('SIGTERM');
    }

    maybeExit();
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

async function main() {
  const frontend = runService(
    'frontend',
    process.execPath,
    [frontendScript],
    rootDir,
    32, // green
  );
  attachLifecycle(frontend);

  if (shouldFreeBackendPort) {
    await freeBackendPort();
  }

  if (shuttingDown) {
    maybeExit();
    return;
  }

  const backend = runService(
    'backend',
    process.execPath,
    [backendScript],
    rootDir,
    34, // blue
  );
  attachLifecycle(backend);
}

main().catch((error) => {
  exitCode = 1;
  console.error(`[elenchus] Failed to start stack: ${error.message}`);
  shutdown('SIGTERM');
  maybeExit();
});
