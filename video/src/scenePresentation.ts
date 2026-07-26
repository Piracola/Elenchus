import type { DebateScene, DebateVideoModel, LineCue, ScoreItem, SegmentCue } from "./types";
import {
  DIMENSION_LABELS,
  NO_LINE_END,
  NO_LINE_START,
  roleLabel,
  SCORE_KEYS,
  visualTextWidth,
} from "./videoScript";

export const VIDEO_FONT_FAMILY = '"Noto Sans Hans"';

export const SCENE_COLORS = {
  background: "#f3f6f7",
  backgroundEdge: "#e8eef1",
  ink: "#17222b",
  inkSoft: "#3c4a55",
  muted: "#66737d",
  faint: "#dfe6eb",
  hairline: "#edf1f4",
  panel: "#ffffff",
  affirmative: "#2f7d68",
  affirmativeSoft: "#e6f1ee",
  affirmativeText: "#245f4f",
  negative: "#a04a5b",
  negativeSoft: "#f6e9ec",
  negativeText: "#7d3a48",
  judge: "#8a6a2f",
  judgeSoft: "#f4eddd",
  score: "#3f5f8f",
  scoreSoft: "#e9eff7",
} as const;

/**
 * Every rectangle the two renderers share. Remotion positions absolutely and
 * Canvas draws at the same coordinates, so a layout change lands in both.
 */
export const SCENE_LAYOUT = {
  width: 1920,
  height: 1080,
  header: { x: 56, y: 44, width: 1808, height: 100 },
  speaker: { x: 56, y: 168, width: 1427, height: 828 },
  judge: { x: 1507, y: 168, width: 357, height: 380 },
  score: { x: 1507, y: 572, width: 357, height: 424 },
  footer: { x: 56, y: 1032, width: 1808, height: 6 },
  footerLabel: { x: 56, y: 1000, width: 1808, height: 22 },
} as const;

export const CARD_RADIUS = 10;

/** Reading window inside the speaker card, below its title row. */
export const SPEAKER_BOARD = {
  titleHeight: 66,
  paddingX: 34,
  paddingTop: 16,
  paddingBottom: 20,
  fontSize: 44,
  lineHeight: 1.45,
  blockPaddingY: 10,
  blockTextLeft: 26,
  blockPaddingRight: 24,
  blockGap: 12,
  railWidth: 5,
  /** Where the active line settles inside the reading window. */
  focalRatio: 0.42,
  /** Soft edge so clipped lines fade out instead of being sliced. */
  fadeHeight: 112,
} as const;

export const JUDGE_BOARD = {
  titleHeight: 52,
  paddingX: 24,
  paddingTop: 14,
  chipHeight: 34,
  chipPaddingX: 14,
  chipGap: 10,
  chipMarginBottom: 14,
  chipFontSize: 18,
  fontSize: 19,
  lineHeight: 1.62,
  maxLines: 8,
} as const;

export const SCORE_BOARD = {
  titleHeight: 52,
  paddingX: 22,
  paddingTop: 16,
  sideLabelFontSize: 17,
  sideLabelGap: 4,
  sideScoreFontSize: 36,
  splitBarMarginTop: 12,
  splitBarHeight: 8,
  rowsMarginTop: 12,
  rowHeight: 26,
  maxRows: 6,
  rowGap: 7,
  commentMarginTop: 10,
  commentPaddingTop: 10,
  commentTitleGap: 6,
  commentFontSize: 15,
  commentLineHeight: 1.55,
  commentMaxLines: 2,
  barWidth: 88,
  barHeight: 7,
  valueWidth: 24,
  dimensionLabelWidth: 48,
} as const;

