const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');
const isWindows = process.platform === 'win32';
const pythonExecutable = isWindows
  ? path.join(backendDir, 'venv', 'Scripts', 'python.exe')
  : path.join(backendDir, 'venv', 'bin', 'python');

if (!fs.existsSync(pythonExecutable)) {
  console.error(`[elenchus] Backend virtual environment is missing: ${pythonExecutable}`);
  console.error('[elenchus] Run the startup script once or create backend/venv before running backend tests.');
  process.exit(1);
}

const extraArgs = process.argv.slice(2);
const child = spawn(
  pythonExecutable,
  ['-m', 'pytest', ...extraArgs],
  {
    cwd: rootDir,
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
