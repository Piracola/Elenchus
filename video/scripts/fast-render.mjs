import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { buildVideoModel } from "../src/normalizeElenchusExport.ts";
import {
  BOOKEND_TYPE,
  buildFooterModel,
  buildHeaderModel,
  buildIntroModel,
  buildOutroModel,
  buildSceneSlices,
  buildSceneViewModel,
  CARD_RADIUS,
  formatScore,
  formatScoreFixed,
  HEADER_TYPE,
  INTRO_LAYOUT,
  JUDGE_BOARD,
  OUTRO_LAYOUT,
  sampleFrameForSlice,
  SCENE_COLORS,
  SCENE_LAYOUT,
  SCORE_BOARD,
  SPEAKER_BOARD,
  VIDEO_FONT_FAMILY,
} from "../src/scenePresentation.ts";
import { resolveCompositorBinary } from "./compositor-binaries.mjs";

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
const ffmpegPath = resolveCompositorBinary(rootDir, "ffmpeg");

const colors = SCENE_COLORS;
const WIDTH = SCENE_LAYOUT.width;
const HEIGHT = SCENE_LAYOUT.height;
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

/* ---------- primitives ---------- */

const roundedRect = (ctx, x, y, width, height, radius) => {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
};

const fillRound = (ctx, x, y, width, height, radius, fill) => {
  roundedRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
};

const strokeRound = (ctx, x, y, width, height, radius, stroke, lineWidth = 1) => {
  const inset = lineWidth / 2;
  roundedRect(ctx, x + inset, y + inset, width - lineWidth, height - lineWidth, radius);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
};

const withClip = (ctx, x, y, width, height, draw) => {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  draw();
  ctx.restore();
};

/** Vertically centred text, matching how CSS centres a glyph box in its line box. */
const text = (ctx, value, x, centerY, options = {}) => {
  ctx.font = font(options.size || 20, options.weight || 400);
  ctx.fillStyle = options.color || colors.ink;
  ctx.textAlign = options.align || "left";
  ctx.textBaseline = "middle";
  ctx.fillText(String(value ?? ""), x, centerY);
};

const measure = (ctx, value, size, weight = 400) => {
  ctx.font = font(size, weight);
  return ctx.measureText(String(value ?? "")).width;
};

/** Canvas has no letter-spacing, so tracked headings are drawn glyph by glyph. */
const trackedText = (ctx, value, centerX, centerY, options = {}) => {
  const chars = Array.from(String(value ?? ""));
  const spacing = options.letterSpacing || 0;
  const size = options.size || 20;
  const weight = options.weight || 400;
  ctx.font = font(size, weight);
  const total = chars.reduce((sum, char) => sum + ctx.measureText(char).width + spacing, 0);
  let cursor = centerX - total / 2;
  ctx.fillStyle = options.color || colors.ink;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (const char of chars) {
    ctx.fillText(char, cursor, centerY);
    cursor += ctx.measureText(char).width + spacing;
  }
};

const drawPage = (ctx) => {
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, colors.background);
  gradient.addColorStop(1, colors.backgroundEdge);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
};

const drawCard = (ctx, rect, options = {}) => {
  const { x, y, width, height } = rect;
  ctx.save();
  ctx.shadowColor = "rgba(23,34,43,0.06)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 20;
  fillRound(ctx, x, y, width, height, CARD_RADIUS, colors.panel);
  ctx.restore();
  if (options.active && options.accent) {
    ctx.save();
    ctx.globalAlpha = 0.1;
    strokeRound(ctx, x - 3, y - 3, width + 6, height + 6, CARD_RADIUS + 3, options.accent, 3);
    ctx.restore();
    strokeRound(ctx, x, y, width, height, CARD_RADIUS, options.accent, 1);
  } else {
    strokeRound(ctx, x, y, width, height, CARD_RADIUS, colors.faint, 1);
  }
};

