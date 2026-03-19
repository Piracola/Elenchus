const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');
const backendPort = process.env.ELENCHUS_BACKEND_PORT || '8001';
const isWindows = process.platform === 'win32';
const pythonExecutable = isWindows
  ? path.join(backendDir, 'venv', 'Scripts', 'python.exe')
  : path.join(backendDir, 'venv', 'bin', 'python');

if (!fs.existsSync(pythonExecutable)) {
  console.error(`[elenchus] Backend virtual environment is missing: ${pythonExecutable}`);
  process.exit(1);
}

const child = spawn(
  pythonExecutable,
  ['-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', backendPort, '--reload'],
  {
    cwd: backendDir,
    stdio: 'inherit',
  },
);

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

child.on('error', (error) => {
  console.error(`[elenchus] Failed to start backend: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
