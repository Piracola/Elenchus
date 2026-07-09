import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFile } from "music-metadata";
import { buildVideoScript, cleanTextForTts as cleanSegmentTextForTts, segmentCuesToLineCues } from "../src/videoScript.ts";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const uiDir = join(rootDir, "ui");
const publicDir = join(rootDir, "public");
const publicDataDir = join(rootDir, "public", "data");
const outDir = join(rootDir, "out");
const localConfigPath = join(rootDir, "config.local.json");
const remotionCli = join(rootDir, "node_modules", "@remotion", "cli", "remotion-cli.js");
const tsxCli = join(rootDir, "node_modules", "tsx", "dist", "cli.mjs");
const ffmpegPath = join(rootDir, "node_modules", "@remotion", "compositor-win32-x64-msvc", "ffmpeg.exe");
const edgeTtsBridgePath = join(rootDir, "scripts", "edge_tts_bridge.py");
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
    provider: "edge",
    baseUrl: "",
    apiKey: "",
    model: "",
    voice: "zh-CN-XiaoxiaoNeural",
    roleVoices: {
      proposer: "zh-CN-XiaoxiaoNeural",
      opposer: "zh-CN-YunxiNeural",
    },
    format: "mp3",
    sampleRate: "24000",
    speed: "1",
    concurrency: "1",
  },
  script: {
    textPreset: "standard",
  },
};

const mergeConfig = (config) => {
  const tts = { ...defaultConfig.tts, ...(config?.tts || {}) };
  return {
    video: { ...defaultConfig.video, ...(config?.video || {}) },
    tts: {
      ...tts,
      roleVoices: { ...defaultConfig.tts.roleVoices, ...(config?.tts?.roleVoices || {}) },
    },
    script: { ...defaultConfig.script, ...(config?.script || {}) },
  };
};

const FPS = 30;
const audioDir = join(rootDir, "public", "audio");
const tasks = new Map();
const MAX_TASK_OUTPUT = 240000;
const TTS_CHUNK_TARGET_CHARS = 680;
const TTS_RETRY_MIN_CHARS = 180;
const TTS_ERROR_PREVIEW_CHARS = 200;

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