const drawCardTitle = (ctx, rect, options) => {
  const { titleHeight, paddingX, accent, title } = options;
  const centerY = rect.y + titleHeight / 2;
  fillRound(ctx, rect.x + paddingX, centerY - 9, 4, 18, 2, accent);
  text(ctx, title, rect.x + paddingX + 14, centerY, { size: 22, weight: 700, color: colors.ink });
  ctx.fillStyle = colors.hairline;
  ctx.fillRect(rect.x + 1, rect.y + titleHeight - 1, rect.width - 2, 1);
  return centerY;
};

/* ---------- scene ---------- */

const drawHeader = (ctx, header) => {
  const rect = SCENE_LAYOUT.header;
  const kickerLine = HEADER_TYPE.kickerFontSize * 1.2;
  const topicLine = HEADER_TYPE.topicFontSize * 1.15;
  const leftTop = rect.y + rect.height - (kickerLine + 12 + topicLine);
  trackedText(
    ctx,
    header.kicker,
    rect.x + measureTracked(ctx, header.kicker, HEADER_TYPE.kickerFontSize, 700, HEADER_TYPE.kickerLetterSpacing) / 2,
    leftTop + kickerLine / 2,
    {
      size: HEADER_TYPE.kickerFontSize,
      weight: 700,
      color: colors.score,
      letterSpacing: HEADER_TYPE.kickerLetterSpacing,
    },
  );
  text(ctx, header.topic, rect.x, leftTop + kickerLine + 12 + topicLine / 2, {
    size: HEADER_TYPE.topicFontSize,
    weight: 700,
    color: colors.ink,
  });

  const right = rect.x + rect.width;
  const metaLine = HEADER_TYPE.metaFontSize * 1.2;
  const rightTop = rect.y + rect.height - 4 - (metaLine + 14 + HEADER_TYPE.pillHeight);
  text(ctx, `${header.stepper.label} · ${header.timelineLabel}`, right, rightTop + metaLine / 2, {
    size: HEADER_TYPE.metaFontSize,
    weight: 600,
    color: colors.muted,
    align: "right",
  });

  const pillTop = rightTop + metaLine + 14;
  if (header.stepper.kind === "pills") {
    const widths = Array.from({ length: header.stepper.total }, (_, index) =>
      index === header.stepper.index ? HEADER_TYPE.pillActiveWidth : HEADER_TYPE.pillWidth,
    );
    const total = widths.reduce((sum, width) => sum + width, 0) + HEADER_TYPE.pillGap * (widths.length - 1);
    let cursor = right - total;
    widths.forEach((width, index) => {
      const fill =
        index === header.stepper.index
          ? colors.score
          : index < header.stepper.index
            ? "rgba(63,95,143,0.32)"
            : colors.faint;
      fillRound(ctx, cursor, pillTop, width, HEADER_TYPE.pillHeight, 999, fill);
      cursor += width + HEADER_TYPE.pillGap;
    });
    return;
  }
  const barX = right - HEADER_TYPE.barWidth;
  fillRound(ctx, barX, pillTop, HEADER_TYPE.barWidth, HEADER_TYPE.pillHeight, 999, colors.faint);
  const filled = (HEADER_TYPE.barWidth * (header.stepper.index + 1)) / header.stepper.total;
  fillRound(ctx, barX, pillTop, filled, HEADER_TYPE.pillHeight, 999, colors.score);
};

const measureTracked = (ctx, value, size, weight, spacing) => {
  ctx.font = font(size, weight);
  return Array.from(String(value ?? "")).reduce((sum, char) => sum + ctx.measureText(char).width + spacing, 0);
};

const drawEmptyState = (ctx, rect, top, height, label) => {
  text(ctx, label, rect.x + rect.width / 2, top + height / 2, {
    size: 20,
    weight: 500,
    color: colors.muted,
    align: "center",
  });
};

