/**
 * Runs backend and frontend dev servers concurrently.
 * Replaces the `concurrently` dependency with a lightweight native implementation.
 */
const { spawn } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const env = { ...process.env };

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

// Kill any existing process on the backend port
const killScript = path.join(rootDir, 'scripts', 'kill-backend-port.cjs');
const killChild = spawn(process.execPath, [killScript], {
  cwd: rootDir,
  env,
  stdio: 'inherit',
});

killChild.on('exit', () => {
  // Start both services after port is freed
  const backendScript = path.join(rootDir, 'scripts', 'run-backend-dev.cjs');
  const frontendScript = path.join(rootDir, 'scripts', 'run-frontend-dev.cjs');

  const backend = runService(
    'backend',
    process.execPath,
    [backendScript],
    rootDir,
    34, // blue
  );

  const frontend = runService(
    'frontend',
    process.execPath,
    [frontendScript],
    rootDir,
    32, // green
  );

  const children = [backend, frontend];

  // If either service exits, kill the other
  children.forEach((child, index) => {
    child.on('exit', (code, signal) => {
      const other = children[1 - index];
      if (!other.killed) {
        other.kill('SIGTERM');
      }
    });
  });

  // Forward signals to children
  const shutdown = (signal) => {
    children.forEach((child) => {
      if (!child.killed) {
        child.kill(signal);
      }
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
});
