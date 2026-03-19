const killPort = require('kill-port');

const backendPort = Number.parseInt(process.env.ELENCHUS_BACKEND_PORT || '8001', 10);

if (!Number.isInteger(backendPort) || backendPort <= 0) {
  console.error('[elenchus] Invalid backend port.');
  process.exit(1);
}

killPort(backendPort)
  .then(() => process.exit(0))
  .catch((error) => {
    const message = String(error && error.message ? error.message : error);
    const normalizedMessage = message.toLowerCase();

    if (normalizedMessage.includes('no process') || normalizedMessage.includes('eperm')) {
      process.exit(0);
      return;
    }

    console.warn(`[elenchus] Could not free port ${backendPort}: ${message}`);
    process.exit(0);
  });