const drawSpeakerCard = (ctx, view) => {
  const rect = SCENE_LAYOUT.speaker;
  const board = view.speaker;
  drawCard(ctx, rect);
  const titleCenter = drawCardTitle(ctx, rect, {
    titleHeight: SPEAKER_BOARD.titleHeight,
    paddingX: SPEAKER_BOARD.paddingX,
    accent: board.speaker?.theme.accent ?? colors.muted,
    title: "辩手发言",
  });

  if (board.speaker) {
    const right = rect.x + rect.width - SPEAKER_BOARD.paddingX;
    const detailWidth = board.speaker.detail ? measure(ctx, board.speaker.detail, 18, 500) : 0;
    const labelRight = board.speaker.detail ? right - detailWidth - 12 : right;
    if (board.speaker.detail) {
      text(ctx, board.speaker.detail, right, titleCenter, {
        size: 18,
        weight: 500,
        color: colors.muted,
        align: "right",
      });
    }
    text(ctx, board.speaker.label, labelRight, titleCenter, {
      size: 21,
      weight: 700,
      color: board.speaker.theme.text,
      align: "right",
    });
    const labelWidth = measure(ctx, board.speaker.label, 21, 700);
    fillRound(ctx, labelRight - labelWidth - 12 - 10, titleCenter - 5, 10, 10, 999, board.speaker.theme.accent);
  }

  if (board.empty) {
    drawEmptyState(
      ctx,
      rect,
      rect.y + SPEAKER_BOARD.titleHeight,
      rect.height - SPEAKER_BOARD.titleHeight,
      "本轮没有辩手发言。",
    );
    return;
  }

  withClip(ctx, board.rect.x, board.rect.y, board.rect.width, board.rect.height, () => {
    for (const block of board.blocks) {
      const top = board.rect.y + block.top + board.scrollOffset;
      if (block.state === "active") {
        fillRound(ctx, board.rect.x, top, board.rect.width, block.height, 8, `${block.theme.accent}0f`);
        fillRound(
          ctx,
          board.rect.x,
          top + SPEAKER_BOARD.blockPaddingY,
          SPEAKER_BOARD.railWidth,
          block.height - SPEAKER_BOARD.blockPaddingY * 2,
          999,
          block.theme.accent,
        );
      }
      ctx.save();
      ctx.globalAlpha = block.opacity;
      block.lines.forEach((line, index) => {
        text(
          ctx,
          line,
          board.rect.x + SPEAKER_BOARD.blockTextLeft,
          top + SPEAKER_BOARD.blockPaddingY + (index + 0.5) * board.lineHeightPx,
          { size: board.fontSize, weight: block.fontWeight, color: block.theme.text },
        );
      });
      ctx.restore();
    }
  });

  // Same soft edge the Remotion mask produces, painted in the card colour.
  const fadeTop = ctx.createLinearGradient(0, board.rect.y, 0, board.rect.y + SPEAKER_BOARD.fadeHeight);
  fadeTop.addColorStop(0, colors.panel);
  fadeTop.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = fadeTop;
  ctx.fillRect(board.rect.x, board.rect.y, board.rect.width, SPEAKER_BOARD.fadeHeight);

  const fadeBottomTop = board.rect.y + board.rect.height - SPEAKER_BOARD.fadeHeight;
  const fadeBottom = ctx.createLinearGradient(0, fadeBottomTop, 0, board.rect.y + board.rect.height);
  fadeBottom.addColorStop(0, "rgba(255,255,255,0)");
  fadeBottom.addColorStop(1, colors.panel);
  ctx.fillStyle = fadeBottom;
  ctx.fillRect(board.rect.x, fadeBottomTop, board.rect.width, SPEAKER_BOARD.fadeHeight);
};