const splitLongTtsPart = (text, maxChars) => {
  if (text.length <= maxChars) {
    return [text];
  }

  const clauseTokens = text.split(/([，、：,:])/).filter(Boolean);
  const chunks = [];
  let current = "";

  for (const token of clauseTokens) {
    if (token.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let index = 0; index < token.length; index += maxChars) {
        chunks.push(token.slice(index, index + maxChars));
      }
      continue;
    }

    if (!current) {
      current = token;
      continue;
    }

    if (current.length + token.length <= maxChars) {
      current += token;
    } else {
      chunks.push(current);
      current = token;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
};

const splitTextForTts = (text, maxChars = TTS_CHUNK_TARGET_CHARS) => {
  const normalized = cleanTextForTts(text);
  if (!normalized) {
    return [];
  }

  const sentenceTokens = normalized.split(/([。！？；!?;\n]+)/).filter(Boolean);
  const sentences = [];
  let buffer = "";

  for (const token of sentenceTokens) {
    buffer += token;
    if (/[。！？；!?;\n]/.test(token)) {
      sentences.push(buffer.trim());
      buffer = "";
    }
  }
  if (buffer.trim()) {
    sentences.push(buffer.trim());
  }

  const parts = sentences.flatMap((sentence) => splitLongTtsPart(sentence, maxChars));
  const chunks = [];
  let current = "";

  for (const part of parts) {
    const value = part.trim();
    if (!value) {
      continue;
    }
    if (!current) {
      current = value;
      continue;
    }
    if (current.length + value.length <= maxChars) {
      current += value;
    } else {
      chunks.push(current);
      current = value;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
};

const nonSpeakerRoles = new Set([
  "judge",
  "system",
  "fact_checker",
  "group_discussion",
  "consensus_summary",
  "audience",
  "error",
  "sophistry_round_report",
  "sophistry_final_report",
]);

const groupByTurn = (history) => {
  const turns = new Map();
  history.forEach((entry, index) => {
    const turn = Number.isInteger(entry?.turn) && entry.turn >= 0 ? entry.turn : 0;
    const items = turns.get(turn) || [];
    items.push({ entry, index });
    turns.set(turn, items);
  });
  return [...turns.entries()].sort((a, b) => a[0] - b[0]);
};

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
  const scriptPath = props?.scriptFile ? join(publicDir, props.scriptFile) : join(publicDataDir, "video-script.json");
  const script = existsSync(scriptPath) ? JSON.parse(readFileSync(scriptPath, "utf8")) : null;
  return { session, props, script };
};

const scriptStats = (script) => {
  const rounds = Array.isArray(script?.rounds) ? script.rounds : [];
  const speakerSegments = rounds.reduce((sum, round) => sum + (round.speakerSegments?.length || 0), 0);
  const judgeSegments = rounds.reduce((sum, round) => sum + (round.judgeSegments?.length || 0), 0);
  const scoreSegments = rounds.reduce((sum, round) => sum + (round.scoreSegments?.length || 0), 0);
  return {
    rounds: rounds.length,
    speakerSegments,
    judgeSegments,
    scoreSegments,
    totalSegments: speakerSegments + judgeSegments + scoreSegments,
    preset: script?.segmentation?.mode || "standard",
  };
};

const loadAudioManifestForProps = (props) => {
  if (!props?.audioManifest) {
    return null;
  }
  const manifestPath = join(publicDir, props.audioManifest);
  if (!existsSync(manifestPath)) {
    return null;
  }
  return JSON.parse(readFileSync(manifestPath, "utf8"));
};

const audioManifestMatchesScript = (props, script) => {
  const manifest = loadAudioManifestForProps(props);
  return Boolean(
    manifest &&
      script?.scriptHash &&
      manifest.scriptHash === script.scriptHash &&
      Array.isArray(manifest.scenes) &&
      manifest.scenes.some((scene) => scene.audioFile),
  );
};

const writeVideoScriptForSession = (session, props = {}, options = {}) => {
  if (!session || !Array.isArray(session.dialogue_history)) {
    return { props, script: null };
  }

  mkdirSync(publicDataDir, { recursive: true });
  const config = options.config || loadConfig();
  const textPreset = String(config.script?.textPreset || "standard");
  const script = buildVideoScript(session, textPreset);
  const scriptFile = "data/video-script.json";
  const scriptPath = join(publicDir, scriptFile);
  writeFileSync(scriptPath, `${JSON.stringify(script, null, 2)}\n`, "utf8");

  const nextProps = {
    ...props,
    dataFile: props.dataFile || "data/session-export.json",
    scriptFile,
    textPreset,
  };

  if (nextProps.audioManifest && !audioManifestMatchesScript(nextProps, script)) {
    delete nextProps.audioManifest;
  }

  const propsPath = join(publicDataDir, "render-props.json");
  writeFileSync(propsPath, `${JSON.stringify(nextProps, null, 2)}\n`, "utf8");
  return { props: nextProps, script };
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
  const nextProps = {
    dataFile: "data/session-export.json",
    sourceName,
    ...(title ? { title } : {}),
    ...(keepAudioManifest ? { audioManifest: previousAudioManifest } : {}),
  };
  const { props, script } = writeVideoScriptForSession(session, nextProps);

  jsonResponse(response, 200, {
    ok: true,
    message: "已写入 Remotion 输入文件，并生成视频脚本切分层。",
    sourceName,
    props,
    scriptStats: scriptStats(script),
  });
};

const hasGeneratedAudio = () => {
  const { props, script } = loadCurrentData();
  return audioManifestMatchesScript(props, script);
};

const updateConfig = async (request, response) => {
  const rawBody = await readBody(request, 1024 * 1024);
  const body = JSON.parse(rawBody || "{}");
  const config = saveConfig(body.config || {});
  const { session, props } = loadCurrentData();
  let script = null;
  if (session && props) {
    script = writeVideoScriptForSession(session, props, { config }).script;
  }
  jsonResponse(response, 200, {
    ok: true,
    message: script ? "配置已保存，并按新文案切分设置刷新视频脚本。" : "配置已保存。",
    config,
    origin: "saved",
    scriptStats: scriptStats(script),
  });
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

const runFfmpeg = (args) =>
  new Promise((resolveRun, reject) => {
    let stderr = "";
    const child = spawn(ffmpegPath, args, {
      cwd: rootDir,
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 16000) {
        stderr = stderr.slice(-16000);
      }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      reject(new Error(`ffmpeg 处理音频失败：${stderr.trim().slice(-400) || `退出码 ${code}`}`));
    });
  });

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

const ttsProvider = (tts) => String(tts?.provider || "edge").trim().toLowerCase();

const effectiveTtsFormat = (tts) => (ttsProvider(tts) === "edge" ? "mp3" : safeTtsFormat(tts?.format));

const edgeVoice = (tts) => {
  const voice = String(tts?.voice || "").trim();
  if (!voice || voice === "mimo_default") {
    return "zh-CN-XiaoxiaoNeural";
  }
  return voice;
};

const roleVoiceForTts = (tts, role) => {
  if (ttsProvider(tts) !== "edge") {
    return String(tts?.voice || "").trim();
  }
  const roleVoice = String(tts?.roleVoices?.[role] || "").trim();
  return roleVoice || edgeVoice(tts);
};

const ttsForSegment = (tts, segment) => ({
  ...tts,
  voice: roleVoiceForTts(tts, segment?.role),
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const edgeRateFromSpeed = (speed) => {
  const numeric = Number(speed);
  const rate = Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
  const percent = clamp(Math.round((rate - 1) * 100), -50, 100);
  return `${percent >= 0 ? "+" : ""}${percent}%`;
};

const edgeProsodyValue = (value, fallback) => {
  const text = String(value || "").trim();
  return text || fallback;
};

const findPythonCommand = () => {
  const candidates = [
    process.env.PYTHON ? { command: process.env.PYTHON, args: [] } : null,
    { command: "python", args: [] },
    { command: "py", args: ["-3"] },
  ].filter(Boolean);

  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, [...candidate.args, "--version"], {
      cwd: rootDir,
      encoding: "utf8",
      windowsHide: true,
    });
    if (result.status === 0) {
      return candidate;
    }
  }

  return null;
};

const synthesizeEdgeAudioFile = async (tts, text, outputPath) => {
  const python = findPythonCommand();
  if (!python) {
    throw new Error("未找到 Python。Edge TTS 需要 Python 运行环境，请先安装 Python 3。");
  }

  const tempDir = mkdtempSync(join(tmpdir(), "elenchus-edge-tts-"));
  const textPath = join(tempDir, "input.txt");
  writeFileSync(textPath, text, "utf8");

  const args = [
    ...python.args,
    edgeTtsBridgePath,
    "--text-file",
    textPath,
    "--output",
    outputPath,
    "--voice",
    edgeVoice(tts),
    "--rate",
    edgeRateFromSpeed(tts.speed),
    "--volume",
    edgeProsodyValue(tts.volume, "+0%"),
    "--pitch",
    edgeProsodyValue(tts.pitch, "+0Hz"),
  ];

  try {
    await new Promise((resolveRun, reject) => {
      let stderr = "";
      const child = spawn(python.command, args, {
        cwd: rootDir,
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
        if (stderr.length > 16000) {
          stderr = stderr.slice(-16000);
        }
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0 && existsSync(outputPath) && statSync(outputPath).size > 0) {
          resolveRun();
          return;
        }

        const detail = stderr.trim().slice(-800);
        reject(new Error(detail || `Edge TTS 退出码 ${code}`));
      });
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
};

const parseTtsResponse = async (response) => {
  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    const errorText = await response.text().catch(() => "");
    if (/text\/html/i.test(contentType) && response.status >= 500) {
      throw new Error(`TTS 中转服务超时或网关错误（${response.status}，返回了 HTML 错页）。通常是单次文本过长或上游生成超时。`);
    }
    throw new Error(`TTS 请求失败：${response.status} ${errorText.slice(0, TTS_ERROR_PREVIEW_CHARS)}`);
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
    if (/^\s*(<!DOCTYPE html>|<html\b)/i.test(text)) {
      throw new Error("TTS 中转服务超时或网关错误（返回了 HTML 错页）。通常是单次文本过长或上游生成超时。");
    }
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

const isRetryableTtsError = (error) => {
  const message = error instanceof Error ? error.message : String(error);
  return /504|网关错误|超时|timed out|gateway|html 错页|text\/html|<!doctype html>/i.test(message);
};

const synthesizeChunkFiles = async (tts, text, workDir, prefix, maxChars = TTS_CHUNK_TARGET_CHARS) => {
  const chunks = splitTextForTts(text, maxChars);
  const files = [];
  const format = effectiveTtsFormat(tts);
  const isEdge = ttsProvider(tts) === "edge";

  for (const [index, chunk] of chunks.entries()) {
    const chunkText = cleanTextForTts(chunk);
    if (!chunkText) {
      continue;
    }

    const filePath = join(workDir, `${prefix}-${String(index + 1).padStart(3, "0")}.${format}`);
    try {
      if (isEdge) {
        await synthesizeEdgeAudioFile(tts, chunkText, filePath);
      } else {
        const buffer = await fetchAudioBuffer(tts, chunkText);
        writeFileSync(filePath, buffer);
      }
      files.push(filePath);
    } catch (error) {
      if (!isRetryableTtsError(error) || chunkText.length <= TTS_RETRY_MIN_CHARS) {
        throw new Error(`片段 ${index + 1} 生成失败（约 ${chunkText.length} 字）：${error instanceof Error ? error.message : String(error)}`);
      }

      const smallerMaxChars = Math.max(TTS_RETRY_MIN_CHARS, Math.floor(chunkText.length / 2));
      const retryFiles = await synthesizeChunkFiles(
        tts,
        chunkText,
        workDir,
        `${prefix}-${String(index + 1).padStart(3, "0")}`,
        smallerMaxChars,
      );
      files.push(...retryFiles);
    }
  }

  return files;
};

const concatAudioFiles = async (inputPaths, outputPath, format) => {
  if (inputPaths.length === 0) {
    throw new Error("没有可拼接的音频片段。");
  }
  if (inputPaths.length === 1) {
    copyFileSync(inputPaths[0], outputPath);
    return;
  }

  const tempDir = mkdtempSync(join(tmpdir(), "elenchus-tts-concat-"));
  const listPath = join(tempDir, "concat-list.txt");
  const lines = inputPaths.map((filePath) => `file '${filePath.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`);
  writeFileSync(listPath, `${lines.join("\n")}\n`, "utf8");

  const args = ["-hide_banner", "-y", "-f", "concat", "-safe", "0", "-i", listPath, "-vn"];
  if (format === "wav") {
    args.push("-c:a", "pcm_s16le");
  } else if (format === "mp3") {
    args.push("-c:a", "libmp3lame", "-b:a", "128k");
  } else {
    args.push("-c:a", "aac", "-b:a", "128k");
  }
  args.push(outputPath);

  try {
    await runFfmpeg(args);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
};

const safeFileToken = (value) =>
  String(value || "segment")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "segment";

const generateTts = async (request, response) => {
  const config = loadConfig();
  const tts = config.tts;
  const provider = ttsProvider(tts);
  const providerLabel = provider === "edge" ? "Edge TTS" : provider === "mimo" ? "MiMo TTS" : "自定义 TTS";
  const format = effectiveTtsFormat(tts);

  if (provider !== "edge" && (!tts.baseUrl || !tts.apiKey)) {
    jsonResponse(response, 400, { ok: false, message: "请先配置 TTS 地址和 API Key。" });
    return;
  }

  const { session, props } = loadCurrentData();
  if (!session) {
    jsonResponse(response, 400, { ok: false, message: "请先导入 Elenchus 导出 JSON。" });
    return;
  }

  const { props: refreshedProps, script } = writeVideoScriptForSession(session, props || {}, { config });
  const requiredTurns = (script?.rounds || [])
    .map((round) => ({
      round,
      segments: (round.speakerSegments || []).filter((segment) => cleanSegmentTextForTts(segment.text)),
    }))
    .filter(({ segments }) => segments.length > 0);

  mkdirSync(audioDir, { recursive: true });

  const concurrency = clamp(Math.round(Number(tts.concurrency) || (provider === "edge" ? 1 : 2)), 1, provider === "edge" ? 2 : 8);
  const scenes = await mapLimit(requiredTurns, concurrency, async ({ round, segments }) => {
    const id = round.id;
    const fileName = `${id}.${format}`;
    const audioPath = join(audioDir, fileName);
    const audioFile = `audio/${fileName}`;
    const tempDir = mkdtempSync(join(tmpdir(), `elenchus-${id}-`));

    try {
      const segmentAudioFiles = [];
      const segmentCues = [];
      let cursorFrame = 0;

      for (const [index, segment] of segments.entries()) {
        const text = cleanSegmentTextForTts(segment.text);
        if (!text) {
          continue;
        }

        const token = `${safeFileToken(segment.id)}-${String(index + 1).padStart(3, "0")}`;
        const segmentPath = join(tempDir, `${token}.${format}`);
        const chunkFiles = await synthesizeChunkFiles(ttsForSegment(tts, segment), text, tempDir, token);
        await concatAudioFiles(chunkFiles, segmentPath, format);
        const metadata = await parseFile(segmentPath);
        const segmentFrames = Math.ceil((metadata.format.duration || 0) * FPS);
        if (segmentFrames <= 0) {
          throw new Error(`无法解析 ${segment.id} 的音频时长。`);
        }

        segmentAudioFiles.push(segmentPath);
        segmentCues.push({
          ...segment,
          text,
          charCount: text.replace(/\s+/g, "").length,
          startFrame: cursorFrame,
          endFrame: cursorFrame + segmentFrames,
        });
        cursorFrame += segmentFrames;
      }

      if (segmentAudioFiles.length === 0) {
        return null;
      }
      await concatAudioFiles(segmentAudioFiles, audioPath, format);
      const metadata = await parseFile(audioPath);
      const durationFrames = Math.max(cursorFrame, Math.ceil((metadata.format.duration || 0) * FPS));
      if (durationFrames <= 0) {
        throw new Error("无法解析音频时长。");
      }
      return { id, audioFile, durationFrames, segmentCues, lineCues: segmentCuesToLineCues(segmentCues) };
    } catch (error) {
      rmSync(audioPath, { force: true });
      return { id, audioFile, durationFrames: 0, error: error instanceof Error ? error.message : String(error) };
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const realizedScenes = scenes.filter(Boolean);
  const okScenes = realizedScenes
    .filter((s) => s.durationFrames > 0)
    .sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
  const failedScenes = realizedScenes.filter((s) => s.error);

  if (okScenes.length === 0 || failedScenes.length > 0) {
    jsonResponse(response, 502, {
      ok: false,
      message:
        okScenes.length === 0
          ? `${providerLabel} 配音生成失败。${failedScenes.map((s) => `${s.id}: ${s.error}`).join("；")}`
          : `${providerLabel} 配音未全部生成成功。已完成 ${okScenes.length} 轮，失败 ${failedScenes.length} 轮。${failedScenes.map((s) => `${s.id}: ${s.error}`).join("；")}`,
      scenes: okScenes,
      failed: failedScenes,
    });
    return;
  }

  mkdirSync(publicDataDir, { recursive: true });
  writeFileSync(
    join(publicDataDir, "session-audio.json"),
    `${JSON.stringify(
      {
        scriptFile: refreshedProps.scriptFile || "data/video-script.json",
        scriptHash: script?.scriptHash,
        scenes: okScenes,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const propsPath = join(publicDataDir, "render-props.json");
  const renderProps = existsSync(propsPath) ? JSON.parse(readFileSync(propsPath, "utf8")) : {};
  renderProps.audioManifest = "data/session-audio.json";
  writeFileSync(propsPath, `${JSON.stringify(renderProps, null, 2)}\n`, "utf8");

  jsonResponse(response, 200, {
    ok: true,
    message: `${providerLabel} 已为 ${okScenes.length} 个场景生成配音${failedScenes.length ? `，${failedScenes.length} 个失败` : ""}。`,
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

  if (["still", "render", "fast-render", "studio"].includes(name)) {
    const { session, props } = loadCurrentData();
    if (session && props) {
      writeVideoScriptForSession(session, props);
    }
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
