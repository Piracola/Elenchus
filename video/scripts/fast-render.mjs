import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { buildVideoModel } from "../src/normalizeElenchusExport.ts";
import { buildSceneSlices, buildSceneViewModel, layoutTextLines, SCENE_COLORS, SCENE_LAYOUT, VIDEO_FONT_FAMILY } from "../src/scenePresentation.ts";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicDir = join(rootDir, "public");
const publicDataDir = join(publicDir, "data");
const outDir = join(rootDir, "out");
const fastDir = join(outDir, "fast");
const frameDir = join(fastDir, "frames");
const segmentListPath = join(fastDir, "segments-list.txt");
const silentVideoPath = join(fastDir, "silent.mp4");
const concatAudioPath = join(fastDir, "audio.wav");
const outputPath = join(outDir, "debate-fast.mp4");
const ffmpegPath = join(rootDir, "node_modules", "@remotion", "compositor-win32-x64-msvc", "ffmpeg.exe");

const colors = {
  ink: SCENE_COLORS.ink,
  muted: SCENE_COLORS.muted,
  faint: SCENE_COLORS.faint,
  panel: SCENE_COLORS.panel,
  page: SCENE_COLORS.background,
  proposer: SCENE_COLORS.affirmative,
  opposer: SCENE_COLORS.negative,
  judge: SCENE_COLORS.judge,
  gold: SCENE_COLORS.score,
};

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;