const drawJudgeCard = (ctx, board) => {
  const rect = SCENE_LAYOUT.judge;
  drawCard(ctx, rect, { accent: colors.judge, active: board.active });
  drawCardTitle(ctx, rect, {
    titleHeight: JUDGE_BOARD.titleHeight,
    paddingX: JUDGE_BOARD.paddingX,
    accent: colors.judge,
    title: "裁判评议",
  });

  const contentX = rect.x + JUDGE_BOARD.paddingX;
  const chipTop = rect.y + JUDGE_BOARD.titleHeight + JUDGE_BOARD.paddingTop;
  const chipCenter = chipTop + JUDGE_BOARD.chipHeight / 2;
  if (board.winner) {
    const prefix = "本轮胜方";
    const prefixWidth = measure(ctx, prefix, JUDGE_BOARD.chipFontSize, 600);
    const labelWidth = measure(ctx, board.winner.label, JUDGE_BOARD.chipFontSize, 700);
    const chipWidth = JUDGE_BOARD.chipPaddingX * 2 + prefixWidth + JUDGE_BOARD.chipGap + labelWidth;
    fillRound(ctx, contentX, chipTop, chipWidth, JUDGE_BOARD.chipHeight, 999, board.winner.theme.soft);
    text(ctx, prefix, contentX + JUDGE_BOARD.chipPaddingX, chipCenter, {
      size: JUDGE_BOARD.chipFontSize,
      weight: 600,
      color: colors.muted,
    });
    text(
      ctx,
      board.winner.label,
      contentX + JUDGE_BOARD.chipPaddingX + prefixWidth + JUDGE_BOARD.chipGap,
      chipCenter,
      { size: JUDGE_BOARD.chipFontSize, weight: 700, color: board.winner.theme.text },
    );
  } else {
    text(ctx, "本轮未判定胜方", contentX, chipCenter, {
      size: JUDGE_BOARD.chipFontSize,
      weight: 600,
      color: colors.muted,
    });
  }

  const textTop = chipTop + JUDGE_BOARD.chipHeight + JUDGE_BOARD.chipMarginBottom;
  if (board.empty) {
    text(ctx, "本轮暂无裁判评议。", contentX, textTop + (JUDGE_BOARD.fontSize * JUDGE_BOARD.lineHeight) / 2, {
      size: JUDGE_BOARD.fontSize,
      weight: 500,
      color: colors.muted,
    });
    return;
  }
  const lineHeightPx = JUDGE_BOARD.fontSize * JUDGE_BOARD.lineHeight;
  board.lines.forEach((line, index) => {
    text(ctx, line, contentX, textTop + (index + 0.5) * lineHeightPx, {
      size: JUDGE_BOARD.fontSize,
      weight: 400,
      color: colors.inkSoft,
    });
  });
};

const drawScoreBar = (ctx, x, y, value, accent, align) => {
  fillRound(ctx, x, y, SCORE_BOARD.barWidth, SCORE_BOARD.barHeight, 999, colors.faint);
  const filled = (SCORE_BOARD.barWidth * Math.max(0, Math.min(10, value ?? 0))) / 10;
  if (filled <= 0) return;
  const startX = align === "right" ? x + SCORE_BOARD.barWidth - filled : x;
  fillRound(ctx, startX, y, filled, SCORE_BOARD.barHeight, 999, accent);
};