/** Shared bookend metrics. Canvas mirrors the same boxes pixel for pixel. */
export const BOOKEND_TYPE = {
  kickerFontSize: 22,
  kickerLetterSpacing: 6,
  metaFontSize: 24,
  sideLabelFontSize: 38,
  sideDetailFontSize: 20,
  sideGapY: 8,
  sideAccentHeight: 4,
  vsWidth: 48,
  vsFontSize: 26,
  vsLetterSpacing: 4,
  statMarginTop: 6,
  statColumnWidth: 120,
  statGap: 28,
  statLabelFontSize: 15,
  statLabelGap: 2,
  statValueFontSize: 30,
} as const;

export const INTRO_LAYOUT = {
  kickerY: 286,
  topicY: 348,
  topicFontSize: 74,
  topicLineHeight: 1.22,
  topicMaxLines: 2,
  sideY: 620,
  sideWidth: 512,
  sideHeight: 138,
  sideGap: 128,
  metaY: 848,
} as const;

export const OUTRO_LAYOUT = {
  kickerY: 250,
  topicY: 312,
  topicFontSize: 58,
  topicLineHeight: 1.24,
  topicMaxLines: 2,
  sideY: 560,
  sideWidth: 512,
  sideHeight: 176,
  sideGap: 128,
  metaY: 830,
} as const;

/** Frames the teleprompter takes to settle on a newly spoken line. */
export const SPEAKER_SCROLL_FRAMES = 9;

export const DIMENSION_SHORT_LABELS: Record<string, string> = {
  logical_rigor: "逻辑",
  evidence_quality: "证据",
  topic_focus: "切题",
  rebuttal_strength: "反驳",
  consistency: "一致",
  persuasiveness: "说服",
};

export type SpeakerLineState = "active" | "near" | "past" | "future";

export type RoleTheme = {
  accent: string;
  soft: string;
  text: string;
  label: string;
};

const ROLE_THEMES: Record<string, RoleTheme> = {
  proposer: {
    accent: SCENE_COLORS.affirmative,
    soft: SCENE_COLORS.affirmativeSoft,
    text: SCENE_COLORS.affirmativeText,
    label: "正方",
  },
  opposer: {
    accent: SCENE_COLORS.negative,
    soft: SCENE_COLORS.negativeSoft,
    text: SCENE_COLORS.negativeText,
    label: "反方",
  },
  judge: {
    accent: SCENE_COLORS.judge,
    soft: SCENE_COLORS.judgeSoft,
    text: SCENE_COLORS.judge,
    label: "裁判",
  },
};

export const roleTheme = (role: string): RoleTheme =>
  ROLE_THEMES[role] ?? {
    accent: SCENE_COLORS.score,
    soft: SCENE_COLORS.scoreSoft,
    text: SCENE_COLORS.score,
    label: roleLabel(role),
  };

