import { spawn, spawnSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFile } from "music-metadata";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const uiDir = join(rootDir, "ui");
const publicDir = join(rootDir, "public");
const publicDataDir = join(rootDir, "public", "data");
const outDir = join(rootDir, "out");
const localConfigPath = join(rootDir, "config.local.json");
const remotionCli = join(rootDir, "node_modules", "@remotion", "cli", "remotion-cli.js");
const tsxCli = join(rootDir, "node_modules", "tsx", "dist", "cli.mjs");
const host = "127.0.0.1";
const port = Number(process.env.PORT || 4317);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
};

const defaultConfig = {
  video: {
    preset: "recommended",
    codecProfile: "compatible",
    audioMode: "normal",
    rateControl: "bitrate",
    codec: "h264",
    crf: "28",
    videoBitrate: "2500k",
    audioBitrate: "128k",
    pixelFormat: "yuv420p",
    maxRate: "3500k",
    bufferSize: "7000k",
    concurrency: "100%",
    scale: "1",
    x264Preset: "medium",
    muted: false,
  },
  tts: {
    provider: "mimo",
    baseUrl: "",
    apiKey: "",
    model: "",
    voice: "mimo_default",
    format: "wav",
    sampleRate: "24000",
    speed: "1",
    concurrency: "2",
  },
};

const mergeConfig = (config) => ({
  video: { ...defaultConfig.video, ...(config?.video || {}) },
  tts: { ...defaultConfig.tts, ...(config?.tts || {}) },
});

const FPS = 30;
const audioDir = join(rootDir, "public", "audio");
const tasks = new Map();
const MAX_TASK_OUTPUT = 240000;

const stripThinking = (text) => {
  let value = String(text || "");
  while (/^\s*<think\b[^>]*>/i.test(value)) {
    const close = value.search(/<\/think\s*>/i);
    if (close < 0) {
      return value;
    }
    value = value.slice(close).replace(/^<\/think\s*>\s*/i, "");
  }
  return value;
};

const stripAnsi = (text) => String(text || "").replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");

const appendTaskOutput = (task, chunk) => {
  task.output += stripAnsi(chunk.toString());
  if (task.output.length > MAX_TASK_OUTPUT) {
    task.output = `...前面的日志已省略...\n${task.output.slice(-MAX_TASK_OUTPUT)}`;
  }
  task.updatedAt = new Date().toISOString();
};

const publicTask = (task) => ({
  id: task.id,
  name: task.name,
  status: task.status,
  ok: task.status === "finished",
  message: task.message,
  command: task.command,
  output: task.output,
  startedAt: task.startedAt,
  updatedAt: task.updatedAt,
  finishedAt: task.finishedAt,
  exitCode: task.exitCode,
  pid: task.pid,
});

const findRunningTask = (name) => {
  for (const task of tasks.values()) {
    if (task.name === name && task.status === "running") {
      return task;
    }
  }
  return null;
};

const findConflictingTask = (name) => {
  const renderCommands = new Set(["render", "fast-render"]);
  for (const task of tasks.values()) {
    if (task.status !== "running") {
      continue;
    }
    if (task.name === name || (renderCommands.has(name) && renderCommands.has(task.name))) {
      return task;
    }
  }
  return null;
};

const cleanupOldTasks = () => {
  const finished = [...tasks.values()]
    .filter((task) => task.status !== "running")
    .sort((a, b) => String(b.finishedAt || "").localeCompare(String(a.finishedAt || "")));

  finished.slice(20).forEach((task) => tasks.delete(task.id));
};