const drawScoreCard = (ctx, board) => {
  const rect = SCENE_LAYOUT.score;
  const active = board.kind !== "empty" && board.active;
  drawCard(ctx, rect, { accent: colors.score, active });
  const titleCenter = drawCardTitle(ctx, rect, {
    titleHeight: SCORE_BOARD.titleHeight,
    paddingX: SCORE_BOARD.paddingX,
    accent: colors.score,
    title: "本轮评分",
  });
  text(ctx, "综合分 / 10", rect.x + rect.width - SCORE_BOARD.paddingX, titleCenter, {
    size: 16,
    weight: 600,
    color: colors.muted,
    align: "right",
  });

  const innerX = rect.x + SCORE_BOARD.paddingX;
  const innerWidth = rect.width - SCORE_BOARD.paddingX * 2;
  const contentTop = rect.y + SCORE_BOARD.titleHeight + SCORE_BOARD.paddingTop;

  if (board.kind === "empty") {
    drawEmptyState(
      ctx,
      rect,
      rect.y + SCORE_BOARD.titleHeight,
      rect.height - SCORE_BOARD.titleHeight,
      "本轮暂未记录评分。",
    );
    return;
  }

  if (board.kind === "stack") {
    let cursor = contentTop;
    for (const card of board.cards) {
      text(ctx, card.label, innerX, cursor + 10, { size: 19, weight: 700, color: card.theme.text });
      text(ctx, formatScoreFixed(card.score), innerX + innerWidth, cursor + 16, {
        size: 32,
        weight: 700,
        color: card.theme.accent,
        align: "right",
      });
      cursor += 36;
      for (const row of card.rows) {
        const center = cursor + SCORE_BOARD.rowHeight / 2;
        text(ctx, row.label, innerX, center, { size: 15, weight: 400, color: colors.muted });
        const barX = innerX + SCORE_BOARD.dimensionLabelWidth + 8;
        const barWidth = innerWidth - SCORE_BOARD.dimensionLabelWidth - SCORE_BOARD.valueWidth - 24;
        fillRound(ctx, barX, center - SCORE_BOARD.barHeight / 2, barWidth, SCORE_BOARD.barHeight, 999, colors.faint);
        fillRound(
          ctx,
          barX,
          center - SCORE_BOARD.barHeight / 2,
          (barWidth * Math.max(0, Math.min(10, row.score ?? 0))) / 10,
          SCORE_BOARD.barHeight,
          999,
          card.theme.accent,
        );
        text(ctx, formatScore(row.score), innerX + innerWidth, center, {
          size: 14,
          weight: 700,
          color: card.theme.text,
          align: "right",
        });
        cursor += SCORE_BOARD.rowHeight;
      }
      cursor += 18;
    }
    return;
  }

  const labelLine = SCORE_BOARD.sideLabelFontSize * 1.2;
  const versusBottom = contentTop + labelLine + SCORE_BOARD.sideLabelGap + SCORE_BOARD.sideScoreFontSize;
  const drawSide = (side, align) => {
    const x = align === "left" ? innerX : innerX + innerWidth;
    text(ctx, side.label, x, contentTop + labelLine / 2, {
      size: SCORE_BOARD.sideLabelFontSize,
      weight: 700,
      color: side.theme.text,
      align,
    });
    text(ctx, formatScoreFixed(side.score), x, versusBottom - SCORE_BOARD.sideScoreFontSize / 2, {
      size: SCORE_BOARD.sideScoreFontSize,
      weight: 700,
      color: side.theme.accent,
      align,
    });
  };
  drawSide(board.left, "left");
  drawSide(board.right, "right");
  text(ctx, "VS", innerX + innerWidth / 2, versusBottom - 10 - 7.5, {
    size: 15,
    weight: 700,
    color: colors.muted,
    align: "center",
  });

  const splitTop = versusBottom + SCORE_BOARD.splitBarMarginTop;
  fillRound(ctx, innerX, splitTop, innerWidth, SCORE_BOARD.splitBarHeight, 999, colors.hairline);
  withClip(ctx, innerX, splitTop, innerWidth, SCORE_BOARD.splitBarHeight, () => {
    fillRound(ctx, innerX, splitTop, innerWidth, SCORE_BOARD.splitBarHeight, 999, board.right.theme.accent);
    fillRound(
      ctx,
      innerX,
      splitTop,
      innerWidth * board.leftShare,
      SCORE_BOARD.splitBarHeight,
      999,
      board.left.theme.accent,
    );
  });

  const rowsTop = splitTop + SCORE_BOARD.splitBarHeight + SCORE_BOARD.rowsMarginTop;
  const groupWidth =
    SCORE_BOARD.valueWidth * 2 +
    SCORE_BOARD.barWidth * 2 +
    SCORE_BOARD.dimensionLabelWidth +
    SCORE_BOARD.rowGap * 4;
  const groupX = innerX + (innerWidth - groupWidth) / 2;
  board.rows.forEach((row, index) => {
    const center = rowsTop + index * SCORE_BOARD.rowHeight + SCORE_BOARD.rowHeight / 2;
    let cursor = groupX;
    text(ctx, formatScore(row.leftScore), cursor + SCORE_BOARD.valueWidth, center, {
      size: 14,
      weight: 700,
      color: board.left.theme.text,
      align: "right",
    });
    cursor += SCORE_BOARD.valueWidth + SCORE_BOARD.rowGap;
    drawScoreBar(ctx, cursor, center - SCORE_BOARD.barHeight / 2, row.leftScore, board.left.theme.accent, "right");
    cursor += SCORE_BOARD.barWidth + SCORE_BOARD.rowGap;
    text(ctx, row.label, cursor + SCORE_BOARD.dimensionLabelWidth / 2, center, {
      size: 15,
      weight: 600,
      color: colors.muted,
      align: "center",
    });
    cursor += SCORE_BOARD.dimensionLabelWidth + SCORE_BOARD.rowGap;
    drawScoreBar(ctx, cursor, center - SCORE_BOARD.barHeight / 2, row.rightScore, board.right.theme.accent, "left");
    cursor += SCORE_BOARD.barWidth + SCORE_BOARD.rowGap;
    text(ctx, formatScore(row.rightScore), cursor, center, {
      size: 14,
      weight: 700,
      color: board.right.theme.text,
    });
  });

  if (!board.comment) {
    return;
  }
  const rowsBottom = rowsTop + board.rows.length * SCORE_BOARD.rowHeight;
  const dividerY = rowsBottom + SCORE_BOARD.commentMarginTop;
  ctx.fillStyle = colors.hairline;
  ctx.fillRect(innerX, dividerY, innerWidth, 1);
  const titleTop = dividerY + 1 + SCORE_BOARD.commentPaddingTop;
  text(ctx, `${board.comment.label}总评`, innerX, titleTop + 9, {
    size: 15,
    weight: 700,
    color: board.comment.theme.text,
  });
  const linesTop = titleTop + 18 + SCORE_BOARD.commentTitleGap;
  const lineHeightPx = SCORE_BOARD.commentFontSize * SCORE_BOARD.commentLineHeight;
  board.comment.lines.forEach((line, index) => {
    text(ctx, line, innerX, linesTop + (index + 0.5) * lineHeightPx, {
      size: SCORE_BOARD.commentFontSize,
      weight: 400,
      color: colors.muted,
    });
  });
};