const bundledFontDir = join(publicDir, "fonts");
for (const fileName of ["NotoSansHans-Regular.otf", "NotoSansHans-Bold.otf"]) {
  const fontPath = join(bundledFontDir, fileName);
  if (!existsSync(fontPath) || !GlobalFonts.registerFromPath(fontPath, "Noto Sans Hans")) {
    throw new Error(`项目中文字体不可用：${fontPath}。请先运行 npm install。`);
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
  `${normalizeFontWeight(weight)} ${Math.max(1, Math.round(size))}px ${VIDEO_FONT_FAMILY}`;

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const loadProps = () => {
  const propsPath = process.env.ELENCHUS_RENDER_PROPS
    ? resolve(rootDir, process.env.ELENCHUS_RENDER_PROPS)
    : join(publicDataDir, "render-props.json");
  return existsSync(propsPath) ? readJson(propsPath) : { dataFile: "data/session-export.json" };
};

const loadAudioManifest = (props) => {
  if (!props.audioManifest) {
    return undefined;
  }
  const manifestPath = join(publicDir, props.audioManifest);
  return existsSync(manifestPath) ? readJson(manifestPath) : undefined;
};

const loadVideoScript = (props) => {
  if (!props.scriptFile) {
    return undefined;
  }
  const scriptPath = join(publicDir, props.scriptFile);
  return existsSync(scriptPath) ? readJson(scriptPath) : undefined;
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

const drawTextBlock = (ctx, lines, x, y, options = {}) => {
  const size = options.size || 28;
  const lineHeight = options.lineHeight || Math.round(size * 1.55);
  ctx.font = font(size, options.weight || 400);
  ctx.fillStyle = options.color || colors.ink;
  ctx.textBaseline = "top";
  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });
  return lines.length * lineHeight;
};

const roleColor = (role) => {
  if (role === "proposer") return colors.proposer;
  if (role === "opposer") return colors.opposer;
  if (role === "judge") return colors.judge;
  return colors.muted;
};

const roleTextColor = (role) => {
  if (role === "proposer") return SCENE_COLORS.affirmativeText;
  if (role === "opposer") return SCENE_COLORS.negativeText;
  return roleColor(role);
};

const drawHeader = (ctx, video, scene) => {
  ctx.save();
  try {
  ctx.fillStyle = colors.page;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = colors.ink;
  ctx.font = font(46, 800);
  ctx.textBaseline = "top";
  ctx.fillText(layoutTextLines(video.topic, 30, 1)[0] || "辩论视频", SCENE_LAYOUT.header.x, 44);

  ctx.font = font(24, 700);
  ctx.fillStyle = colors.muted;
  ctx.fillText(`${scene.turnLabel}  /  ${scene.totalChars.toLocaleString()} 字`, 72, 112);

  fillRound(ctx, 1550, 50, 298, 78, 10, colors.panel, colors.faint);
  ctx.font = font(24, 800);
  ctx.fillStyle = colors.muted;
  ctx.fillText("快速 Canvas 渲染", 1582, 68);
  } finally {
    ctx.restore();
  }
};

const drawSpeechColumn = (ctx, scene, view) => {
  const { x, y, width: w, height: h } = view.layout.speaker;
  ctx.save();
  try {
  ctx.textBaseline = "top";
  fillRound(ctx, x, y, w, h, 10, colors.panel, colors.faint);
  ctx.font = font(30, 850);
  ctx.fillStyle = colors.ink;
  ctx.fillText("辩手发言", x + 30, y + 26);

  withRectClip(ctx, x + 24, y + 76, w - 48, h - 98, () => {
    const lines = view.speakerLines;
    if (!lines.length) {
      ctx.font = font(25, 700);
      ctx.fillStyle = colors.muted;
      ctx.fillText("本轮没有辩手发言。", x + 30, y + 96);
      return;
    }
    let cursor = y + 84;
    for (const item of lines) {
      const line = item.cue;
      const { displayLines, state, style } = item;
      const accent = roleColor(line.role);
      const textColor = roleTextColor(line.role);
      ctx.save();
      ctx.globalAlpha = style.opacity;
      const textHeight = displayLines.length * style.fontSize * style.lineHeight;
      if (state === "active" || state === "near") {
        ctx.globalAlpha = 1;
        fillRound(ctx, x + 24, cursor, w - 48, textHeight + 6, 6, `${accent}${state === "active" ? "12" : "08"}`);
        ctx.globalAlpha = style.opacity;
      }
      ctx.font = font(style.fontSize, style.fontWeight);
      ctx.fillStyle = textColor;
      displayLines.forEach((text, index) => {
        ctx.fillText(text, x + 34, cursor + 3 + index * style.fontSize * style.lineHeight);
      });
      cursor += textHeight + 6 + style.marginBottom;
      ctx.restore();
    }
  });
  } finally {
    ctx.restore();
  }
};

const drawJudgeColumn = (ctx, scene, view) => {
  const { x, y, width: w, height: judgeH } = view.layout.judge;
  const scoreH = view.layout.score.height;
  ctx.save();
  try {
  ctx.textBaseline = "top";
  const judgeActive = view.activeRole === "judge" || view.activeSegmentKind === "judge_summary";
  const scoreActive = view.activeSegmentKind === "score_comment";
  fillRound(ctx, x, y, w, judgeH, 10, judgeActive ? SCENE_COLORS.judgeSoft : colors.panel, judgeActive ? SCENE_COLORS.judge : colors.faint);
  ctx.font = font(30, 850);
  ctx.fillStyle = colors.ink;
  ctx.fillText("裁判消息", x + 28, y + 24);

  withRectClip(ctx, x + 28, y + 74, w - 56, judgeH - 96, () => {
    const judgeLines = view.judgeLines.length ? view.judgeLines : ["本轮暂无裁判消息。"];
    drawTextBlock(ctx, judgeLines, x + 28, y + 82, {
      size: 22,
      lineHeight: 35,
      color: view.judgeLines.length ? colors.ink : colors.muted,
    });
  });

  fillRound(ctx, x, y + judgeH + 30, w, scoreH, 10, scoreActive ? SCENE_COLORS.scoreSoft : colors.panel, scoreActive ? SCENE_COLORS.score : colors.faint);
  ctx.font = font(30, 850);
  ctx.fillStyle = colors.ink;
  ctx.fillText("评分", x + 28, y + judgeH + 54);

  let cursor = y + judgeH + 106;
  const scores = view.scoreCards;
  if (!scores.length) {
    ctx.font = font(22, 700);
    ctx.fillStyle = colors.muted;
    ctx.fillText("本轮暂无评分。", x + 28, cursor);
    return;
  }

  withRectClip(ctx, x + 28, y + judgeH + 96, w - 56, scoreH - 118, () => {
    for (const score of scores) {
      ctx.font = font(16, 800);
      ctx.fillStyle = roleColor(score.role);
      ctx.fillText(score.label, x + 28, cursor);
      ctx.fillStyle = colors.gold;
      ctx.font = font(28, 800);
      ctx.fillText(score.comprehensiveScore == null ? "-" : String(score.comprehensiveScore), x + w - 94, cursor - 5);
      cursor += 28;
      cursor += drawTextBlock(ctx, score.commentLines.length ? score.commentLines : ["暂无总评。"], x + 28, cursor, {
        size: 13,
        lineHeight: 20,
        color: colors.muted,
      });
      cursor += 4;
      for (const dimension of score.displayDimensions) {
        ctx.font = font(12, 700);
        ctx.fillStyle = colors.ink;
        ctx.fillText(dimension.label, x + 28, cursor);
        ctx.fillStyle = colors.faint;
        ctx.fillRect(x + 112, cursor + 6, w - 190, 5);
        ctx.fillStyle = roleColor(score.role);
        ctx.fillRect(x + 112, cursor + 6, (w - 190) * Math.max(0, Math.min(10, dimension.score || 0)) / 10, 5);
        ctx.fillText(dimension.score == null ? "-" : String(dimension.score), x + w - 48, cursor);
        cursor += 18;
      }
      cursor += 10;
    }
  });
  } finally {
    ctx.restore();
  }
};

const drawScene = (video, scene, filePath, frame) => {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  ctx.resetTransform();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, WIDTH, HEIGHT);
  ctx.clip();
  const view = buildSceneViewModel(scene, frame);
  drawHeader(ctx, video, scene);
  drawSpeechColumn(ctx, scene, view);
  drawJudgeColumn(ctx, scene, view);
  ctx.restore();
  writeFileSync(filePath, canvas.toBuffer("image/png"));
};

