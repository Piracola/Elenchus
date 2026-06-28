const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { freeFrontendPort } = require('./kill-backend-port.cjs');

const rootDir = path.resolve(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');
const env = { ...process.env };
const shouldFreeFrontendPort = env.ELENCHUS_FREE_FRONTEND_PORT === '1';
const shouldUsePreviewServer = env.ELENCHUS_FRONTEND_MODE === 'preview'
  || (
    env.ELENCHUS_FRONTEND_MODE !== 'dev'
    && env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE === 'Codex Desktop'
  );

if (env.ELENCHUS_BACKEND_PORT && !env.VITE_BACKEND_PORT) {
  env.VITE_BACKEND_PORT = env.ELENCHUS_BACKEND_PORT;
}

if (shouldUsePreviewServer) {
  if (!('VITE_ELENCHUS_PREVIEW_SAFE_MOTION' in env)) {
    env.VITE_ELENCHUS_PREVIEW_SAFE_MOTION = '1';
  }

  if (!('ELENCHUS_DISABLE_HMR' in env)) {
    env.ELENCHUS_DISABLE_HMR = '1';
  }
}

const viteBin = path.join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js');

if (!fs.existsSync(viteBin)) {
  console.error(`[elenchus] Frontend dev dependency is missing: ${viteBin}`);
  process.exit(1);
}

let child;

function run(commandArgs, label) {
  return new Promise((resolve, reject) => {
    const processHandle = spawn(process.execPath, commandArgs, {
      cwd: frontendDir,
      env,
      stdio: 'inherit',
    });

    processHandle.on('error', (error) => {
      reject(new Error(`[elenchus] Failed to start ${label}: ${error.message}`));
    });

    processHandle.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`[elenchus] ${label} exited with signal ${signal}`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`[elenchus] ${label} exited with code ${code}`));
        return;
      }

      resolve();
    });
  });
}

async function main() {
  if (shouldFreeFrontendPort) {
    await freeFrontendPort();
  }

  const args = shouldUsePreviewServer ? [viteBin, 'preview'] : [viteBin];

  if (shouldUsePreviewServer) {
    await run([viteBin, 'build'], 'frontend build');
  }

  child = spawn(process.execPath, args, {
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