const drawFooter = (ctx, video, sceneIndex, frame) => {
  const model = buildFooterModel(video, sceneIndex, frame);
  const label = SCENE_LAYOUT.footerLabel;
  const bar = SCENE_LAYOUT.footer;
  const labelCenter = label.y + label.height / 2;
  text(ctx, model.elapsed, label.x, labelCenter, { size: 17, weight: 600, color: colors.muted });
  text(ctx, model.total, label.x + label.width, labelCenter, {
    size: 17,
    weight: 600,
    color: colors.muted,
    align: "right",
  });
  fillRound(ctx, bar.x, bar.y, bar.width, bar.height, 999, colors.faint);
  withClip(ctx, bar.x, bar.y, bar.width, bar.height, () => {
    fillRound(ctx, bar.x, bar.y, Math.max(0, bar.width * model.progress), bar.height, 999, colors.score);
    ctx.fillStyle = colors.background;
    for (const tick of model.ticks) {
      ctx.fillRect(bar.x + bar.width * tick, bar.y, 2, bar.height);
    }
  });
};

const drawScene = (video, scene, sceneIndex, filePath, frame) => {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  ctx.resetTransform();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  const view = buildSceneViewModel(scene, frame);
  drawPage(ctx);
  drawHeader(ctx, buildHeaderModel(video, scene, sceneIndex));
  drawSpeakerCard(ctx, view);
  drawJudgeCard(ctx, view.judge);
  drawScoreCard(ctx, view.score);
  drawFooter(ctx, video, sceneIndex, frame);
  writeFileSync(filePath, canvas.toBuffer("image/png"));
};

