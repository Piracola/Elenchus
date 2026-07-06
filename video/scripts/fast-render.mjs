import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { buildVideoModel } from "../src/normalizeElenchusExport.ts";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicDir = join(rootDir, "public");
const publicDataDir = join(publicDir, "data");
const outDir = join(rootDir, "out");
const fastDir = join(outDir, "fast");
const frameDir = join(fastDir, "frames");
const segmentDir = join(fastDir, "segments");
const audioListPath = join(fastDir, "audio-list.txt");
const segmentListPath = join(fastDir, "segments-list.txt");
const silentVideoPath = join(fastDir, "silent.mp4");
const concatAudioPath = join(fastDir, "audio.wav");
const outputPath = join(outDir, "debate-fast.mp4");
const ffmpegPath = join(rootDir, "node_modules", "@remotion", "compositor-win32-x64-msvc", "ffmpeg.exe");

const colors = {
  ink: "#1d2a33",
  muted: "#617180",
  faint: "#d9e2ea",
  panel: "#ffffff",
  page: "#f4f7f9",
  proposer: "#2f7d68",
  opposer: "#a04a5b",
  judge: "#405f8f",
  gold: "#b8842f",
};

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;

const fontCandidates = [
  "C:/Windows/Fonts/msyh.ttc",
  "C:/Windows/Fonts/simhei.ttf",
  "C:/Windows/Fonts/simsun.ttc",
];

for (const fontPath of fontCandidates) {
  if (existsSync(fontPath)) {
    GlobalFonts.registerFromPath(fontPath, "Elenchus CJK");
  }
}

const normalizeFontWeight = (weight = 400) => {
  const numeric = Number(weight);
  if (!Number.isFinite(numeric)) return 400;
  if (numeric >= 800) return 800;
  if (numeric >= 700) return 700;
  if (numeric >= 600) return 600;
  if (numeric >= 500) return 500;
  return 400;
};

const font = (size, weight = 400) =>
  `${normalizeFontWeight(weight)} ${Math.max(1, Math.round(size))}px "Elenchus CJK", "Microsoft YaHei", "SimHei", sans-serif`;

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const loadProps = () => {
  const propsPath = join(publicDataDir, "render-props.json");
  return existsSync(propsPath) ? readJson(propsPath) : { dataFile: "data/session-export.json" };
};

const loadAudioManifest = (props) => {
  if (!props.audioManifest) {
    return undefined;
  }
  const manifestPath = join(publicDir, props.audioManifest);
  return existsSync(manifestPath) ? readJson(manifestPath) : undefined;
};

const run = (args) =>
  new Promise((resolveRun, reject) => {
    const child = spawn(ffmpegPath, args, {
      cwd: rootDir,
      stdio: ["ignore", "inherit", "inherit"],
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolveRun();
      } else {
        reject(new Error(`ffmpeg 退出码 ${code}`));
      }
    });
  });

const roundedRect = (ctx, x, y, width, height, radius) => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
};

const fillRound = (ctx, x, y, width, height, radius, fill, stroke) => {
  roundedRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
};

const withRectClip = (ctx, x, y, width, height, draw) => {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  draw();
  ctx.restore();
};

const wrapText = (ctx, text, maxWidth) => {
  const clean = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();
  const lines = [];

  for (const paragraph of clean.split("\n")) {
    let line = "";
    for (const char of paragraph) {
      const candidate = `${line}${char}`;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = char;
      } else {
        line = candidate;
      }
    }
    if (line) {
      lines.push(line);
    }
  }
  return lines;
};

const drawTextBlock = (ctx, text, x, y, width, options = {}) => {
  const size = options.size || 28;
  const lineHeight = options.lineHeight || Math.round(size * 1.55);
  const maxLines = options.maxLines || 10;
  ctx.font = font(size, options.weight || 400);
  ctx.fillStyle = options.color || colors.ink;
  ctx.textBaseline = "top";
  const wrappedLines = wrapText(ctx, text, width);
  const lines = wrappedLines.slice(0, maxLines);
  lines.forEach((line, index) => {
    let display = line;
    if (index === maxLines - 1 && wrappedLines.length > maxLines) {
      display = `${line.slice(0, Math.max(0, line.length - 1))}…`;
    }
    ctx.fillText(display, x, y + index * lineHeight);
  });
  return lines.length * lineHeight;
};