const cleanTextForTts = (text) =>
  stripThinking(text)
    .replace(/^```[a-zA-Z0-9_-]*\s*$/gm, "")
    .replace(/^~~~[a-zA-Z0-9_-]*\s*$/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\n{2,}/g, "\n")
    .replace(/\s+/g, " ")
    .trim();

const mapLimit = async (array, limit, fn) => {
  const results = [];
  const iterator = array.entries();
  const workers = Array.from({ length: limit }, async () => {
    for (const [index, item] of iterator) {
      results[index] = await fn(item, index);
    }
  });
  await Promise.all(workers);
  return results;
};

const configLocalExists = () => existsSync(localConfigPath);

const loadConfig = () => {
  if (!configLocalExists()) {
    return defaultConfig;
  }

  try {
    return mergeConfig(JSON.parse(readFileSync(localConfigPath, "utf8")));
  } catch {
    return defaultConfig;
  }
};

const saveConfig = (config) => {
  const merged = mergeConfig(config);
  writeFileSync(localConfigPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  return merged;
};

const nonEmpty = (value) => String(value ?? "").trim();

const pushOption = (args, flag, value) => {
  const text = nonEmpty(value);
  if (text) {
    args.push(`--${flag}=${text}`);
  }
};

const buildRenderArgs = () => {
  const config = loadConfig();
  const video = config.video;
  const args = [
    remotionCli,
    "render",
    "src/index.ts",
    "DebateTranscript",
    "out/debate.mp4",
    "--props=public/data/render-props.json",
  ];

  pushOption(args, "codec", video.codec);
  if (video.rateControl === "crf") {
    pushOption(args, "crf", video.crf);
  } else {
    pushOption(args, "video-bitrate", video.videoBitrate);
    pushOption(args, "max-rate", video.maxRate);
    pushOption(args, "buffer-size", video.bufferSize);
  }
  pushOption(args, "audio-bitrate", video.audioBitrate);
  pushOption(args, "pixel-format", video.pixelFormat);
  pushOption(args, "concurrency", video.concurrency);
  pushOption(args, "scale", video.scale);
  args.push("--image-format=jpeg");
  pushOption(args, "quality", "85");
  args.push("--gl=angle");
  if (video.codec === "h264") {
    pushOption(args, "x264-preset", video.x264Preset);
  }
  if (video.muted) {
    args.push("--muted");
  }

  return args;
};

const commandMap = {
  still: {
    args: [
      remotionCli,
      "still",
      "src/index.ts",
      "DebateTranscript",
      "out/frame.png",
      "--frame=120",
      "--props=public/data/render-props.json",
    ],
    wait: true,
  },
  render: {
    args: buildRenderArgs,
    wait: true,
  },
  "fast-render": {
    args: [tsxCli, "scripts/fast-render.mjs"],
    wait: true,
  },
  studio: {
    args: [remotionCli, "studio", "src/index.ts", "--props=public/data/render-props.json"],
    wait: false,
  },
};

const jsonResponse = (response, statusCode, body) => {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(body, null, 2)}\n`);
};