/* ---------- bookends ---------- */

const drawSidePanel = (ctx, side, x, y, width, height, stats) => {
  ctx.save();
  ctx.shadowColor = "rgba(23,34,43,0.06)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 20;
  fillRound(ctx, x, y, width, height, CARD_RADIUS, colors.panel);
  ctx.restore();
  strokeRound(ctx, x, y, width, height, CARD_RADIUS, colors.faint, 1);
  withClip(ctx, x, y, width, BOOKEND_TYPE.sideAccentHeight, () => {
    fillRound(ctx, x, y, width, CARD_RADIUS * 2, CARD_RADIUS, side.theme.accent);
  });

  const labelLine = BOOKEND_TYPE.sideLabelFontSize * 1.2;
  const detailLine = side.detail ? BOOKEND_TYPE.sideDetailFontSize * 1.2 : 0;
  const statHeight = stats
    ? BOOKEND_TYPE.statMarginTop +
      BOOKEND_TYPE.statLabelFontSize * 1.2 +
      BOOKEND_TYPE.statLabelGap +
      BOOKEND_TYPE.statValueFontSize * 1.2
    : 0;
  const contentHeight =
    labelLine +
    (detailLine ? BOOKEND_TYPE.sideGapY + detailLine : 0) +
    (statHeight ? BOOKEND_TYPE.sideGapY + statHeight : 0);
  const centerX = x + width / 2;
  let cursor = y + BOOKEND_TYPE.sideAccentHeight + (height - BOOKEND_TYPE.sideAccentHeight - contentHeight) / 2;

  text(ctx, side.label, centerX, cursor + labelLine / 2, {
    size: BOOKEND_TYPE.sideLabelFontSize,
    weight: 700,
    color: side.theme.text,
    align: "center",
  });
  cursor += labelLine;
  if (detailLine) {
    cursor += BOOKEND_TYPE.sideGapY;
    text(ctx, side.detail, centerX, cursor + detailLine / 2, {
      size: BOOKEND_TYPE.sideDetailFontSize,
      weight: 400,
      color: colors.muted,
      align: "center",
    });
    cursor += detailLine;
  }
  if (!stats) {
    return;
  }
  cursor += BOOKEND_TYPE.sideGapY + BOOKEND_TYPE.statMarginTop;
  const statLabelLine = BOOKEND_TYPE.statLabelFontSize * 1.2;
  const statValueLine = BOOKEND_TYPE.statValueFontSize * 1.2;
  const columnsWidth = BOOKEND_TYPE.statColumnWidth * 2 + BOOKEND_TYPE.statGap;
  stats.forEach((stat, index) => {
    const columnCenter =
      centerX -
      columnsWidth / 2 +
      index * (BOOKEND_TYPE.statColumnWidth + BOOKEND_TYPE.statGap) +
      BOOKEND_TYPE.statColumnWidth / 2;
    text(ctx, stat.label, columnCenter, cursor + statLabelLine / 2, {
      size: BOOKEND_TYPE.statLabelFontSize,
      weight: 400,
      color: colors.muted,
      align: "center",
    });
    text(
      ctx,
      stat.value,
      columnCenter,
      cursor + statLabelLine + BOOKEND_TYPE.statLabelGap + statValueLine / 2,
      {
        size: BOOKEND_TYPE.statValueFontSize,
        weight: 700,
        color: side.theme.accent,
        align: "center",
      },
    );
  });
};

