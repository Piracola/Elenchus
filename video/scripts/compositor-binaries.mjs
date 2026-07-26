/**
 * Resolve the FFmpeg/FFprobe binaries bundled with Remotion's platform
 * compositor package.
 *
 * Remotion ships one optional dependency per platform, so the package name and
 * executable suffix depend on the host. Hardcoding the win32 package made every
 * ffmpeg-dependent script Windows-only, which also kept them out of CI.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

const COMPOSITOR_PACKAGES = {
  "win32-x64": "compositor-win32-x64-msvc",
  "darwin-x64": "compositor-darwin-x64",
  "darwin-arm64": "compositor-darwin-arm64",
  "linux-x64": "compositor-linux-x64-gnu",
  "linux-arm64": "compositor-linux-arm64-gnu",
};

const LINUX_MUSL_FALLBACKS = {
  "linux-x64": "compositor-linux-x64-musl",
  "linux-arm64": "compositor-linux-arm64-musl",
};

const executableName = (name) => (process.platform === "win32" ? `${name}.exe` : name);

function candidatePackages() {
  const key = `${process.platform}-${process.arch}`;
  const names = [];
  if (COMPOSITOR_PACKAGES[key]) names.push(COMPOSITOR_PACKAGES[key]);
  if (LINUX_MUSL_FALLBACKS[key]) names.push(LINUX_MUSL_FALLBACKS[key]);
  // Last resort: every known package, so an unusual arch still has a chance.
  for (const name of Object.values(COMPOSITOR_PACKAGES)) {
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

/**
 * @param {string} rootDir video/ project root
 * @param {"ffmpeg" | "ffprobe"} binary
 * @returns {string} absolute path (may not exist if no compositor is installed)
 */
export function resolveCompositorBinary(rootDir, binary) {
  const file = executableName(binary);
  for (const pkg of candidatePackages()) {
    const candidate = join(rootDir, "node_modules", "@remotion", pkg, file);
    if (existsSync(candidate)) return candidate;
  }
  // Return the platform-preferred path so error messages stay informative.
  const preferred = candidatePackages()[0];
  return join(rootDir, "node_modules", "@remotion", preferred, file);
}