const drawBookend = (video, filePath, outro = false) => {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  ctx.resetTransform();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = colors.page;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = colors.gold;
  ctx.font = font(28, 800);
  ctx.fillText(outro ? "复盘结束" : "Elenchus 视频辩论记录", WIDTH / 2, 390);
  ctx.fillStyle = colors.ink;
  ctx.font = font(54, 800);
  const titleLines = layoutTextLines(video.topic, 28, 2);
  titleLines.forEach((line, index) => ctx.fillText(line, WIDTH / 2, 500 + index * 72));
  ctx.fillStyle = colors.muted;
  ctx.font = font(24, 500);
  ctx.fillText(outro ? `共 ${video.scenes.length} 轮辩论，感谢观看。` : `${video.scenes.length} 轮 · ${video.participants.join(" vs ")}`, WIDTH / 2, 700);
  writeFileSync(filePath, canvas.toBuffer("image/png"));
};

const writeFrameImages = (video) => {
  const slices = [];
  const introPath = join(frameDir, "scene-000-intro.png");
  drawBookend(video, introPath, false);
  slices.push({ startFrame: 0, endFrame: video.introFrames, framePath: introPath });
  video.scenes.forEach((scene, sceneIndex) => {
    buildSceneSlices(scene.speakerLines, scene.durationInFrames, scene.segmentCues).forEach((slice, sliceIndex) => {
      const token = `scene-${String(sceneIndex + 1).padStart(3, "0")}-segment-${String(sliceIndex + 1).padStart(3, "0")}`;
      const framePath = join(frameDir, `${token}.png`);
      drawScene(video, scene, framePath, slice.startFrame);
      slices.push({ ...slice, scene, framePath });
    });
  });
  const outroPath = join(frameDir, "scene-999-outro.png");
  drawBookend(video, outroPath, true);
  slices.push({ startFrame: 0, endFrame: video.outroFrames, framePath: outroPath });
  return slices;
};

const encodeVideoSegments = async (slices) => {
  const listLines = ["ffconcat version 1.0"];
  let totalFrames = 0;
  for (const slice of slices) {
    const durationInFrames = Math.max(1, slice.endFrame - slice.startFrame);
    totalFrames += durationInFrames;
    listLines.push(`file '${slice.framePath.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`);
    listLines.push(`duration ${(durationInFrames / FPS).toFixed(6)}`);
  }
  const finalFrame = slices.at(-1)?.framePath;
  if (finalFrame) {
    listLines.push(`file '${finalFrame.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`);
  }

  writeFileSync(segmentListPath, `${listLines.join("\n")}\n`, "utf8");
  await run([
    "-hide_banner",
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    segmentListPath,
    "-frames:v",
    String(totalFrames),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "24",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(FPS),
    "-movflags",
    "+faststart",
    silentVideoPath,
  ]);
};

const buildConcatenatedAudio = async (video) => {
  const sceneAudio = video.scenes.map((scene) => {
    const filePath = scene.audioFile ? join(publicDir, scene.audioFile) : null;
    return { scene, filePath: filePath && existsSync(filePath) ? filePath : null };
  });
  if (!sceneAudio.some((item) => item.filePath)) {
    return false;
  }

  const audioItems = [
    {
      scene: { durationInFrames: video.introFrames },
      filePath: video.introAudioFile ? join(publicDir, video.introAudioFile) : null,
    },
    ...sceneAudio,
    { scene: { durationInFrames: video.outroFrames }, filePath: null },
  ];

  const args = ["-hide_banner", "-y"];
  for (const { scene, filePath } of audioItems) {
    if (filePath) {
      args.push("-i", filePath);
    } else {
      args.push(
        "-f",
        "lavfi",
        "-t",
        (scene.durationInFrames / FPS).toFixed(3),
        "-i",
        "anullsrc=r=24000:cl=mono",
      );
    }
  }
  const inputs = audioItems.map((_, index) => `[${index}:a]`).join("");
  args.push(
    "-filter_complex",
    `${inputs}concat=n=${audioItems.length}:v=0:a=1[outa]`,
    "-map",
    "[outa]",
    "-c:a",
    "pcm_s16le",
    concatAudioPath,
  );
  await run(args);
  return true;
};

const main = async () => {
  mkdirSync(outDir, { recursive: true });
  rmSync(fastDir, { recursive: true, force: true });
  mkdirSync(frameDir, { recursive: true });

  const props = loadProps();
  const dataFile = props.dataFile || "data/session-export.json";
  const raw = readJson(join(publicDir, dataFile));
  const audioManifest = loadAudioManifest(props);
  const videoScript = loadVideoScript(props);
  const video = buildVideoModel(raw, props, audioManifest, videoScript);

  console.log(`Canvas 快速渲染：${video.scenes.length} 个场景，${(video.durationInFrames / FPS / 60).toFixed(1)} 分钟`);
  const slices = writeFrameImages(video);
  if (process.argv.includes("--frames-only")) {
    console.log(`帧检查已输出：${frameDir}`);
    return;
  }
  await encodeVideoSegments(slices);

  if (await buildConcatenatedAudio(video)) {
    const durationSeconds = video.durationInFrames / FPS;
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
      "[outa]",
      "-filter_complex",
      `[1:a]apad,atrim=duration=${durationSeconds.toFixed(6)}[outa]`,
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-t",
      durationSeconds.toFixed(6),
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