const drawBookendText = (ctx, model, layout) => {
  trackedText(ctx, model.kicker, WIDTH / 2, layout.kickerY + (BOOKEND_TYPE.kickerFontSize * 1.2) / 2, {
    size: BOOKEND_TYPE.kickerFontSize,
    weight: 700,
    color: colors.score,
    letterSpacing: BOOKEND_TYPE.kickerLetterSpacing,
  });
  const topicLine = layout.topicFontSize * layout.topicLineHeight;
  model.topicLines.forEach((line, index) => {
    text(ctx, line, WIDTH / 2, layout.topicY + (index + 0.5) * topicLine, {
      size: layout.topicFontSize,
      weight: 700,
      color: colors.ink,
      align: "center",
    });
  });
  text(ctx, model.meta, WIDTH / 2, layout.metaY + (BOOKEND_TYPE.metaFontSize * 1.2) / 2, {
    size: BOOKEND_TYPE.metaFontSize,
    weight: 400,
    color: colors.muted,
    align: "center",
  });
};

const drawIntro = (video, filePath) => {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  const model = buildIntroModel(video);
  drawPage(ctx);
  drawBookendText(ctx, model, INTRO_LAYOUT);
  const totalWidth = INTRO_LAYOUT.sideWidth * 2 + INTRO_LAYOUT.sideGap * 2 + BOOKEND_TYPE.vsWidth;
  const left = (WIDTH - totalWidth) / 2;
  if (model.sides[0]) {
    drawSidePanel(ctx, model.sides[0], left, INTRO_LAYOUT.sideY, INTRO_LAYOUT.sideWidth, INTRO_LAYOUT.sideHeight);
  }
  trackedText(ctx, "VS", WIDTH / 2, INTRO_LAYOUT.sideY + INTRO_LAYOUT.sideHeight / 2, {
    size: BOOKEND_TYPE.vsFontSize,
    weight: 700,
    color: colors.muted,
    letterSpacing: BOOKEND_TYPE.vsLetterSpacing,
  });
  if (model.sides[1]) {
    drawSidePanel(
      ctx,
      model.sides[1],
      left + INTRO_LAYOUT.sideWidth + INTRO_LAYOUT.sideGap * 2 + BOOKEND_TYPE.vsWidth,
      INTRO_LAYOUT.sideY,
      INTRO_LAYOUT.sideWidth,
      INTRO_LAYOUT.sideHeight,
    );
  }
  writeFileSync(filePath, canvas.toBuffer("image/png"));
};

const drawOutro = (video, filePath) => {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  const model = buildOutroModel(video);
  drawPage(ctx);
  drawBookendText(ctx, model, OUTRO_LAYOUT);
  const totalWidth = OUTRO_LAYOUT.sideWidth * 2 + OUTRO_LAYOUT.sideGap;
  let cursor = (WIDTH - totalWidth) / 2;
  for (const side of model.sides) {
    drawSidePanel(ctx, side, cursor, OUTRO_LAYOUT.sideY, OUTRO_LAYOUT.sideWidth, OUTRO_LAYOUT.sideHeight, [
      { label: "均分", value: formatScoreFixed(side.average) },
      { label: "胜出", value: `${side.wins} 轮` },
    ]);
    cursor += OUTRO_LAYOUT.sideWidth + OUTRO_LAYOUT.sideGap;
  }
  writeFileSync(filePath, canvas.toBuffer("image/png"));
};

const writeFrameImages = (video) => {
  const slices = [];
  const introPath = join(frameDir, "scene-000-intro.png");
  drawIntro(video, introPath);
  slices.push({ startFrame: 0, endFrame: video.introFrames, framePath: introPath });
  video.scenes.forEach((scene, sceneIndex) => {
    buildSceneSlices(scene.speakerLines, scene.durationInFrames, scene.segmentCues).forEach((slice, sliceIndex) => {
      const token = `scene-${String(sceneIndex + 1).padStart(3, "0")}-segment-${String(sliceIndex + 1).padStart(3, "0")}`;
      const framePath = join(frameDir, `${token}.png`);
      drawScene(video, scene, sceneIndex, framePath, sampleFrameForSlice(slice));
      slices.push({ ...slice, scene, framePath });
    });
  });
  const outroPath = join(frameDir, "scene-999-outro.png");
  drawOutro(video, outroPath);
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
