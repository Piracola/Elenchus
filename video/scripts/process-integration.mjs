import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const rootDir = process.cwd();
const port = 4400 + Math.floor(Math.random() * 300);
const baseUrl = `http://127.0.0.1:${port}`;
const pidFile = join(rootDir, `.video-ui-test-${process.pid}.pid`);
const ttsStateFile = join(rootDir, "public", "data", "tts-state.json");
const ttsStateBefore = existsSync(ttsStateFile) ? readFileSync(ttsStateFile) : null;

const server = spawn(process.execPath, ["--import", "tsx", "scripts/ui-server.mjs"], {
  cwd: rootDir,
  env: {
    ...process.env,
    PORT: String(port),
    ELENCHUS_VIDEO_TEST_MODE: "1",
    ELENCHUS_VIDEO_PID_FILE: pidFile,
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

let output = "";
server.stdout.on("data", (chunk) => { output += chunk.toString(); });
server.stderr.on("data", (chunk) => { output += chunk.toString(); });

const waitFor = async (predicate, message, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${message}\n${output}`);
};

const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json();
  assert.equal(body.ok, true, body.message);
  return body;
};

const processExists = (pid) => {
  if (process.platform === "win32") {
    const result = spawnSync("tasklist.exe", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], {
      encoding: "utf8",
      windowsHide: true,
    });
    return result.status === 0 && result.stdout.includes(`\"${pid}\"`);
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

try {
  await waitFor(async () => {
    try {
      return (await fetch(`${baseUrl}/api/health`)).ok;
    } catch {
      return false;
    }
  }, "视频服务未能启动");
  assert.equal(existsSync(pidFile), true, "服务未创建 PID 文件");

  const first = await request("/api/test/hold-task", { method: "POST" });
  const second = await request("/api/test/hold-task", { method: "POST" });
  assert.equal(second.task.id, first.task.id, "重复点击启动了第二个配音任务");

  const render = await request("/api/test/hold-task?name=render", { method: "POST" });
  const duplicateRender = await request("/api/test/hold-task?name=render", { method: "POST" });
  assert.notEqual(render.task.id, first.task.id, "渲染任务不应复用配音任务");
  assert.equal(duplicateRender.task.id, render.task.id, "重复点击启动了第二个渲染任务");

  await request(`/api/tasks/${encodeURIComponent(first.task.id)}/cancel`, { method: "POST" });
  await request(`/api/tasks/${encodeURIComponent(render.task.id)}/cancel`, { method: "POST" });
  await waitFor(async () => {
    const task = await request(`/api/tasks/${encodeURIComponent(first.task.id)}`);
    return task.task.status === "cancelled";
  }, "取消任务后状态未变为 cancelled");
  await waitFor(async () => {
    const task = await request(`/api/tasks/${encodeURIComponent(render.task.id)}`);
    return task.task.status === "cancelled";
  }, "取消渲染任务后状态未变为 cancelled");

  const ffmpegTask = await request("/api/test/hold-task?ffmpeg=1", { method: "POST" });
  let ffmpegPid = null;
  await waitFor(async () => {
    const task = await request(`/api/tasks/${encodeURIComponent(ffmpegTask.task.id)}`);
    ffmpegPid = task.task.pid;
    return Number.isInteger(ffmpegPid) && ffmpegPid !== server.pid && processExists(ffmpegPid);
  }, "测试 FFmpeg 子进程未启动");
  await request(`/api/tasks/${encodeURIComponent(ffmpegTask.task.id)}/cancel`, { method: "POST" });
  await waitFor(async () => {
    const task = await request(`/api/tasks/${encodeURIComponent(ffmpegTask.task.id)}`);
    return task.task.status === "cancelled";
  }, "FFmpeg 拼接阶段取消后未标记为 cancelled");
  await waitFor(() => !processExists(ffmpegPid), "取消后 FFmpeg 子进程仍残留");
  if (ttsStateBefore) {
    assert.deepEqual(readFileSync(ttsStateFile), ttsStateBefore, "进程测试污染了真实 TTS 状态");
  }

  const managed = await request("/api/test/spawn-child", { method: "POST" });
  assert.equal(processExists(managed.pid), true, "测试子进程未启动");

  await request("/api/test/shutdown", { method: "POST" });
  await waitFor(() => server.exitCode !== null, "视频服务未能退出");
  await waitFor(() => !existsSync(pidFile), "视频服务退出后 PID 文件仍存在");
  await waitFor(() => !processExists(managed.pid), "视频服务退出后子进程仍残留");
  console.log("视频服务任务去重、取消、PID 和子进程清理验收通过。");
} finally {
  if (server.exitCode === null) server.kill("SIGTERM");
  rmSync(pidFile, { force: true });
}