const readBody = (request, limitBytes = 24 * 1024 * 1024) => {
  return new Promise((resolveBody, reject) => {
    let total = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      total += chunk.length;
      if (total > limitBytes) {
        reject(new Error("请求体过大，当前限制为 24MB。"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
};

const safeStaticPath = (baseDir, requestPath) => {
  const cleanPath = requestPath === "/" ? "/index.html" : requestPath;
  const decoded = decodeURIComponent(cleanPath.split("?")[0]);
  const resolved = normalize(join(baseDir, decoded));
  if (resolved !== baseDir && !resolved.startsWith(`${baseDir}${sep}`)) {
    return null;
  }
  return resolved;
};

const streamVideo = (request, response, filePath, stats, contentType) => {
  const range = request.headers.range;
  if (!range) {
    response.writeHead(200, {
      "accept-ranges": "bytes",
      "content-length": stats.size,
      "content-type": contentType,
    });
    createReadStream(filePath).pipe(response);
    return;
  }

  const match = /bytes=(\d*)-(\d*)/.exec(range);
  if (!match) {
    response.writeHead(416, { "content-range": `bytes */${stats.size}` });
    response.end();
    return;
  }

  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : stats.size - 1;
  if (start >= stats.size || end >= stats.size || start > end) {
    response.writeHead(416, { "content-range": `bytes */${stats.size}` });
    response.end();
    return;
  }

  response.writeHead(206, {
    "accept-ranges": "bytes",
    "content-length": end - start + 1,
    "content-range": `bytes ${start}-${end}/${stats.size}`,
    "content-type": contentType,
  });
  createReadStream(filePath, { start, end }).pipe(response);
};

const serveStaticFile = (baseDir, requestPath, request, response) => {
  const filePath = safeStaticPath(baseDir, requestPath);
  if (!filePath || !existsSync(filePath)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const stats = statSync(filePath);
  if (!stats.isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const ext = extname(filePath).toLowerCase();
  const contentType = contentTypes[ext] || "application/octet-stream";
  if (ext === ".mp4") {
    streamVideo(request, response, filePath, stats, contentType);
    return;
  }

  response.writeHead(200, { "content-length": stats.size, "content-type": contentType });
  createReadStream(filePath).pipe(response);
};

const serveStatic = (request, response) => {
  serveStaticFile(uiDir, new URL(request.url, `http://${host}:${port}`).pathname, request, response);
};

const serveOutput = (request, response) => {
  const pathname = new URL(request.url, `http://${host}:${port}`).pathname.replace(/^\/out/, "") || "/";
  serveStaticFile(outDir, pathname, request, response);
};

const loadCurrentData = () => {
  const sessionPath = join(publicDataDir, "session-export.json");
  const propsPath = join(publicDataDir, "render-props.json");
  const session = existsSync(sessionPath) ? JSON.parse(readFileSync(sessionPath, "utf8")) : null;
  const props = existsSync(propsPath) ? JSON.parse(readFileSync(propsPath, "utf8")) : null;
  return { session, props };
};

const outputAsset = (name) => {
  const filePath = join(outDir, name);
  if (!existsSync(filePath)) {
    return { exists: false, name, url: null, size: 0, updatedAt: null };
  }

  const stats = statSync(filePath);
  return {
    exists: true,
    name,
    url: `/out/${encodeURIComponent(name)}?v=${Math.floor(stats.mtimeMs)}`,
    size: stats.size,
    updatedAt: stats.mtime.toISOString(),
  };
};

const loadOutputAssets = () => ({
  frame: outputAsset("frame.png"),
  video: outputAsset("debate.mp4"),
  fastVideo: outputAsset("debate-fast.mp4"),
  outDir,
});

const importJson = async (request, response) => {
  const rawBody = await readBody(request);
  const body = JSON.parse(rawBody || "{}");
  const session = body.session;
  const sourceName = String(body.sourceName || "browser-import.json").trim() || "browser-import.json";
  const title = String(body.title || "").trim();
  const propsPath = join(publicDataDir, "render-props.json");
  const previousProps = existsSync(propsPath) ? JSON.parse(readFileSync(propsPath, "utf8")) : {};
  const previousAudioManifest = String(previousProps.audioManifest || "");
  const keepAudioManifest =
    previousAudioManifest &&
    existsSync(join(publicDir, previousAudioManifest));

  if (!session || !Array.isArray(session.dialogue_history)) {
    jsonResponse(response, 400, { ok: false, message: "缺少 dialogue_history 数组，这不像 Elenchus 导出 JSON。" });
    return;
  }

  mkdirSync(publicDataDir, { recursive: true });
  writeFileSync(join(publicDataDir, "session-export.json"), `${JSON.stringify(session, null, 2)}\n`, "utf8");
  writeFileSync(
    propsPath,
    `${JSON.stringify(
      {
        dataFile: "data/session-export.json",
        sourceName,
        ...(title ? { title } : {}),
        ...(keepAudioManifest ? { audioManifest: previousAudioManifest } : {}),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  jsonResponse(response, 200, { ok: true, message: "已写入 Remotion 输入文件。", sourceName });
};

const hasGeneratedAudio = () => {
  const propsPath = join(publicDataDir, "render-props.json");
  if (!existsSync(propsPath)) {
    return false;
  }
  const props = JSON.parse(readFileSync(propsPath, "utf8"));
  if (!props.audioManifest) {
    return false;
  }
  const manifestPath = join(publicDir, props.audioManifest);
  if (!existsSync(manifestPath)) {
    return false;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  return Array.isArray(manifest.scenes) && manifest.scenes.some((scene) => scene.audioFile);
};

const updateConfig = async (request, response) => {
  const rawBody = await readBody(request, 1024 * 1024);
  const body = JSON.parse(rawBody || "{}");
  const config = saveConfig(body.config || {});
  jsonResponse(response, 200, { ok: true, message: "配置已保存。", config, origin: "saved" });
};

const openOutputDir = (response) => {
  mkdirSync(outDir, { recursive: true });
  const explorerPath = join(process.env.SystemRoot || "C:\\Windows", "explorer.exe");

  try {
    const child = spawn(explorerPath, [outDir], {
      cwd: rootDir,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    jsonResponse(response, 200, { ok: true, message: "已打开视频目录。", outDir });
  } catch (error) {
    jsonResponse(response, 500, {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      outDir,
    });
  }
};

const ttsEndpoint = (baseUrl) => {
  const normalized = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!normalized) {
    return "";
  }
  if (/\/chat\/completions$/i.test(normalized)) {
    return normalized;
  }
  return `${normalized}/chat/completions`;
};

const safeTtsFormat = (format) => {
  const value = String(format || "wav").trim().toLowerCase();
  return ["wav", "mp3", "aac"].includes(value) ? value : "wav";
};

const parseTtsResponse = async (response) => {
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`TTS 请求失败：${response.status} ${errorText.slice(0, 200)}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return parseTtsJson(await response.json());
  }

  return Buffer.from(await response.arrayBuffer());
};

const parseTtsJson = async (data) => {
  const messageAudio = data.choices?.[0]?.message?.audio;
  if (messageAudio?.data) {
    return Buffer.from(messageAudio.data, "base64");
  }

  const audioUrl = data.audio_url || data.url || data.audio;
  if (audioUrl) {
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`无法下载 TTS 音频：${audioResponse.status}`);
    }
    return Buffer.from(await audioResponse.arrayBuffer());
  }

  const base64 = data.audio_base64 || data.data;
  if (base64) {
    return Buffer.from(base64, "base64");
  }

  throw new Error("TTS 返回了 JSON，但未找到 message.audio.data / audio_url / audio_base64 字段。");
};

const fetchAudioBufferWithCurl = async (endpoint, apiKey, body) => {
  const tempDir = mkdtempSync(join(tmpdir(), "elenchus-tts-"));
  const bodyPath = join(tempDir, "body.json");
  writeFileSync(bodyPath, JSON.stringify(body), "utf8");

  const escapeCurlValue = (value) => String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const curlConfig = [
    `url = "${escapeCurlValue(endpoint)}"`,
    'request = "POST"',
    'header = "content-type: application/json"',
    `header = "authorization: Bearer ${escapeCurlValue(apiKey)}"`,
    `data-binary = "@${escapeCurlValue(bodyPath)}"`,
    "location",
    "silent",
    "show-error",
    "max-time = 180",
  ].join("\n");

  const result = spawnSync("curl.exe", ["--config", "-"], {
    cwd: rootDir,
    input: Buffer.from(curlConfig, "utf8"),
    encoding: "buffer",
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true,
  });

  rmSync(tempDir, { recursive: true, force: true });

  if (result.status !== 0) {
    const stderr = result.stderr?.toString("utf8") || "";
    throw new Error(`TTS 网络请求失败：curl 退出码 ${result.status} ${stderr.slice(0, 200)}`);
  }

  const text = result.stdout.toString("utf8");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return result.stdout;
  }

  if (data.error) {
    throw new Error(`TTS 请求失败：${JSON.stringify(data.error).slice(0, 240)}`);
  }
  return parseTtsJson(data);
};

const fetchAudioBuffer = async (tts, text) => {
  const format = safeTtsFormat(tts.format);
  const voice = String(tts.voice || "").trim() || "mimo_default";
  const endpoint = ttsEndpoint(tts.baseUrl);
  const body = {
    model: tts.model || "mimo-v2.5-tts",
    messages: [{ role: "assistant", content: text }],
    audio: {
      voice,
      format,
      sample_rate: Number(tts.sampleRate) || 24000,
      speed: Number(tts.speed) || 1,
    },
    stream: false,
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tts.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    return await parseTtsResponse(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED/i.test(message)) {
      throw error;
    }
    return fetchAudioBufferWithCurl(endpoint, tts.apiKey, body);
  }
};

const generateTts = async (request, response) => {
  const config = loadConfig();
  const tts = config.tts;

  if (!tts.baseUrl || !tts.apiKey) {
    jsonResponse(response, 400, { ok: false, message: "请先配置 TTS 地址和 API Key。" });
    return;
  }

  const { session } = loadCurrentData();
  if (!session) {
    jsonResponse(response, 400, { ok: false, message: "请先导入 Elenchus 导出 JSON。" });
    return;
  }

  const history = Array.isArray(session.dialogue_history) ? session.dialogue_history : [];
  const turns = groupByTurn(history);
  const scenes = [];

  mkdirSync(audioDir, { recursive: true });

  await mapLimit(turns, Number(tts.concurrency) || 2, async ([turn, items]) => {
    const speakers = items.filter(({ entry }) => !nonSpeakerRoles.has(String(entry.role || "")));
    const text = speakers
      .map(({ entry }) => cleanTextForTts(entry.content))
      .filter(Boolean)
      .join("。");
    if (!text) {
      return;
    }

    const id = `turn-${turn + 1}`;
    const fileName = `${id}.${tts.format || "mp3"}`;
    const audioPath = join(audioDir, fileName);
    const audioFile = `audio/${fileName}`;

    try {
      const buffer = await fetchAudioBuffer(tts, text);
      writeFileSync(audioPath, buffer);
      const metadata = await parseFile(audioPath);
      const durationFrames = Math.ceil((metadata.format.duration || 0) * FPS);
      if (durationFrames <= 0) {
        throw new Error("无法解析音频时长。");
      }
      scenes.push({ id, audioFile, durationFrames });
    } catch (error) {
      scenes.push({ id, audioFile, durationFrames: 0, error: error instanceof Error ? error.message : String(error) });
    }
  });

  const okScenes = scenes.filter((s) => s.durationFrames > 0);
  const failedScenes = scenes.filter((s) => s.error);

  if (okScenes.length === 0) {
    jsonResponse(response, 500, {
      ok: false,
      message: `配音生成失败。${failedScenes.map((s) => `${s.id}: ${s.error}`).join("；")}`,
    });
    return;
  }

  mkdirSync(publicDataDir, { recursive: true });
  writeFileSync(
    join(publicDataDir, "session-audio.json"),
    `${JSON.stringify({ scenes: okScenes }, null, 2)}\n`,
    "utf8",
  );

  const propsPath = join(publicDataDir, "render-props.json");
  const props = existsSync(propsPath) ? JSON.parse(readFileSync(propsPath, "utf8")) : {};
  props.audioManifest = "data/session-audio.json";
  writeFileSync(propsPath, `${JSON.stringify(props, null, 2)}\n`, "utf8");

  jsonResponse(response, 200, {
    ok: true,
    message: `已为 ${okScenes.length} 个场景生成配音${failedScenes.length ? `，${failedScenes.length} 个失败` : ""}。`,
    scenes: okScenes,
    failed: failedScenes,
  });
};

const runCommand = async (request, response) => {
  const rawBody = await readBody(request, 1024 * 1024);
  const body = JSON.parse(rawBody || "{}");
  const name = String(body.command || "");
  const command = commandMap[name];

  if (!command) {
    jsonResponse(response, 400, { ok: false, message: "未知命令。" });
    return;
  }

  const args = typeof command.args === "function" ? command.args() : command.args;
  const commandText = [process.execPath, ...args].join(" ");

  if ((name === "render" || name === "fast-render") && !loadConfig().video.muted && !hasGeneratedAudio()) {
    jsonResponse(response, 400, {
      ok: false,
      message: "还没有生成配音。请先在 TTS 页点击“生成配音”，成功后再渲染视频。",
    });
    return;
  }

  if (!command.wait) {
    const child = spawn(process.execPath, args, {
      cwd: rootDir,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    jsonResponse(response, 200, {
      ok: true,
      message: "已在后台启动 Remotion Studio。",
      studioUrl: "http://localhost:3000",
      pid: child.pid,
    });
    return;
  }

  const running = findConflictingTask(name);
  if (running) {
    jsonResponse(response, 409, {
      ok: false,
      message: "已有渲染或抽帧任务在执行中，请等待当前任务完成。",
      task: publicTask(running),
    });
    return;
  }

  const child = spawn(process.execPath, args, {
    cwd: rootDir,
    shell: false,
    windowsHide: true,
  });

  const now = new Date().toISOString();
  const task = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    status: "running",
    message: `${name === "render" ? "渲染" : "抽帧"}已开始。`,
    command: commandText,
    output: `正在执行：${name}\n${commandText}\n\n`,
    startedAt: now,
    updatedAt: now,
    finishedAt: null,
    exitCode: null,
    pid: child.pid,
    child,
  };
  tasks.set(task.id, task);

  child.stdout.on("data", (chunk) => {
    appendTaskOutput(task, chunk);
  });
  child.stderr.on("data", (chunk) => {
    appendTaskOutput(task, chunk);
  });
  child.on("error", (error) => {
    task.status = "failed";
    task.message = error.message;
    task.finishedAt = new Date().toISOString();
    task.updatedAt = task.finishedAt;
    appendTaskOutput(task, `\n启动失败：${error.message}\n`);
    cleanupOldTasks();
  });
  child.on("close", (code) => {
    task.exitCode = code;
    task.status = code === 0 ? "finished" : "failed";
    task.message = code === 0 ? "命令执行完成。" : `命令失败，退出码 ${code}。`;
    task.finishedAt = new Date().toISOString();
    task.updatedAt = task.finishedAt;
    task.child = null;
    appendTaskOutput(task, `\n${task.message}\n`);
    cleanupOldTasks();
  });

  jsonResponse(response, 202, {
    ok: true,
    message: `${name === "render" ? "渲染" : "抽帧"}任务已启动，日志会自动刷新。`,
    task: publicTask(task),
  });
};

const router = async (request, response) => {
  try {
    const { pathname } = new URL(request.url, `http://${host}:${port}`);

    if (request.method === "GET" && pathname === "/api/current") {
      jsonResponse(response, 200, { ok: true, ...loadCurrentData() });
      return;
    }

    if (request.method === "GET" && pathname === "/api/assets") {
      jsonResponse(response, 200, { ok: true, ...loadOutputAssets() });
      return;
    }

    if (request.method === "GET" && pathname === "/api/config") {
      jsonResponse(response, 200, {
        ok: true,
        config: loadConfig(),
        origin: configLocalExists() ? "local" : "default",
      });
      return;
    }

    if (request.method === "GET" && pathname === "/api/tasks") {
      jsonResponse(response, 200, { ok: true, tasks: [...tasks.values()].map(publicTask) });
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/api/tasks/")) {
      const id = decodeURIComponent(pathname.slice("/api/tasks/".length));
      const task = tasks.get(id);
      if (!task) {
        jsonResponse(response, 404, { ok: false, message: "任务不存在，可能是服务刚重启过。" });
        return;
      }
      jsonResponse(response, 200, { ok: true, task: publicTask(task) });
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/out/")) {
      serveOutput(request, response);
      return;
    }

    if (request.method === "POST" && pathname === "/api/import") {
      await importJson(request, response);
      return;
    }

    if (request.method === "POST" && pathname === "/api/config") {
      await updateConfig(request, response);
      return;
    }

    if (request.method === "POST" && pathname === "/api/run") {
      await runCommand(request, response);
      return;
    }

    if (request.method === "POST" && pathname === "/api/open-out") {
      openOutputDir(response);
      return;
    }

    if (request.method === "POST" && pathname === "/api/generate-tts") {
      await generateTts(request, response);
      return;
    }

    if (request.method === "GET") {
      serveStatic(request, response);
      return;
    }

    jsonResponse(response, 405, { ok: false, message: "Method not allowed" });
  } catch (error) {
    jsonResponse(response, 500, { ok: false, message: error instanceof Error ? error.message : String(error) });
  }
};

createServer(router).listen(port, host, () => {
  console.log(`Elenchus video UI: http://${host}:${port}`);
});
