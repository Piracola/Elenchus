/**
 * Kills any process occupying the backend port.
 * Uses native Node.js APIs instead of the `kill-port` npm package.
 */
const { exec } = require('child_process');

const backendPort = Number.parseInt(process.env.ELENCHUS_BACKEND_PORT || '8001', 10);

if (!Number.isInteger(backendPort) || backendPort <= 0) {
  console.error('[elenchus] Invalid backend port.');
  process.exit(1);
}

function killPortWindows(port) {
  return new Promise((resolve) => {
    // Find PIDs on the port using netstat
    exec(`netstat -ano | findstr :${port} | findstr LISTENING`, (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve(false);
        return;
      }

      const pids = new Set();
      for (const line of stdout.trim().split('\n')) {
        const parts = line.trim().split(/\s+/);
        const pid = Number.parseInt(parts[parts.length - 1], 10);
        if (pid && pid > 0 && pid !== process.pid) {
          pids.add(pid);
        }
      }

      if (pids.size === 0) {
        resolve(false);
        return;
      }

      let killed = false;
      let pending = pids.size;
      for (const pid of pids) {
        exec(`taskkill /PID ${pid} /F`, (taskErr) => {
          if (!taskErr) killed = true;
          pending--;
          if (pending === 0) resolve(killed);
        });
      }
    });
  });
}

function killPortUnix(port) {
  return new Promise((resolve) => {
    // Use lsof to find PIDs on the port
    exec(`lsof -ti:${port}`, (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve(false);
        return;
      }

      const pids = stdout.trim().split('\n')
        .map((p) => Number.parseInt(p, 10))
        .filter((p) => p > 0 && p !== process.pid);

      if (pids.length === 0) {
        resolve(false);
        return;
      }

      let killed = false;
      for (const pid of pids) {
        try {
          process.kill(pid, 'SIGTERM');
          killed = true;
        } catch {
          // Process may have already exited
        }
      }
      resolve(killed);
    });
  });
}

async function main() {
  try {
    const killed = process.platform === 'win32'
      ? await killPortWindows(backendPort)
      : await killPortUnix(backendPort);

    if (killed) {
      // Give the OS a moment to release the port
      await new Promise((r) => setTimeout(r, 500));
    }
  } catch (error) {
    const message = String(error?.message || error);
    if (!message.toLowerCase().includes('no process')) {
      console.warn(`[elenchus] Could not free port ${backendPort}: ${message}`);
    }
  }

  process.exit(0);
}

main();
