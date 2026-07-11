import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildVideoScript, cleanTextForTts as cleanSegmentTextForTts, segmentCuesToLineCues } from "../src/videoScript.ts";
import {
  createTtsCacheKey,
  EDGE_TTS_RETRY_DELAYS_MS,
  EDGE_TTS_VERSION,
  MAX_TTS_REQUESTS_PER_SEGMENT,
  normalizeTtsRole,
  runRecoverableTtsChunk,
  splitFailedTtsChunk,
  splitTextForTts as splitEdgeTextForTts,
} from "../src/ttsPipeline.ts";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const uiDir = join(rootDir, "ui");
const publicDir = join(rootDir, "public");
const publicDataDir = join(rootDir, "public", "data");
const outDir = join(rootDir, "out");
const localConfigPath = join(rootDir, "config.local.json");
const logDir = join(rootDir, "logs");
const edgeTtsErrorLogPath = join(logDir, "edge-tts-errors.log");
const remotionCli = join(rootDir, "node_modules", "@remotion", "cli", "remotion-cli.js");
const tsxCli = join(rootDir, "node_modules", "tsx", "dist", "cli.mjs");
const ffmpegPath = join(rootDir, "node_modules", "@remotion", "compositor-win32-x64-msvc", "ffmpeg.exe");
const ffprobePath = join(rootDir, "node_modules", "@remotion", "compositor-win32-x64-msvc", "ffprobe.exe");
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
      affirmative: "zh-CN-XiaoxiaoNeural",
      negative: "zh-CN-YunxiNeural",
      judge: "zh-CN-YunyangNeural",
      narrator: "zh-CN-XiaoyiNeural",
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
  const configuredRoleVoices = config?.tts?.roleVoices || {};
  return {
    video: { ...defaultConfig.video, ...(config?.video || {}) },
    tts: {
      ...tts,
      roleVoices: {
        ...defaultConfig.tts.roleVoices,
        ...configuredRoleVoices,
        affirmative: configuredRoleVoices.affirmative || configuredRoleVoices.proposer || defaultConfig.tts.roleVoices.affirmative,
        negative: configuredRoleVoices.negative || configuredRoleVoices.opposer || defaultConfig.tts.roleVoices.negative,
      },
    },
    script: { ...defaultConfig.script, ...(config?.script || {}) },
  };
};

const FPS = 30;
const audioDir = join(rootDir, "public", "audio");
const audioChunkDir = join(audioDir, "chunks");
const ttsStatePath = join(publicDataDir, "tts-state.json");
const edgeVoicesCachePath = join(publicDataDir, "edge-voices-cache.json");
const serverPidPath = process.env.ELENCHUS_VIDEO_PID_FILE || join(rootDir, ".video-ui.pid");
const isTestMode = process.env.ELENCHUS_VIDEO_TEST_MODE === "1";
const tasks = new Map();
const managedChildren = new Set();
let studioChild = null;
let runtimeHealth = { ok: false, checks: [], message: "正在检查运行环境。" };
const MAX_TASK_OUTPUT = 240000;
const TTS_CHUNK_TARGET_CHARS = 680;
const EDGE_TTS_CHILD_TIMEOUT_MS = 60000;
const TTS_ERROR_PREVIEW_CHARS = 200;

const stripAnsi = (text) => String(text || "").replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");

const appendTaskOutput = (task, chunk) => {
  task.output += stripAnsi(chunk.toString());
  if (task.output.length > MAX_TASK_OUTPUT) {
    task.output = `...前面的日志已省略...\n${task.output.slice(-MAX_TASK_OUTPUT)}`;
  }
  task.lastOutputAt = new Date().toISOString();
  task.updatedAt = task.lastOutputAt;
};

const publicTask = (task) => ({
  id: task.id,
  name: task.name,
  status: task.status,
  ok: task.status === "succeeded",
  message: task.message,
  command: task.command,
  output: task.output,
  startedAt: task.startedAt,
  updatedAt: task.updatedAt,
  finishedAt: task.finishedAt,
  lastOutputAt: task.lastOutputAt,
  exitCode: task.exitCode,
  pid: task.pid,
  progress: task.progress || null,
});

const findRunningTask = (name) => {
  for (const task of tasks.values()) {
    if (task.name === name && ["queued", "running"].includes(task.status)) {
      return task;
    }
  }
  return null;
};

const findConflictingTask = (name) => {
  const renderCommands = new Set(["render", "fast-render"]);
  for (const task of tasks.values()) {
    if (!["queued", "running"].includes(task.status)) {
      continue;
    }
    if (
      task.name === name ||
      (renderCommands.has(name) && renderCommands.has(task.name))
    ) {
      return task;
    }
  }
  return null;
};

const cleanupOldTasks = () => {
  const finished = [...tasks.values()]
    .filter((task) => !["queued", "running"].includes(task.status))
    .sort((a, b) => String(b.finishedAt || "").localeCompare(String(a.finishedAt || "")));

  finished.slice(20).forEach((task) => tasks.delete(task.id));
};

const trackManagedChild = (child) => {
  managedChildren.add(child);
  const release = () => managedChildren.delete(child);
  child.once("close", release);
  child.once("error", release);
  return child;
};

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
  const normalized = cleanSegmentTextForTts(text);
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

const writeJsonAtomic = (filePath, value) => {
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  rmSync(filePath, { force: true });
  renameSync(tempPath, filePath);
};

const ttsSignature = (tts) =>
  createTtsCacheKey({
    provider: ttsProvider(tts),
    engineVersion: ttsProvider(tts) === "edge" ? EDGE_TTS_VERSION : String(tts?.model || "custom"),
    voice: JSON.stringify({ default: edgeVoice(tts), roles: tts?.roleVoices || {} }),
    speed: tts?.speed || "1",
    volume: tts?.volume || "+0%",
    pitch: tts?.pitch || "+0Hz",
    format: effectiveTtsFormat(tts),
    text: "",
  });

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
      "--frame=180",
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