const withEllipsis = (text: string, maxWidth: number): string => {
  let result = text;
  while (result && visualTextWidth(`${result}…`) > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result.trimEnd()}…`;
};

export const fitTextLine = (value: unknown, maxWidth: number): string => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text || visualTextWidth(text) <= maxWidth) return text;
  return withEllipsis(text, maxWidth);
};

const WORD_CHAR = /[0-9A-Za-z@#$&*+=/\\_~^-]/;

/** Latin runs stay atomic; every other character breaks on its own. */
const tokenizeForWrap = (text: string): string[] => {
  const tokens: string[] = [];
  let word = "";
  for (const char of Array.from(text)) {
    if (WORD_CHAR.test(char)) {
      word += char;
      continue;
    }
    if (word) {
      tokens.push(word);
      word = "";
    }
    tokens.push(char);
  }
  if (word) tokens.push(word);
  return tokens;
};

/**
 * Width-based wrapping with the two rules that make Chinese subtitles read
 * cleanly: punctuation never opens a line, and Latin words are not cut apart.
 */
export const wrapTextLinesToWidth = (value: unknown, maxWidth: number): string[] => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return [];
  const lines: string[] = [];
  let current = "";

  const hardSplit = () => {
    while (visualTextWidth(current) > maxWidth) {
      let head = "";
      for (const char of current) {
        if (visualTextWidth(`${head}${char}`) > maxWidth) break;
        head += char;
      }
      if (!head || head.length === current.length) return;
      lines.push(head);
      current = current.slice(head.length);
    }
  };

  for (const token of tokenizeForWrap(text)) {
    if (token === " ") {
      if (current && visualTextWidth(`${current} `) <= maxWidth) {
        current += token;
      } else if (current) {
        lines.push(current.trimEnd());
        current = "";
      }
      continue;
    }

    if (!current) {
      current = token;
      if (visualTextWidth(token) > maxWidth) hardSplit();
      continue;
    }

    if (visualTextWidth(`${current}${token}`) <= maxWidth) {
      current += token;
      continue;
    }

    if (NO_LINE_START.includes(token)) {
      // Hang one character past the measured width, or push its neighbour down.
      if (visualTextWidth(`${current}${token}`) <= maxWidth + 1) {
        current += token;
      } else {
        const moved = current.slice(-1);
        lines.push(current.slice(0, -1).trimEnd());
        current = `${moved}${token}`;
      }
      continue;
    }

    let carry = "";
    while (current.trimEnd().length > 1 && NO_LINE_END.includes(current.trimEnd().slice(-1))) {
      current = current.trimEnd();
      carry = `${current.slice(-1)}${carry}`;
      current = current.slice(0, -1);
    }
    lines.push(current.trimEnd());
    current = `${carry}${token}`;
    if (visualTextWidth(current) > maxWidth) hardSplit();
  }

  if (current.trim()) lines.push(current.trimEnd());
  return lines;
};

export const wrapTextLinesClamped = (value: unknown, maxWidth: number, maxLines: number): string[] => {
  const lines = wrapTextLinesToWidth(value, maxWidth);
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  visible[maxLines - 1] = withEllipsis(visible[maxLines - 1], maxWidth);
  return visible;
};

export const formatScore = (score: number | null | undefined): string => {
  if (typeof score !== "number" || !Number.isFinite(score)) return "-";
  return Number.isInteger(score) ? `${score}` : score.toFixed(1);
};

export const formatScoreFixed = (score: number | null | undefined): string => {
  if (typeof score !== "number" || !Number.isFinite(score)) return "-";
  return score.toFixed(1);
};

export const formatClock = (frames: number, fps: number): string => {
  const totalSeconds = Math.max(0, Math.round(frames / fps));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
};

/**
 * `正方 (Proposer)` next to a `正方` chip reads as a stutter, so the redundant
 * prefix and its brackets are dropped before the agent name is shown.
 */
export const speakerDetail = (label: string, agentName: unknown): string => {
  const raw = String(agentName ?? "").replace(/\s+/g, " ").trim();
  if (!raw || raw === label) return "";
  const rest = (raw.startsWith(label) ? raw.slice(label.length) : raw)
    .replace(/^[\s·、,，:：\-—(（]+/, "")
    .replace(/[)）\s]+$/, "")
    .trim();
  return rest && rest !== label ? rest : "";
};

export const SPEAKER_LINE_STYLES = {
  active: { fontSize: SPEAKER_BOARD.fontSize, lineHeight: SPEAKER_BOARD.lineHeight, opacity: 1, fontWeight: 700 },
  near: { fontSize: SPEAKER_BOARD.fontSize, lineHeight: SPEAKER_BOARD.lineHeight, opacity: 0.66, fontWeight: 500 },
  past: { fontSize: SPEAKER_BOARD.fontSize, lineHeight: SPEAKER_BOARD.lineHeight, opacity: 0.32, fontWeight: 400 },
  future: { fontSize: SPEAKER_BOARD.fontSize, lineHeight: SPEAKER_BOARD.lineHeight, opacity: 0.32, fontWeight: 400 },
} as const;

export const activeLineIndexAtFrame = (lines: LineCue[], frame: number): number => {
  if (lines.length === 0) {
    return -1;
  }
  const index = lines.findIndex((line) => frame >= line.startFrame && frame < line.endFrame);
  if (index >= 0) {
    return index;
  }
  return frame < lines[0].startFrame ? 0 : lines.length - 1;
};

export const speakerLineState = (index: number, activeIndex: number): SpeakerLineState =>
  index === activeIndex
    ? "active"
    : Math.abs(index - activeIndex) === 1
      ? "near"
      : index < activeIndex
        ? "past"
        : "future";

export const computeSpeakerLayout = (lines: LineCue[], activeIndex: number) => {
  const items: Array<{ top: number; textCenter: number; state: SpeakerLineState }> = [];
  let top = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const state = speakerLineState(index, activeIndex);
    const style = SPEAKER_LINE_STYLES[state];
    const textTop = top + SPEAKER_BOARD.blockPaddingY;
    const textCenter = textTop + (style.fontSize * style.lineHeight) / 2;
    items.push({ top, textCenter, state });
    top += SPEAKER_BOARD.blockPaddingY * 2 + style.fontSize * style.lineHeight + SPEAKER_BOARD.blockGap;
  }
  return { items, totalHeight: top };
};

export const buildSceneSlices = (lines: LineCue[], durationInFrames: number, segments: SegmentCue[] = []) => {
  if (durationInFrames <= 0) {
    return [];
  }
  if (lines.length === 0 && segments.length === 0) {
    return [{ activeIndex: -1, startFrame: 0, endFrame: durationInFrames }];
  }
  const starts = [...new Set([
    0,
    ...lines.map((line) => line.startFrame),
    ...segments.map((segment) => segment.startFrame),
  ].map((frame) => Math.max(0, Math.min(durationInFrames - 1, Math.round(frame)))))]
    .sort((a, b) => a - b);
  return starts.map((startFrame, index) => ({
    activeIndex: activeLineIndexAtFrame(lines, startFrame),
    startFrame,
    endFrame:
      index === starts.length - 1
        ? durationInFrames
        : starts[index + 1],
  }));
};

/**
 * Canvas renders one still per slice. Sampling a few frames in means it shows
 * the settled teleprompter position rather than the start of the scroll.
 */
export const sampleFrameForSlice = (slice: { startFrame: number; endFrame: number }): number =>
  Math.max(slice.startFrame, Math.min(slice.endFrame - 1, slice.startFrame + SPEAKER_SCROLL_FRAMES));

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const easeOutCubic = (value: number): number => 1 - (1 - value) ** 3;

export type SpeakerBlock = {
  id: string;
  index: number;
  state: SpeakerLineState;
  role: string;
  label: string;
  theme: RoleTheme;
  lines: string[];
  top: number;
  height: number;
  opacity: number;
  fontWeight: number;
};

export type SpeakerBoard = {
  /** Reading window in absolute video coordinates. */
  rect: { x: number; y: number; width: number; height: number };
  textWidth: number;
  fontSize: number;
  lineHeightPx: number;
  scrollOffset: number;
  blocks: SpeakerBlock[];
  speaker: { label: string; detail: string; theme: RoleTheme } | null;
  empty: boolean;
};

const speakerRect = () => ({
  x: SCENE_LAYOUT.speaker.x + SPEAKER_BOARD.paddingX,
  y: SCENE_LAYOUT.speaker.y + SPEAKER_BOARD.titleHeight + SPEAKER_BOARD.paddingTop,
  width: SCENE_LAYOUT.speaker.width - SPEAKER_BOARD.paddingX * 2,
  height:
    SCENE_LAYOUT.speaker.height -
    SPEAKER_BOARD.titleHeight -
    SPEAKER_BOARD.paddingTop -
    SPEAKER_BOARD.paddingBottom,
});

const buildSpeakerBoard = (lines: LineCue[], activeIndex: number, frame: number): SpeakerBoard => {
  const rect = speakerRect();
  const lineHeightPx = SPEAKER_BOARD.fontSize * SPEAKER_BOARD.lineHeight;
  const textWidth = rect.width - SPEAKER_BOARD.blockTextLeft - SPEAKER_BOARD.blockPaddingRight;
  const maxVisualWidth = textWidth / SPEAKER_BOARD.fontSize;

  const measured = lines.map((cue, index) => {
    const wrapped = wrapTextLinesToWidth(cue.text, maxVisualWidth);
    const displayLines = wrapped.length ? wrapped : [""];
    return {
      cue,
      index,
      displayLines,
      height: SPEAKER_BOARD.blockPaddingY * 2 + displayLines.length * lineHeightPx,
    };
  });

  let cursor = 0;
  const positioned = measured.map((item) => {
    const top = cursor;
    cursor += item.height + SPEAKER_BOARD.blockGap;
    return { ...item, top };
  });
  const totalHeight = Math.max(0, cursor - SPEAKER_BOARD.blockGap);

  const offsetFor = (index: number): number => {
    const item = positioned[index];
    if (!item) return 0;
    const focal = rect.height * SPEAKER_BOARD.focalRatio;
    const raw = focal - (item.top + item.height / 2);
    return Math.max(Math.min(0, rect.height - totalHeight), Math.min(0, raw));
  };

  const target = offsetFor(activeIndex);
  const previous = activeIndex > 0 ? offsetFor(activeIndex - 1) : target;
  const activeCue = lines[activeIndex];
  const progress = activeCue
    ? clamp01((frame - activeCue.startFrame) / SPEAKER_SCROLL_FRAMES)
    : 1;
  const scrollOffset = previous + (target - previous) * easeOutCubic(progress);

  const blocks = positioned
    .filter((item) => {
      const top = item.top + scrollOffset;
      return top + item.height > -SPEAKER_BOARD.fadeHeight && top < rect.height + SPEAKER_BOARD.fadeHeight;
    })
    .map((item) => {
      const state = speakerLineState(item.index, activeIndex);
      const style = SPEAKER_LINE_STYLES[state];
      return {
        id: item.cue.id,
        index: item.index,
        state,
        role: item.cue.role,
        label: item.cue.label,
        theme: roleTheme(item.cue.role),
        lines: item.displayLines,
        top: item.top,
        height: item.height,
        opacity: style.opacity,
        fontWeight: style.fontWeight,
      };
    });

  const current = lines[activeIndex];
  return {
    rect,
    textWidth,
    fontSize: SPEAKER_BOARD.fontSize,
    lineHeightPx,
    scrollOffset,
    blocks,
    speaker: current
      ? {
          label: current.label || roleLabel(current.role),
          detail: speakerDetail(current.label || roleLabel(current.role), current.agentName),
          theme: roleTheme(current.role),
        }
      : null,
    empty: lines.length === 0,
  };
};

export type JudgeBoard = {
  active: boolean;
  winner: { role: string; label: string; theme: RoleTheme } | null;
  lines: string[];
  empty: boolean;
};

const buildJudgeBoard = (scene: DebateScene, activeRole: string | null, activeKind: string | null): JudgeBoard => {
  const maxWidth = (SCENE_LAYOUT.judge.width - JUDGE_BOARD.paddingX * 2) / JUDGE_BOARD.fontSize;
  const text = scene.judgeItems.map((item) => item.text).join(" ");
  return {
    active: activeRole === "judge" || activeKind === "judge_summary",
    winner: scene.winner
      ? { role: scene.winner, label: roleTheme(scene.winner).label, theme: roleTheme(scene.winner) }
      : null,
    lines: wrapTextLinesClamped(text, maxWidth, JUDGE_BOARD.maxLines),
    empty: !text.trim(),
  };
};

export type ScoreSide = {
  role: string;
  label: string;
  theme: RoleTheme;
  score: number | null;
};

export type ScoreRow = {
  key: string;
  label: string;
  leftScore: number | null;
  rightScore: number | null;
};

export type ScoreBoard =
  | { kind: "empty" }
  | {
      kind: "versus";
      left: ScoreSide;
      right: ScoreSide;
      /** Share of the split bar taken by the left side, 0 to 1. */
      leftShare: number;
      rows: ScoreRow[];
      comment: { label: string; theme: RoleTheme; lines: string[] } | null;
      active: boolean;
    }
  | {
      kind: "stack";
      cards: Array<{
        role: string;
        label: string;
        theme: RoleTheme;
        score: number | null;
        rows: Array<{ key: string; label: string; score: number | null }>;
        commentLines: string[];
      }>;
      active: boolean;
    };

const toSide = (item: ScoreItem): ScoreSide => ({
  role: item.role,
  label: item.label || roleTheme(item.role).label,
  theme: roleTheme(item.role),
  score: item.comprehensiveScore,
});

const dimensionScore = (item: ScoreItem | undefined, key: string): number | null =>
  item?.dimensions.find((dimension) => dimension.key === key)?.score ?? null;

const buildScoreBoard = (
  scene: DebateScene,
  activeRole: string | null,
  activeKind: string | null,
): ScoreBoard => {
  const items = scene.scoreItems;
  const active = activeKind === "score_comment";
  if (items.length === 0) {
    return { kind: "empty" };
  }

  const commentWidth = (SCENE_LAYOUT.score.width - SCORE_BOARD.paddingX * 2) / SCORE_BOARD.commentFontSize;

  if (items.length === 2) {
    const left = items.find((item) => item.role === "proposer") ?? items[0];
    const right = items.find((item) => item !== left) ?? items[1];
    const rows = SCORE_KEYS.map((key) => ({
      key,
      label: DIMENSION_SHORT_LABELS[key] ?? DIMENSION_LABELS[key] ?? key,
      leftScore: dimensionScore(left, key),
      rightScore: dimensionScore(right, key),
    }))
      .filter((row) => row.leftScore !== null || row.rightScore !== null)
      .slice(0, SCORE_BOARD.maxRows);
    const leftValue = Math.max(0, left.comprehensiveScore ?? 0);
    const rightValue = Math.max(0, right.comprehensiveScore ?? 0);
    const total = leftValue + rightValue;
    const commentSource = active ? items.find((item) => item.role === activeRole) : undefined;
    return {
      kind: "versus",
      left: toSide(left),
      right: toSide(right),
      leftShare: total > 0 ? leftValue / total : 0.5,
      rows,
      comment: commentSource?.overallComment
        ? {
            label: commentSource.label || roleTheme(commentSource.role).label,
            theme: roleTheme(commentSource.role),
            lines: wrapTextLinesClamped(commentSource.overallComment, commentWidth, SCORE_BOARD.commentMaxLines),
          }
        : null,
      active,
    };
  }

  return {
    kind: "stack",
    active,
    cards: items.slice(0, 2).map((item) => ({
      role: item.role,
      label: item.label || roleTheme(item.role).label,
      theme: roleTheme(item.role),
      score: item.comprehensiveScore,
      rows: item.dimensions
        .filter((dimension) => dimension.score !== null)
        .slice(0, SCORE_BOARD.maxRows)
        .map((dimension) => ({
          key: dimension.key,
          label: DIMENSION_SHORT_LABELS[dimension.key] ?? dimension.label,
          score: dimension.score,
        })),
      commentLines: wrapTextLinesClamped(item.overallComment, commentWidth, SCORE_BOARD.commentMaxLines),
    })),
  };
};

export type SceneViewModel = {
  layout: typeof SCENE_LAYOUT;
  colors: typeof SCENE_COLORS;
  activeSegmentId: string | null;
  activeSegmentKind: string | null;
  activeRole: string | null;
  activeLineIndex: number;
  speaker: SpeakerBoard;
  judge: JudgeBoard;
  score: ScoreBoard;
  /** Flat view kept for regression tests: no speech text may be dropped. */
  speakerLines: Array<{
    cue: LineCue;
    displayText: string;
    displayLines: string[];
    index: number;
    state: SpeakerLineState;
  }>;
};

export const buildSceneViewModel = (scene: DebateScene, frame: number): SceneViewModel => {
  const activeLineIndex = activeLineIndexAtFrame(scene.speakerLines, frame);
  const activeSegment = scene.segmentCues.find((cue) => frame >= cue.startFrame && frame < cue.endFrame);
  const activeRole = activeSegment?.role ?? null;
  const activeKind = activeSegment?.kind ?? null;
  const speaker = buildSpeakerBoard(scene.speakerLines, activeLineIndex, frame);

  return {
    layout: SCENE_LAYOUT,
    colors: SCENE_COLORS,
    activeSegmentId: activeSegment?.id ?? null,
    activeSegmentKind: activeKind,
    activeRole,
    activeLineIndex,
    speaker,
    judge: buildJudgeBoard(scene, activeRole, activeKind),
    score: buildScoreBoard(scene, activeRole, activeKind),
    speakerLines: speaker.blocks.map((block) => ({
      cue: scene.speakerLines[block.index],
      displayText: block.lines.join("\n"),
      displayLines: block.lines,
      index: block.index,
      state: block.state,
    })),
  };
};

export type TimelineModel = {
  totalFrames: number;
  fps: number;
  intro: { startFrame: number; endFrame: number };
  scenes: Array<{ startFrame: number; endFrame: number }>;
  outro: { startFrame: number; endFrame: number };
};

export const buildTimelineModel = (video: DebateVideoModel): TimelineModel => {
  let cursor = video.introFrames;
  const intro = { startFrame: 0, endFrame: cursor };
  const scenes = video.scenes.map((scene) => {
    const startFrame = cursor;
    cursor += scene.durationInFrames;
    return { startFrame, endFrame: cursor };
  });
  const outro = { startFrame: cursor, endFrame: cursor + video.outroFrames };
  return { totalFrames: outro.endFrame, fps: video.fps, intro, scenes, outro };
};

export type FooterModel = {
  progress: number;
  elapsed: string;
  total: string;
  /** Round boundaries as 0..1 positions along the track. */
  ticks: number[];
};

export const buildFooterModel = (
  video: DebateVideoModel,
  sceneIndex: number,
  frame: number,
): FooterModel => {
  const timeline = buildTimelineModel(video);
  const scene = timeline.scenes[sceneIndex];
  const globalFrame = (scene?.startFrame ?? 0) + Math.max(0, frame);
  const clamped = Math.max(0, Math.min(timeline.totalFrames, globalFrame));
  return {
    progress: timeline.totalFrames > 0 ? clamped / timeline.totalFrames : 0,
    elapsed: formatClock(clamped, timeline.fps),
    total: formatClock(timeline.totalFrames, timeline.fps),
    ticks: timeline.scenes
      .slice(1)
      .map((item) => item.startFrame / timeline.totalFrames),
  };
};

export type RoundStepper = {
  kind: "pills" | "bar";
  total: number;
  index: number;
  label: string;
};

export const buildRoundStepper = (total: number, index: number): RoundStepper => ({
  kind: total <= 12 ? "pills" : "bar",
  total,
  index,
  label: `第 ${index + 1} / ${total} 轮`,
});

export type HeaderModel = {
  kicker: string;
  topic: string;
  turnLabel: string;
  timelineLabel: string;
  stepper: RoundStepper;
};

export const HEADER_TYPE = {
  kickerFontSize: 17,
  kickerLetterSpacing: 5,
  topicFontSize: 36,
  metaFontSize: 19,
  pillWidth: 30,
  pillActiveWidth: 52,
  pillHeight: 6,
  pillGap: 8,
  barWidth: 260,
} as const;

export const buildHeaderModel = (
  video: DebateVideoModel,
  scene: DebateScene,
  sceneIndex: number,
): HeaderModel => {
  const stepper = buildRoundStepper(video.scenes.length, sceneIndex);
  const reserved = stepper.kind === "pills"
    ? stepper.total * (HEADER_TYPE.pillWidth + HEADER_TYPE.pillGap) + HEADER_TYPE.pillActiveWidth
    : HEADER_TYPE.barWidth + 40;
  const topicWidth = (SCENE_LAYOUT.header.width - reserved - 80) / HEADER_TYPE.topicFontSize;
  return {
    kicker: "ELENCHUS · 辩论复盘",
    topic: fitTextLine(video.topic, topicWidth),
    turnLabel: scene.turnLabel,
    timelineLabel: video.timelineKind === "estimated" ? "预估时间轴" : "真实音频时间轴",
    stepper,
  };
};

export type BookendSide = {
  role: string;
  label: string;
  theme: RoleTheme;
  detail: string;
};

export type IntroModel = {
  kicker: string;
  topicLines: string[];
  sides: BookendSide[];
  meta: string;
};

const bookendTopicLines = (
  topic: string,
  fontSize: number,
  maxLines: number,
  width: number,
): string[] => {
  const lines = wrapTextLinesClamped(topic, width / fontSize, maxLines);
  return lines.length ? lines : ["未命名辩题"];
};

const participantSides = (video: DebateVideoModel): BookendSide[] => {
  const roles = video.participants.length ? video.participants : ["proposer", "opposer"];
  return roles.slice(0, 2).map((role, index) => {
    const theme = roleTheme(role);
    return { role, label: theme.label, theme, detail: index === 0 ? "立论方" : "驳论方" };
  });
};

export const buildIntroModel = (video: DebateVideoModel): IntroModel => {
  const minutes = Math.max(1, Math.round(video.durationInFrames / video.fps / 60));
  return {
    kicker: "ELENCHUS · 视频辩论记录",
    topicLines: bookendTopicLines(
      video.topic,
      INTRO_LAYOUT.topicFontSize,
      INTRO_LAYOUT.topicMaxLines,
      SCENE_LAYOUT.width - 320,
    ),
    sides: participantSides(video),
    meta: [
      `${video.scenes.length} 轮辩论`,
      `约 ${minutes} 分钟`,
      video.timelineKind === "estimated" ? "预估时间轴" : "真实音频时间轴",
    ].join("  ·  "),
  };
};

export type OutroModel = {
  kicker: string;
  topicLines: string[];
  sides: Array<BookendSide & { average: number | null; wins: number }>;
  meta: string;
};

export const buildOutroModel = (video: DebateVideoModel): OutroModel => {
  const totals = new Map<string, { sum: number; count: number; wins: number }>();
  const ensure = (role: string) => {
    const current = totals.get(role) ?? { sum: 0, count: 0, wins: 0 };
    totals.set(role, current);
    return current;
  };
  for (const scene of video.scenes) {
    for (const item of scene.scoreItems) {
      if (typeof item.comprehensiveScore === "number") {
        const bucket = ensure(item.role);
        bucket.sum += item.comprehensiveScore;
        bucket.count += 1;
      }
    }
    if (scene.winner) {
      ensure(scene.winner).wins += 1;
    }
  }

  const sides = participantSides(video).map((side) => {
    const bucket = totals.get(side.role);
    return {
      ...side,
      average: bucket && bucket.count ? Number((bucket.sum / bucket.count).toFixed(1)) : null,
      wins: bucket?.wins ?? 0,
    };
  });

  return {
    kicker: "复盘结束",
    topicLines: bookendTopicLines(
      video.topic,
      OUTRO_LAYOUT.topicFontSize,
      OUTRO_LAYOUT.topicMaxLines,
      SCENE_LAYOUT.width - 320,
    ),
    sides,
    meta: `共 ${video.scenes.length} 轮辩论 · 感谢观看`,
  };
};