const roleColor = (role) => {
  if (role === "proposer") return colors.proposer;
  if (role === "opposer") return colors.opposer;
  if (role === "judge") return colors.judge;
  return colors.muted;
};

const drawHeader = (ctx, video, scene) => {
  ctx.fillStyle = colors.page;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = colors.ink;
  ctx.font = font(46, 800);
  ctx.textBaseline = "top";
  ctx.fillText(wrapText(ctx, video.topic, 1180)[0] || "辩论视频", 72, 44);

  ctx.font = font(24, 700);
  ctx.fillStyle = colors.muted;
  ctx.fillText(`${scene.turnLabel}  /  ${scene.totalChars.toLocaleString()} 字`, 72, 112);

  fillRound(ctx, 1550, 50, 298, 78, 10, colors.panel, colors.faint);
  ctx.font = font(24, 800);
  ctx.fillStyle = colors.muted;
  ctx.fillText("快速 Canvas 渲染", 1582, 68);
};

const drawSpeechColumn = (ctx, scene) => {
  const x = 72;
  const y = 170;
  const w = 1040;
  const h = 830;
  fillRound(ctx, x, y, w, h, 10, colors.panel, colors.faint);
  ctx.font = font(30, 850);
  ctx.fillStyle = colors.ink;
  ctx.fillText("辩手发言", x + 30, y + 26);

  withRectClip(ctx, x + 30, y + 80, w - 60, h - 110, () => {
    const items = scene.speakerItems.slice(0, 2);
    let cursor = y + 88;
    for (const item of items) {
      const accent = roleColor(item.role);
      fillRound(ctx, x + 30, cursor, 156, 42, 8, `${accent}22`, null);
      ctx.font = font(22, 800);
      ctx.fillStyle = accent;
      ctx.fillText(item.label, x + 48, cursor + 8);
      ctx.font = font(18, 700);
      ctx.fillStyle = colors.muted;
      ctx.fillText(`${item.charCount.toLocaleString()} 字`, x + 212, cursor + 11);
      cursor += 58;
      cursor += drawTextBlock(ctx, item.text, x + 30, cursor, w - 60, {
        size: 25,
        lineHeight: 40,
        maxLines: items.length === 1 ? 15 : 8,
      });
      cursor += 28;
    }
  });
};

const drawJudgeColumn = (ctx, scene) => {
  const x = 1140;
  const y = 170;
  const w = 708;
  const judgeH = 382;
  const scoreH = 418;
  fillRound(ctx, x, y, w, judgeH, 10, colors.panel, colors.faint);
  ctx.font = font(30, 850);
  ctx.fillStyle = colors.ink;
  ctx.fillText("裁判消息", x + 28, y + 24);

  withRectClip(ctx, x + 28, y + 74, w - 56, judgeH - 96, () => {
    const judgeText = scene.judgeItems.map((item) => item.text).join("\n");
    drawTextBlock(ctx, judgeText || "本轮暂无裁判消息。", x + 28, y + 82, w - 56, {
      size: 22,
      lineHeight: 35,
      maxLines: 8,
      color: judgeText ? colors.ink : colors.muted,
    });
  });

  fillRound(ctx, x, y + judgeH + 30, w, scoreH, 10, colors.panel, colors.faint);
  ctx.font = font(30, 850);
  ctx.fillStyle = colors.ink;
  ctx.fillText("评分", x + 28, y + judgeH + 54);

  let cursor = y + judgeH + 110;
  const scores = scene.scoreItems.slice(0, 2);
  if (!scores.length) {
    ctx.font = font(22, 700);
    ctx.fillStyle = colors.muted;
    ctx.fillText("本轮暂无评分。", x + 28, cursor);
    return;
  }

  withRectClip(ctx, x + 28, y + judgeH + 96, w - 56, scoreH - 118, () => {
    for (const score of scores) {
      ctx.font = font(24, 800);
      ctx.fillStyle = roleColor(score.role);
      ctx.fillText(score.label, x + 28, cursor);
      ctx.fillStyle = colors.gold;
      ctx.font = font(34, 800);
      ctx.fillText(score.comprehensiveScore == null ? "-" : String(score.comprehensiveScore), x + w - 110, cursor - 7);
      cursor += 42;
      cursor += drawTextBlock(ctx, score.overallComment || "暂无总评。", x + 28, cursor, w - 56, {
        size: 20,
        lineHeight: 31,
        maxLines: 4,
        color: colors.muted,
      });
      cursor += 20;
    }
  });
};