const createRenderSnapshot = () => {
  const { session, props, script } = loadCurrentData();
  if (!props || !script) throw new Error("缺少可渲染的视频脚本。");
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dataRelativeDir = `data/render-snapshots/${token}`;
  const audioRelativeDir = `audio/render-snapshots/${token}`;
  const dataSnapshotDir = join(publicDir, dataRelativeDir);
  const audioSnapshotDir = join(publicDir, audioRelativeDir);
  mkdirSync(dataSnapshotDir, { recursive: true });
  mkdirSync(audioSnapshotDir, { recursive: true });

  const snapshotProps = { ...props, scriptFile: `${dataRelativeDir}/video-script.json` };
  writeJsonAtomic(join(dataSnapshotDir, "video-script.json"), script);
  if (session) {
    snapshotProps.dataFile = `${dataRelativeDir}/session-export.json`;
    writeJsonAtomic(join(dataSnapshotDir, "session-export.json"), session);
  }
  const manifest = loadAudioManifestForProps(props);
  if (manifest) {
    const snapshotManifest = {
      ...manifest,
      scenes: manifest.scenes.map((scene, index) => {
        const relative = `${audioRelativeDir}/${String(index + 1).padStart(3, "0")}-${basename(scene.audioFile)}`;
        copyFileSync(join(publicDir, scene.audioFile), join(publicDir, relative));
        return { ...scene, audioFile: relative };
      }),
    };
    if (manifest.sessionAudioFile && existsSync(join(publicDir, manifest.sessionAudioFile))) {
      const relative = `${audioRelativeDir}/session-${basename(manifest.sessionAudioFile)}`;
      copyFileSync(join(publicDir, manifest.sessionAudioFile), join(publicDir, relative));
      snapshotManifest.sessionAudioFile = relative;
    }
    snapshotProps.audioManifest = `${dataRelativeDir}/session-audio.json`;
    writeJsonAtomic(join(dataSnapshotDir, "session-audio.json"), snapshotManifest);
  }
  const propsPath = join(dataSnapshotDir, "render-props.json");
  writeJsonAtomic(propsPath, snapshotProps);
  return {
    propsPath,
    propsArgument: `${dataRelativeDir}/render-props.json`,
    cleanup: () => {
      rmSync(dataSnapshotDir, { recursive: true, force: true });
      rmSync(audioSnapshotDir, { recursive: true, force: true });
    },
  };
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

const audioManifestProblems = (props, script, config = loadConfig()) => {
  const manifest = loadAudioManifestForProps(props);
  const problems = [];
  if (!manifest) return ["缺少 session-audio.json"];
  if (manifest.schemaVersion !== 2) problems.push("音频清单不是 schemaVersion 2");
  if (!["edge", "mimo"].includes(manifest.provider)) problems.push("音频清单使用了不支持的配音供应商");
  if (!script?.scriptHash || manifest.scriptHash !== script.scriptHash) problems.push("音频清单与当前视频脚本不匹配");
  if (manifest.ttsSignature !== ttsSignature(config.tts)) problems.push("音频清单与当前音色或语速配置不匹配");
  if (!manifest.sessionAudioFile || !existsSync(join(publicDir, manifest.sessionAudioFile))) problems.push("缺少整场音频文件");
  if (!Number.isFinite(Number(manifest.durationMs)) || Number(manifest.durationMs) <= 0) problems.push("整场音频时长无效");
  if (!Array.isArray(manifest.scenes)) return [...problems, "音频清单缺少 scenes"];

  for (const round of script?.rounds || []) {
    const expectedSegments = roundTtsSegments(round);
    if (expectedSegments.length === 0) continue;
    const scene = manifest.scenes.find((candidate) => candidate.id === round.id || candidate.roundIndex === round.roundIndex);
    if (!scene) {
      problems.push(`${round.turnLabel || round.id} 缺少整轮音频`);
      continue;
    }
    if (!scene.audioFile || !existsSync(join(publicDir, scene.audioFile))) problems.push(`${round.turnLabel || round.id} 缺少音频文件`);
    if (!Number.isFinite(Number(scene.startMs)) || !Number.isFinite(Number(scene.endMs)) || scene.endMs <= scene.startMs) {
      problems.push(`${round.turnLabel || round.id} 时间范围无效`);
    }
    if (!Array.isArray(scene.cues)) {
      problems.push(`${round.turnLabel || round.id} 缺少 cues`);
      continue;
    }
    const cueSegmentIds = new Set(scene.cues.map((cue) => cue.segmentId));
    for (const segment of expectedSegments) {
      if (!cueSegmentIds.has(segment.id)) problems.push(`${round.turnLabel || round.id} 缺少片段 ${segment.id}`);
    }
    for (const cue of scene.cues) {
      if (!cue.audioFile || !existsSync(join(publicDir, cue.audioFile))) problems.push(`${round.turnLabel || round.id} 缺少请求块 ${cue.chunkId || "unknown"} 的音频`);
      if (!Number.isFinite(Number(cue.startMs)) || !Number.isFinite(Number(cue.endMs)) || cue.endMs <= cue.startMs) {
        problems.push(`${round.turnLabel || round.id} 请求块 ${cue.chunkId || "unknown"} 时间范围无效`);
      }
    }
  }
  return [...new Set(problems)];
};

const audioManifestMatchesScript = (props, script, config = loadConfig()) =>
  audioManifestProblems(props, script, config).length === 0;

const validateAudioManifestForRender = async (props, script, config = loadConfig()) => {
  const problems = audioManifestProblems(props, script, config);
  const manifest = loadAudioManifestForProps(props);
  if (problems.length === 0 && manifest) {
    const files = new Set([
      manifest.sessionAudioFile,
      ...manifest.scenes.flatMap((scene) => [scene.audioFile, ...(scene.cues || []).map((cue) => cue.audioFile)]),
    ]);
    for (const audioFile of files) {
      try {
        await readMediaDurationMs(join(publicDir, audioFile));
      } catch (error) {
        problems.push(`${audioFile} 无法通过 FFprobe：${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(`配音不完整，不能生成带配音视频：${problems.join("；")}`);
  }
  return manifest;
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

  if (nextProps.audioManifest && !audioManifestMatchesScript(nextProps, script, config)) {
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

const SOPHISTRY_ROLES = new Set(["sophistry_round_report", "sophistry_final_report"]);

const detectSophistryEntries = (session) => {
  const history = Array.isArray(session?.dialogue_history) ? session.dialogue_history : [];
  return history.some((entry) => SOPHISTRY_ROLES.has(String(entry?.role || "")));
};

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

  const warnings = [];
  if (detectSophistryEntries(session)) {
    warnings.push("当前导出来自诡辩实验模式，观察员报告不会出现在视频中。视频生成器当前仅支持标准辩论模式。");
  }

  jsonResponse(response, 200, {
    ok: true,
    message: "已写入 Remotion 输入文件，并生成视频脚本切分层。",
    sourceName,
    props,
    scriptStats: scriptStats(script),
    ...(warnings.length ? { warnings } : {}),
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

const runFfmpeg = (args, task = null) =>
  new Promise((resolveRun, reject) => {
    let stderr = "";
    const child = trackManagedChild(spawn(ffmpegPath, args, {
      cwd: rootDir,
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    }));
    if (task) {
      task.child = child;
      task.pid = child.pid;
    }
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 16000) {
        stderr = stderr.slice(-16000);
      }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (task?.child === child) {
        task.child = null;
        task.pid = process.pid;
      }
      if (code === 0) {
        resolveRun();
        return;
      }
      reject(new Error(`ffmpeg 处理音频失败：${stderr.trim().slice(-400) || `退出码 ${code}`}`));
    });
  });

const readMediaDurationMs = async (filePath, { expectAudio = true } = {}) => {
  if (!existsSync(filePath) || statSync(filePath).size <= 0) {
    throw new Error(`媒体文件为空或不存在：${filePath}`);
  }
  const info = await inspectMediaStreams(filePath);
  const streams = Array.isArray(info?.streams) ? info.streams : [];
  const audioStream = streams.find((stream) => stream.codec_type === "audio");
  if (expectAudio && !audioStream) {
    throw new Error(`FFprobe 未检测到音频流：${filePath}`);
  }
  const durationSeconds = Number(audioStream?.duration || info?.format?.duration || 0);
  const durationMs = Math.round(durationSeconds * 1000);
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error(`FFprobe 无法读取媒体时长：${filePath}`);
  }
  return durationMs;
};

const inspectMediaStreams = (filePath) =>
  new Promise((resolveInspect, reject) => {
    let stdout = "";
    let stderr = "";
    const child = trackManagedChild(spawn(ffprobePath, ["-v", "error", "-show_entries", "stream=codec_type,duration", "-show_entries", "format=duration", "-of", "json", filePath], {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }));
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe 校验失败：${stderr.trim() || `退出码 ${code}`}`));
        return;
      }
      try {
        resolveInspect(JSON.parse(stdout));
      } catch {
        reject(new Error("ffprobe 返回了无法解析的结果。"));
      }
    });
  });

const validateRenderedVideo = async (filePath, expectAudio) => {
  const info = await inspectMediaStreams(filePath);
  const streams = Array.isArray(info?.streams) ? info.streams : [];
  const videoStream = streams.find((stream) => stream.codec_type === "video");
  const audioStream = streams.find((stream) => stream.codec_type === "audio");
  const hasVideo = Boolean(videoStream);
  const hasAudio = Boolean(audioStream);
  if (!hasVideo) {
    throw new Error("渲染结果没有视频流。");
  }
  if (expectAudio && !hasAudio) {
    throw new Error("渲染结果没有音频流，请检查配音清单和渲染参数。");
  }
  const videoDuration = Number(videoStream?.duration || info?.format?.duration || 0);
  const audioDuration = Number(audioStream?.duration || info?.format?.duration || 0);
  if (expectAudio && videoDuration > 0 && audioDuration > 0 && Math.abs(videoDuration - audioDuration) > 0.5) {
    throw new Error(`音视频时长不一致：视频 ${videoDuration.toFixed(2)} 秒，音频 ${audioDuration.toFixed(2)} 秒。`);
  }
  return { hasVideo, hasAudio };
};

const killChildProcess = (child) => {
  if (!child || child.killed) {
    return;
  }
  try {
    if (process.platform === "win32" && child.pid) {
      spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      child.kill("SIGKILL");
    }
  } catch {
    // The process may have exited between timeout and cleanup.
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
  const normalizedRole = normalizeTtsRole(role);
  const roleVoice = String(tts?.roleVoices?.[normalizedRole] || "").trim();
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
  const localPython = process.platform === "win32"
    ? join(rootDir, ".venv", "Scripts", "python.exe")
    : join(rootDir, ".venv", "bin", "python");
  const candidates = [
    process.env.PYTHON ? { command: process.env.PYTHON, args: [] } : null,
    existsSync(localPython) ? { command: localPython, args: [] } : null,
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

const runEdgeBridgeJson = async (bridgeArgs, timeoutMs = EDGE_TTS_CHILD_TIMEOUT_MS) => {
  const python = findPythonCommand();
  if (!python) {
    throw new Error("未找到 Python。Edge TTS 需要项目本地 Python 环境。");
  }
  mkdirSync(logDir, { recursive: true });
  const args = [...python.args, edgeTtsBridgePath, ...bridgeArgs, "--log-file", edgeTtsErrorLogPath];
  return new Promise((resolveRun, reject) => {
    let stdout = "";
    let stderr = "";
    const child = trackManagedChild(spawn(python.command, args, {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }));
    const timeout = setTimeout(() => killChildProcess(child), timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timeout);
      const jsonLine = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
      let result;
      try {
        result = jsonLine ? JSON.parse(jsonLine) : null;
      } catch {
        reject(new Error("Edge TTS Bridge 返回了无法解析的结果。"));
        return;
      }
      if (code === 0 && result?.ok) {
        resolveRun(result);
        return;
      }
      reject(new Error(result?.message || stderr.trim().slice(-240) || `Edge TTS Bridge 退出码 ${code}`));
    });
  });
};

const loadEdgeVoices = async ({ refresh = false } = {}) => {
  if (!refresh && existsSync(edgeVoicesCachePath)) {
    try {
      const cached = JSON.parse(readFileSync(edgeVoicesCachePath, "utf8"));
      if (cached?.version === EDGE_TTS_VERSION && Array.isArray(cached.voices) && cached.voices.length > 0) {
        return cached;
      }
    } catch {
      // Refresh a damaged or outdated cache from Edge.
    }
  }
  const result = await runEdgeBridgeJson(["--list-voices", "--timeout", "45"]);
  const cache = {
    schemaVersion: 1,
    version: result.version,
    fetchedAt: new Date().toISOString(),
    voices: result.voices,
  };
  writeJsonAtomic(edgeVoicesCachePath, cache);
  return cache;
};

const checkRuntimeDependencies = async () => {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });
  const python = findPythonCommand();
  add("python", Boolean(python), python?.command || "未找到 Python");
  add("ffmpeg", existsSync(ffmpegPath), ffmpegPath);
  add("ffprobe", existsSync(ffprobePath), ffprobePath);
  add("edgeBridge", existsSync(edgeTtsBridgePath), edgeTtsBridgePath);
  let voices = null;
  if (python && existsSync(edgeTtsBridgePath)) {
    try {
      const check = await runEdgeBridgeJson(["--check"]);
      add("edgeTtsVersion", check.version === EDGE_TTS_VERSION, `需要 ${EDGE_TTS_VERSION}，实际 ${check.version}`);
      voices = await loadEdgeVoices();
      const ids = new Set(voices.voices.map((voice) => voice.ShortName));
      const configured = Object.values(loadConfig().tts.roleVoices || {}).filter(Boolean);
      const missing = configured.filter((voice) => !ids.has(voice));
      add("voices", voices.voices.length > 0 && missing.length === 0, missing.length ? `不可用音色：${missing.join("、")}` : `${voices.voices.length} 个音色可用`);
    } catch (error) {
      add("edgeTts", false, error instanceof Error ? error.message : String(error));
    }
  }
  const ok = checks.every((check) => check.ok);
  runtimeHealth = { ok, checks, message: ok ? "运行环境检查通过。" : "运行环境检查失败，请查看 checks。" };
  return runtimeHealth;
};