const drawScene = (video, scene, filePath) => {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  drawHeader(ctx, video, scene);
  drawSpeechColumn(ctx, scene);
  drawJudgeColumn(ctx, scene);
  writeFileSync(filePath, canvas.toBuffer("image/png"));
};

const writeFrameImages = (video) => {
  video.scenes.forEach((scene, index) => {
    const framePath = join(frameDir, `scene-${String(index + 1).padStart(3, "0")}.png`);
    drawScene(video, scene, framePath);
  });
};

const encodeVideoSegments = async (video) => {
  const listLines = [];
  for (const [index, scene] of video.scenes.entries()) {
    const id = String(index + 1).padStart(3, "0");
    const framePath = join(frameDir, `scene-${id}.png`);
    const segmentPath = join(segmentDir, `scene-${id}.mp4`);
    await run([
      "-hide_banner",
      "-y",
      "-loop",
      "1",
      "-framerate",
      "25",
      "-i",
      framePath,
      "-t",
      (scene.durationInFrames / FPS).toFixed(3),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "24",
      "-pix_fmt",
      "yuv420p",
      "-r",
      "25",
      segmentPath,
    ]);
    listLines.push(`file '${segmentPath.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`);
  }

  writeFileSync(segmentListPath, `${listLines.join("\n")}\n`, "utf8");
  await run(["-hide_banner", "-y", "-f", "concat", "-safe", "0", "-i", segmentListPath, "-c", "copy", silentVideoPath]);
};

const writeAudioList = (video) => {
  const files = video.scenes
    .map((scene) => scene.audioFile)
    .filter(Boolean)
    .map((file) => join(publicDir, file));
  const existing = files.filter((file) => existsSync(file));
  if (!existing.length) {
    return false;
  }
  const lines = existing.map((file) => `file '${file.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`);
  writeFileSync(audioListPath, `${lines.join("\n")}\n`, "utf8");
  return true;
};

const main = async () => {
  mkdirSync(outDir, { recursive: true });
  rmSync(fastDir, { recursive: true, force: true });
  mkdirSync(frameDir, { recursive: true });
  mkdirSync(segmentDir, { recursive: true });

  const props = loadProps();
  const dataFile = props.dataFile || "data/session-export.json";
  const raw = readJson(join(publicDir, dataFile));
  const audioManifest = loadAudioManifest(props);
  const video = buildVideoModel(raw, props, audioManifest);

  console.log(`Canvas 快速渲染：${video.scenes.length} 个场景，${(video.durationInFrames / FPS / 60).toFixed(1)} 分钟`);
  writeFrameImages(video);
  if (process.argv.includes("--frames-only")) {
    console.log(`帧检查已输出：${frameDir}`);
    return;
  }
  await encodeVideoSegments(video);

  if (writeAudioList(video)) {
    await run([
      "-hide_banner",
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      audioListPath,
      "-c:a",
      "pcm_s16le",
      concatAudioPath,
    ]);
    await run([
      "-hide_banner",
      "-y",
      "-i",
      silentVideoPath,
      "-i",
      concatAudioPath,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-shortest",
      outputPath,
    ]);
  } else {
    console.log("未找到配音清单或音频文件，将输出无声快速视频。");
    await run(["-hide_banner", "-y", "-i", silentVideoPath, "-c", "copy", outputPath]);
  }

  console.log(`快速视频已输出：${basename(outputPath)}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