const synthesizeEdgeAudioFile = async (tts, text, outputPath, task = null) => {
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
    "--timeout",
    "45",
    "--log-file",
    edgeTtsErrorLogPath,
  ];

  try {
    await new Promise((resolveRun, reject) => {
      let stderr = "";
      let stdout = "";
      let timedOut = false;
      let settled = false;
      const child = trackManagedChild(spawn(python.command, args, {
        cwd: rootDir,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      }));
      if (task) {
        task.child = child;
        task.pid = child.pid;
      }
      const timeout = setTimeout(() => {
        timedOut = true;
        killChildProcess(child);
      }, EDGE_TTS_CHILD_TIMEOUT_MS);
      const settle = (callback, value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        callback(value);
      };

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
        if (stdout.length > 16000) {
          stdout = stdout.slice(-16000);
        }
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
        if (stderr.length > 16000) {
          stderr = stderr.slice(-16000);
        }
      });
      child.on("error", (error) => settle(reject, error));
      child.on("close", (code) => {
        if (task?.child === child) {
          task.child = null;
          task.pid = process.pid;
        }
        if (timedOut) {
          settle(reject, new Error(`Edge TTS 请求超时（${Math.round(EDGE_TTS_CHILD_TIMEOUT_MS / 1000)} 秒）。`));
          return;
        }
        if (code === 0 && existsSync(outputPath) && statSync(outputPath).size > 0) {
          settle(resolveRun);
          return;
        }

        const jsonLine = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
        let result = null;
        try {
          result = jsonLine ? JSON.parse(jsonLine) : null;
        } catch {
          result = null;
        }
        const detail = result?.message || stderr.trim().slice(-240) || `Edge TTS 退出码 ${code}`;
        const errorCode = result?.code ? `（${result.code}）` : "";
        settle(reject, new Error(`${detail}${errorCode}`));
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
  return /504|网关错误|超时|timed out|gateway|html 错页|text\/html|<!doctype html|NoAudioReceived|没有返回音频|No audio was received/i.test(
    message,
  );
};

const isNoAudioReceivedError = (error) => {
  const message = error instanceof Error ? error.message : String(error);
  return /NoAudioReceived|没有返回音频|No audio was received|empty audio/i.test(message);
};

const concatAudioFiles = async (inputPaths, outputPath, format, task = null) => {
  if (task?.cancelRequested) throw new Error("配音任务已取消。");
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
    await runFfmpeg(args, task);
    if (task?.cancelRequested) throw new Error("配音任务已取消。");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
};

const safeFileToken = (value) =>
  String(value || "segment")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "segment";

const chunkPlanForText = (tts, segment, text, id, order) => {
  const scopedTts = ttsForSegment(tts, segment);
  const voice = String(scopedTts.voice || "").trim();
  const format = effectiveTtsFormat(scopedTts);
  const cacheKey = createTtsCacheKey({
    provider: ttsProvider(scopedTts),
    engineVersion: ttsProvider(scopedTts) === "edge" ? EDGE_TTS_VERSION : String(scopedTts.model || "custom"),
    voice,
    speed: scopedTts.speed || "1",
    volume: scopedTts.volume || "+0%",
    pitch: scopedTts.pitch || "+0Hz",
    format,
    text,
  });
  return {
    id,
    roundIndex: segment.roundIndex,
    segmentId: segment.id,
    role: normalizeTtsRole(segment.role),
    text,
    order,
    voice,
    cacheKey,
    format,
    scopedTts,
  };
};

const roundTtsSegments = (round) => {
  const skippedRoles = new Set(["system", "error", "sophistry_round_report", "sophistry_final_report"]);
  const ordered = (round.speeches || [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .filter((speech) => !skippedRoles.has(speech.role))
    .flatMap((speech) => (speech.segments || []).slice().sort((a, b) => a.order - b.order));
  const seen = new Set(ordered.map((segment) => segment.id));
  for (const segment of round.scoreSegments || []) {
    if (!seen.has(segment.id)) {
      ordered.push(segment);
      seen.add(segment.id);
    }
  }
  return ordered.filter((segment) => cleanSegmentTextForTts(segment.text));
};

const buildChunkPlansForSegment = (tts, segment) => {
  const text = cleanSegmentTextForTts(segment.text);
  const pieces = ttsProvider(tts) === "edge" ? splitEdgeTextForTts(text) : splitTextForTts(text);
  return pieces.map((piece, index) =>
    chunkPlanForText(tts, segment, piece, `${segment.id}-tts-${String(index + 1).padStart(3, "0")}`, index),
  );
};

const createTtsState = (script, tts) => {
  const signature = ttsSignature(tts);
  if (existsSync(ttsStatePath)) {
    try {
      const previous = JSON.parse(readFileSync(ttsStatePath, "utf8"));
      if (previous.scriptHash === script.scriptHash && previous.ttsSignature === signature) {
        return { ...previous, status: "running", updatedAt: new Date().toISOString() };
      }
    } catch {
      // A damaged progress file is replaced; cached audio files remain reusable.
    }
  }
  return {
    schemaVersion: 1,
    scriptHash: script.scriptHash,
    ttsSignature: signature,
    provider: ttsProvider(tts),
    status: "running",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    chunks: {},
  };
};

const persistTtsState = (state) => {
  state.updatedAt = new Date().toISOString();
  writeJsonAtomic(ttsStatePath, state);
};

const updateChunkState = (state, plan, patch) => {
  state.chunks[plan.cacheKey] = {
    id: plan.id,
    roundIndex: plan.roundIndex,
    segmentId: plan.segmentId,
    role: plan.role,
    voice: plan.voice,
    text: plan.text,
    order: plan.order,
    cacheKey: plan.cacheKey,
    ...(state.chunks[plan.cacheKey] || {}),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  persistTtsState(state);
};

const synthesizeOneCachedChunk = async (plan, task, state) => {
  mkdirSync(audioChunkDir, { recursive: true });
  const cachePathFor = (candidate) => join(audioChunkDir, `${candidate.cacheKey}.${candidate.format}`);
  const publicFileFor = (candidate) => `audio/chunks/${candidate.cacheKey}.${candidate.format}`;
  try {
    return await runRecoverableTtsChunk(plan, {
      retryDelaysMs: EDGE_TTS_RETRY_DELAYS_MS,
      tryReuse: async (candidate) => {
        if (task.cancelRequested) throw new Error("配音任务已取消。");
        const cachePath = cachePathFor(candidate);
        if (!existsSync(cachePath)) return null;
        try {
          const durationMs = await readMediaDurationMs(cachePath);
          const audioFile = publicFileFor(candidate);
          updateChunkState(state, candidate, { status: "completed", attempts: 0, reused: true, audioFile, durationMs });
          appendTaskOutput(task, `复用缓存：${candidate.id}（${durationMs}ms）\n`);
          return { ...candidate, audioPath: cachePath, audioFile, durationMs, reused: true };
        } catch {
          rmSync(cachePath, { force: true });
          return null;
        }
      },
      consumeRequest: (segmentId) => {
        if (task.cancelRequested) throw new Error("配音任务已取消。");
        const requestCount = (task.segmentRequestCounts.get(segmentId) || 0) + 1;
        if (requestCount > MAX_TTS_REQUESTS_PER_SEGMENT) {
          throw new Error(`${segmentId} 已达到 ${MAX_TTS_REQUESTS_PER_SEGMENT} 次请求上限，请检查网络或音色配置。`);
        }
        task.segmentRequestCounts.set(segmentId, requestCount);
      },
      runAttempt: async (candidate, attempt, totalAttempts) => {
        const cachePath = cachePathFor(candidate);
        const audioFile = publicFileFor(candidate);
        const tempPath = `${cachePath}.${process.pid}.${Date.now()}.tmp.${candidate.format}`;
        updateChunkState(state, candidate, { status: "running", attempts: attempt, reused: false, error: null });
        task.progress = { ...(task.progress || {}), phase: "tts", roundIndex: candidate.roundIndex, segmentId: candidate.segmentId, chunkId: candidate.id };
        appendTaskOutput(task, `生成 ${candidate.id}：第 ${attempt}/${totalAttempts} 次，约 ${candidate.text.length} 字\n`);
        try {
          if (ttsProvider(candidate.scopedTts) === "edge") {
            await synthesizeEdgeAudioFile(candidate.scopedTts, candidate.text, tempPath, task);
          } else {
            writeFileSync(tempPath, await fetchAudioBuffer(candidate.scopedTts, candidate.text));
          }
          const durationMs = await readMediaDurationMs(tempPath);
          rmSync(cachePath, { force: true });
          renameSync(tempPath, cachePath);
          updateChunkState(state, candidate, { status: "completed", attempts: attempt, reused: false, audioFile, durationMs, error: null });
          return { ...candidate, audioPath: cachePath, audioFile, durationMs, reused: false };
        } catch (error) {
          rmSync(tempPath, { force: true });
          updateChunkState(state, candidate, { status: "failed", attempts: attempt, error: error instanceof Error ? error.message : String(error) });
          throw error;
        }
      },
      classifyError: (error) => {
        if (isNoAudioReceivedError(error)) return "no-audio";
        const message = error instanceof Error ? error.message : String(error);
        if (isRetryableTtsError(error) || /媒体文件为空|FFprobe|损坏|corrupt|empty audio/i.test(message)) return "retryable";
        return "fatal";
      },
      splitPlan: (candidate) => {
        const smallerTexts = splitFailedTtsChunk(candidate.text);
        if (smallerTexts.length <= 1) return [candidate];
        if (task.progress?.total) task.progress.total += smallerTexts.length - 1;
        appendTaskOutput(task, `${candidate.id} 连续未收到音频，拆为 ${smallerTexts.length} 个更小请求。\n`);
        return smallerTexts.map((text, index) => chunkPlanForText(
          candidate.scopedTts,
          { id: candidate.segmentId, roundIndex: candidate.roundIndex, role: candidate.role },
          text,
          `${candidate.id}-${index + 1}`,
          candidate.order + index / 10,
        ));
      },
    });
  } catch (error) {
    throw new Error(`${plan.id} 生成失败（约 ${plan.text.length} 字）：${error instanceof Error ? error.message : String(error)}`);
  }
};

const scaleDurations = (items, targetDurationMs) => {
  let cursorMs = 0;
  return items.map((item, index) => {
    const remainingMs = Math.max(1, targetDurationMs - cursorMs);
    const durationMs = index === items.length - 1
      ? remainingMs
      : Math.max(1, Math.min(remainingMs - (items.length - index - 1), Math.round(item.durationMs)));
    const result = { ...item, startMs: cursorMs, endMs: cursorMs + durationMs };
    cursorMs += durationMs;
    return result;
  });
};

const generateTtsResult = async (task) => {
  const config = loadConfig();
  const tts = config.tts;
  const provider = ttsProvider(tts);
  const providerLabel = provider === "edge" ? "Edge TTS" : provider === "mimo" ? "MiMo TTS" : "自定义 TTS";
  const format = effectiveTtsFormat(tts);

  if (provider !== "edge" && (!tts.baseUrl || !tts.apiKey)) {
    throw new Error("请先配置 TTS 地址和 API Key。");
  }

  const { session, props } = loadCurrentData();
  if (!session) {
    throw new Error("请先导入 Elenchus 导出 JSON。");
  }

  const { props: refreshedProps, script } = writeVideoScriptForSession(session, props || {}, { config });
  const outputVersion = `${String(script?.scriptHash || "script").slice(0, 12)}-${ttsSignature(tts).slice(0, 12)}`;
  const requiredTurns = (script?.rounds || [])
    .map((round) => ({
      round,
      segments: roundTtsSegments(round),
    }))
    .filter(({ segments }) => segments.length > 0)
    .map(({ round, segments }) => ({
      round,
      segments,
      plansBySegment: new Map(segments.map((segment) => [segment.id, buildChunkPlansForSegment(tts, segment)])),
    }));

  mkdirSync(audioDir, { recursive: true });
  mkdirSync(audioChunkDir, { recursive: true });
  const state = createTtsState(script, tts);
  for (const { plansBySegment } of requiredTurns) {
    for (const plan of [...plansBySegment.values()].flat()) {
      const previous = state.chunks[plan.cacheKey] || {};
      const cachedFile = join(audioChunkDir, `${plan.cacheKey}.${plan.format}`);
      state.chunks[plan.cacheKey] = {
        id: plan.id,
        roundIndex: plan.roundIndex,
        segmentId: plan.segmentId,
        role: plan.role,
        text: plan.text,
        order: plan.order,
        voice: plan.voice,
        cacheKey: plan.cacheKey,
        ...previous,
        status: previous.status === "completed" && existsSync(cachedFile) ? "completed" : "pending",
        attempts: Number(previous.attempts || 0),
      };
    }
  }
  persistTtsState(state);
  const initialTotal = requiredTurns.reduce(
    (sum, { plansBySegment }) => sum + [...plansBySegment.values()].reduce((segmentSum, plans) => segmentSum + plans.length, 0),
    0,
  );
  task.progress = { phase: "tts", current: 0, total: initialTotal, reused: 0 };
  appendTaskOutput(task, `${providerLabel}：共 ${requiredTurns.length} 轮、${initialTotal} 个请求块。\n`);

  const scenes = [];
  for (const { round, segments, plansBySegment } of requiredTurns) {
    if (task.cancelRequested) {
      throw new Error("配音任务已取消。");
    }
    const id = round.id;
    const fileName = `${id}-${outputVersion}.${format}`;
    const audioPath = join(audioDir, fileName);
    const audioFile = `audio/${fileName}`;
    const tempDir = mkdtempSync(join(tmpdir(), `elenchus-${id}-`));

    try {
      const segmentAudioFiles = [];
      const rawSegmentCues = [];

      for (const [index, segment] of segments.entries()) {
        const text = cleanSegmentTextForTts(segment.text);
        if (!text) {
          continue;
        }

        const token = `${safeFileToken(segment.id)}-${String(index + 1).padStart(3, "0")}`;
        const segmentPath = join(tempDir, `${token}.${format}`);
        const chunkResults = [];
        for (const plan of plansBySegment.get(segment.id) || []) {
          const results = await synthesizeOneCachedChunk(plan, task, state);
          chunkResults.push(...results);
          task.progress.current += results.length;
          task.progress.reused += results.filter((result) => result.reused).length;
        }
        await concatAudioFiles(chunkResults.map((chunk) => chunk.audioPath), segmentPath, format, task);
        const segmentDurationMs = await readMediaDurationMs(segmentPath);
        const chunkCues = scaleDurations(chunkResults, segmentDurationMs);
        segmentAudioFiles.push(segmentPath);
        rawSegmentCues.push({
          ...segment,
          text,
          charCount: text.replace(/\s+/g, "").length,
          durationMs: segmentDurationMs,
          chunkCues,
        });
      }

      if (segmentAudioFiles.length === 0) {
        continue;
      }
      const pendingScenePath = join(tempDir, `scene.${format}`);
      await concatAudioFiles(segmentAudioFiles, pendingScenePath, format, task);
      if (task.cancelRequested) throw new Error("配音任务已取消。");
      const durationMs = await readMediaDurationMs(pendingScenePath);
      const scaledSegments = scaleDurations(rawSegmentCues, durationMs);
      const segmentCues = scaledSegments.map((segment) => ({
        ...segment,
        startFrame: Math.round((segment.startMs / 1000) * FPS),
        endFrame: Math.max(Math.round((segment.endMs / 1000) * FPS), Math.round((segment.startMs / 1000) * FPS) + 1),
        chunkCues: undefined,
      }));
      const chunkCues = scaledSegments.flatMap((segment) =>
        scaleDurations(segment.chunkCues, segment.endMs - segment.startMs).map((chunk) => ({
          id: chunk.id,
          segmentId: chunk.segmentId,
          role: chunk.role,
          voice: chunk.voice,
          text: chunk.text,
          audioFile: chunk.audioFile,
          cacheKey: chunk.cacheKey,
          durationMs: chunk.endMs - chunk.startMs,
          startMs: segment.startMs + chunk.startMs,
          endMs: segment.startMs + chunk.endMs,
        })),
      );
      copyFileSync(pendingScenePath, audioPath);
      await readMediaDurationMs(audioPath);
      scenes.push({
        id,
        roundIndex: round.roundIndex,
        audioFile,
        durationMs,
        durationFrames: Math.max(1, Math.ceil((durationMs / 1000) * FPS)),
        segmentCues,
        lineCues: segmentCuesToLineCues(segmentCues),
        chunkCues,
      });
      appendTaskOutput(task, `${round.turnLabel || id} 配音完成：${durationMs}ms。\n`);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  if (scenes.length !== requiredTurns.length) {
    throw new Error(`${providerLabel} 配音不完整：应生成 ${requiredTurns.length} 轮，实际 ${scenes.length} 轮。`);
  }

  scenes.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
  const sessionFileName = `session-${outputVersion}.${format}`;
  const sessionAudioPath = join(audioDir, sessionFileName);
  const pendingSessionPath = join(audioDir, `.session-${process.pid}-${Date.now()}.${format}`);
  try {
    await concatAudioFiles(scenes.map((scene) => join(publicDir, scene.audioFile)), pendingSessionPath, format, task);
    if (task.cancelRequested) throw new Error("配音任务已取消。");
    const durationMs = await readMediaDurationMs(pendingSessionPath);
    rmSync(sessionAudioPath, { force: true });
    renameSync(pendingSessionPath, sessionAudioPath);
    let sceneCursorMs = 0;
    const timedScenes = scenes.map((scene, index) => {
      const endMs = index === scenes.length - 1 ? durationMs : sceneCursorMs + scene.durationMs;
      const cues = scene.chunkCues.map((cue) => ({
        segmentId: cue.segmentId,
        chunkId: cue.id,
        role: cue.role,
        startMs: sceneCursorMs + cue.startMs,
        endMs: sceneCursorMs + cue.endMs,
        audioFile: cue.audioFile,
      }));
      const { chunkCues: _chunkCues, ...sceneWithoutLegacyChunks } = scene;
      const result = { ...sceneWithoutLegacyChunks, startMs: sceneCursorMs, endMs, cues };
      sceneCursorMs = endMs;
      return result;
    });
    const manifest = {
      schemaVersion: 2,
      provider,
      scriptFile: refreshedProps.scriptFile || "data/video-script.json",
      scriptHash: script?.scriptHash,
      ttsSignature: ttsSignature(tts),
      durationMs,
      sessionAudioFile: `audio/${sessionFileName}`,
      scenes: timedScenes,
    };
    writeJsonAtomic(join(publicDataDir, "session-audio.json"), manifest);

    const propsPath = join(publicDataDir, "render-props.json");
    const renderProps = existsSync(propsPath) ? JSON.parse(readFileSync(propsPath, "utf8")) : {};
    renderProps.audioManifest = "data/session-audio.json";
    writeJsonAtomic(propsPath, renderProps);
    state.status = "completed";
    state.manifest = "data/session-audio.json";
    persistTtsState(state);
    return { message: `${providerLabel} 已为 ${scenes.length} 个场景生成配音。`, scenes: timedScenes };
  } finally {
    rmSync(pendingSessionPath, { force: true });
  }
};

const startInternalTask = (name, message, runner) => {
  const now = new Date().toISOString();
  const task = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    status: "queued",
    message,
    command: name,
    output: `${message}\n\n`,
    startedAt: now,
    updatedAt: now,
    lastOutputAt: now,
    finishedAt: null,
    exitCode: null,
    pid: process.pid,
    child: null,
    progress: null,
    segmentRequestCounts: new Map(),
  };
  tasks.set(task.id, task);
  Promise.resolve()
    .then(() => {
      task.status = "running";
      task.startedAt = new Date().toISOString();
      task.updatedAt = task.startedAt;
      return runner(task);
    })
    .then((result) => {
      if (task.cancelRequested) throw new Error("任务已取消。");
      task.status = "succeeded";
      task.exitCode = 0;
      task.message = result?.message || "任务执行完成。";
      appendTaskOutput(task, `\n${task.message}\n`);
    })
    .catch((error) => {
      task.status = task.cancelRequested ? "cancelled" : "failed";
      task.exitCode = task.cancelRequested ? null : 1;
      task.message = task.cancelRequested ? "任务已取消。" : error instanceof Error ? error.message : String(error);
      appendTaskOutput(task, `\n${task.cancelRequested ? "任务已取消" : `任务失败：${task.message}`}\n`);
      if (name === "generate-tts" && !isTestMode && existsSync(ttsStatePath)) {
        try {
          const state = JSON.parse(readFileSync(ttsStatePath, "utf8"));
          state.status = task.cancelRequested ? "cancelled" : "failed";
          state.error = task.cancelRequested ? null : task.message;
          persistTtsState(state);
        } catch {
          // Keep the original task error when the progress file is damaged.
        }
      }
    })
    .finally(() => {
      task.finishedAt = new Date().toISOString();
      task.updatedAt = task.finishedAt;
      cleanupOldTasks();
    });
  return task;
};

const generateTts = async (_request, response) => {
  const running = findConflictingTask("generate-tts");
  if (running) {
    jsonResponse(response, 200, { ok: true, message: "已有配音或渲染任务正在执行，已返回现有任务。", task: publicTask(running) });
    return;
  }
  const task = startInternalTask("generate-tts", "配音任务已启动，成功片段会自动缓存。", generateTtsResult);
  jsonResponse(response, 202, { ok: true, message: "配音任务已启动，日志会自动刷新。", task: publicTask(task) });
};

const cancelTask = (taskId, response) => {
  const task = tasks.get(taskId);
  if (!task) {
    jsonResponse(response, 404, { ok: false, message: "任务不存在，可能是服务刚重启过。" });
    return;
  }
  if (!["queued", "running"].includes(task.status)) {
    jsonResponse(response, 200, { ok: true, message: "任务已经结束。", task: publicTask(task) });
    return;
  }
  task.cancelRequested = true;
  task.message = "正在停止任务...";
  task.updatedAt = new Date().toISOString();
  if (task.child) {
    killChildProcess(task.child);
  }
  jsonResponse(response, 200, { ok: true, message: "已发送停止请求。", task: publicTask(task) });
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

  let args = typeof command.args === "function" ? command.args() : [...command.args];
  const renderExpectAudio = (name === "render" || name === "fast-render") && !loadConfig().video.muted;

  if (renderExpectAudio) {
    try {
      const { props, script } = loadCurrentData();
      await validateAudioManifestForRender(props, script);
    } catch (error) {
      jsonResponse(response, 400, { ok: false, message: error instanceof Error ? error.message : String(error) });
      return;
    }
  }

  if (!command.wait) {
    if (studioChild && studioChild.exitCode === null && !studioChild.killed) {
      jsonResponse(response, 200, {
        ok: true,
        message: "Remotion Studio 已经在运行。",
        studioUrl: "http://localhost:3000",
        pid: studioChild.pid,
      });
      return;
    }
    const child = spawn(process.execPath, args, {
      cwd: rootDir,
      stdio: "ignore",
      windowsHide: true,
    });
    studioChild = child;
    child.on("close", () => {
      if (studioChild === child) {
        studioChild = null;
      }
    });
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
    jsonResponse(response, 200, {
      ok: true,
      message: "已有渲染或抽帧任务在执行中，已返回现有任务。",
      task: publicTask(running),
    });
    return;
  }

  let renderSnapshot = null;
  if (name === "render" || name === "fast-render") {
    renderSnapshot = createRenderSnapshot();
    if (name === "render") {
      args = args.map((arg) => arg.startsWith("--props=") ? `--props=public/${renderSnapshot.propsArgument}` : arg);
    }
  }
  const commandText = [process.execPath, ...args].join(" ");

  const child = spawn(process.execPath, args, {
    cwd: rootDir,
    shell: false,
    windowsHide: true,
    env: {
      ...process.env,
      ...(renderSnapshot ? { ELENCHUS_RENDER_PROPS: renderSnapshot.propsPath } : {}),
    },
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
    lastOutputAt: now,
    finishedAt: null,
    exitCode: null,
    pid: child.pid,
    child,
    renderSnapshot,
    expectAudio: renderExpectAudio,
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
    task.renderSnapshot?.cleanup();
    task.renderSnapshot = null;
    cleanupOldTasks();
  });
  child.on("close", async (code) => {
    task.exitCode = code;
    task.child = null;
    try {
      if (task.cancelRequested) {
        task.status = "cancelled";
        task.message = "任务已取消。";
        return;
      }
      if (code !== 0) {
        throw new Error(`命令失败，退出码 ${code}。`);
      }
      if (name === "render" || name === "fast-render") {
        const outputPath = join(outDir, name === "render" ? "debate.mp4" : "debate-fast.mp4");
        const streams = await validateRenderedVideo(outputPath, task.expectAudio);
        appendTaskOutput(task, `\n媒体校验通过：视频流正常，音频流${streams.hasAudio ? "正常" : "未启用"}。\n`);
      }
      task.status = "succeeded";
      task.message = "命令执行完成。";
    } catch (error) {
      task.status = "failed";
      task.message = error instanceof Error ? error.message : String(error);
      appendTaskOutput(task, `\n结果校验失败：${task.message}\n`);
    }
    finally {
      task.finishedAt = new Date().toISOString();
      task.updatedAt = task.finishedAt;
      appendTaskOutput(task, `\n${task.message}\n`);
      task.renderSnapshot?.cleanup();
      task.renderSnapshot = null;
      cleanupOldTasks();
    }
  });

  jsonResponse(response, 202, {
    ok: true,
    message: `${name === "render" ? "渲染" : "抽帧"}任务已启动，日志会自动刷新。`,
    task: publicTask(task),
  });
};

const router = async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${host}:${port}`);
    const { pathname } = requestUrl;

    if (isTestMode && request.method === "POST" && pathname === "/api/test/hold-task") {
      const taskName = requestUrl.searchParams.get("name") === "render" ? "render" : "generate-tts";
      const running = findConflictingTask(taskName);
      if (running) {
        jsonResponse(response, 200, { ok: true, task: publicTask(running) });
        return;
      }
      const task = startInternalTask(taskName, "测试任务已启动。", async (activeTask) => {
        if (requestUrl.searchParams.get("ffmpeg") === "1") {
          await runFfmpeg(["-re", "-f", "lavfi", "-i", "anullsrc=r=8000:cl=mono", "-t", "30", "-f", "null", "-"], activeTask);
          return { message: "测试 FFmpeg 已结束。" };
        }
        while (!activeTask.cancelRequested) {
          await new Promise((resolveWait) => setTimeout(resolveWait, 20));
        }
        throw new Error("测试任务已取消。");
      });
      jsonResponse(response, 202, { ok: true, task: publicTask(task) });
      return;
    }

    if (isTestMode && request.method === "POST" && pathname === "/api/test/spawn-child") {
      const child = trackManagedChild(spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
        cwd: rootDir,
        stdio: "ignore",
        windowsHide: true,
      }));
      jsonResponse(response, 202, { ok: true, pid: child.pid });
      return;
    }

    if (isTestMode && request.method === "POST" && pathname === "/api/test/shutdown") {
      jsonResponse(response, 202, { ok: true, message: "测试关闭请求已接收。" });
      setImmediate(() => shutdown("test-request"));
      return;
    }

    if (request.method === "GET" && pathname === "/api/health") {
      jsonResponse(response, runtimeHealth.ok ? 200 : 503, runtimeHealth);
      return;
    }

    if (request.method === "GET" && pathname === "/api/voices") {
      const cache = await loadEdgeVoices({ refresh: requestUrl.searchParams.get("refresh") === "1" });
      jsonResponse(response, 200, { ok: true, ...cache });
      return;
    }

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

    if (request.method === "POST" && pathname.startsWith("/api/tasks/") && pathname.endsWith("/cancel")) {
      const id = decodeURIComponent(pathname.slice("/api/tasks/".length, -"/cancel".length));
      cancelTask(id, response);
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

const cleanupManagedProcesses = () => {
  for (const child of managedChildren) {
    killChildProcess(child);
  }
  managedChildren.clear();
  for (const task of tasks.values()) {
    if (task.child) {
      killChildProcess(task.child);
      task.child = null;
    }
  }
  if (studioChild) {
    killChildProcess(studioChild);
    studioChild = null;
  }
};

const removeOwnPidFile = () => {
  try {
    if (existsSync(serverPidPath) && Number(readFileSync(serverPidPath, "utf8").trim()) === process.pid) {
      rmSync(serverPidPath, { force: true });
    }
  } catch {
    // Shutdown must continue even if the PID file is locked.
  }
};

let shuttingDown = false;
const server = createServer(router);
const shutdown = (signal) => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`\n收到 ${signal}，正在停止视频服务和子进程...`);
  cleanupManagedProcesses();
  removeOwnPidFile();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("exit", removeOwnPidFile);

server.on("error", (error) => {
  removeOwnPidFile();
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

const startServer = async () => {
  if (isTestMode) {
    runtimeHealth = { ok: true, checks: [], message: "测试模式运行环境检查已跳过。" };
  } else {
    await checkRuntimeDependencies();
  }
  if (!runtimeHealth.ok) {
    console.error(runtimeHealth.message);
    for (const check of runtimeHealth.checks.filter((item) => !item.ok)) {
      console.error(`- ${check.name}: ${check.detail}`);
    }
  }
  server.listen(port, host, () => {
    writeFileSync(serverPidPath, `${process.pid}\n`, "utf8");
    console.log(`Elenchus video UI: http://${host}:${port}`);
  });
};

startServer().catch((error) => {
  removeOwnPidFile();
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
