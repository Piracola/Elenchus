import type { DebateScene, LineCue, ScoreItem } from "./types";

export const VIDEO_FONT_FAMILY = '"Noto Sans Hans"';

export const SCENE_COLORS = {
  background: "#f5f7f8",
  ink: "#1f2933",
  muted: "#6b7280",
  faint: "#d8dee5",
  panel: "#ffffff",
  panelSoft: "#eef3f4",
  affirmative: "#2f7d68",
  affirmativeSoft: "#e5f2ee",
  negative: "#a04a5b",
  negativeSoft: "#f7e8eb",
  judge: "#8a6a2f",
  judgeSoft: "#f4eddd",
  score: "#405f8f",
  scoreSoft: "#e8eef8",
} as const;

export const SCENE_LAYOUT = {
  width: 1920,
  height: 1080,
  header: { x: 72, y: 42, width: 1776, height: 104 },
  speaker: { x: 72, y: 170, width: 1400, height: 830 },
  judge: { x: 1500, y: 170, width: 348, height: 382 },
  score: { x: 1500, y: 582, width: 348, height: 418 },
} as const;

export type SpeakerLineState = "active" | "past" | "future";

const visualTextWidth = (text: string): number =>
  Array.from(text).reduce((width, char) => width + (/^[\u0000-\u00ff]$/u.test(char) ? 0.56 : 1), 0);

export const fitTextLine = (value: unknown, maxWidth: number): string => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text || visualTextWidth(text) <= maxWidth) return text;
  let result = "";
  for (const char of text) {
    if (visualTextWidth(`${result}${char}…`) > maxWidth) break;
    result += char;
  }
  return `${result.trimEnd()}…`;
};

export const wrapTextLinesToWidth = (value: unknown, maxWidth: number): string[] => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return [];
  const lines: string[] = [];
  let current = "";
  for (const char of text) {
    if (current && visualTextWidth(`${current}${char}`) > maxWidth) {
      lines.push(current.trimEnd());
      current = char.trimStart();
    } else {
      current += char;
    }
  }
  if (current) lines.push(current.trimEnd());
  return lines;
};

export const SPEAKER_LINE_STYLES = {
  active: {
    headerHeight: 20,
    headerMargin: 6,
    fontSize: 38,
    lineHeight: 1.45,
    marginBottom: 26,
    opacity: 1,
    fontWeight: 820,
  },
  past: {
    headerHeight: 14,
    headerMargin: 4,
    fontSize: 21,
    lineHeight: 1.45,
    marginBottom: 14,
    opacity: 0.45,
    fontWeight: 600,
  },
  future: {
    headerHeight: 14,
    headerMargin: 4,
    fontSize: 19,
    lineHeight: 1.45,
    marginBottom: 12,
    opacity: 0.22,
    fontWeight: 520,
  },
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
  index === activeIndex ? "active" : index < activeIndex ? "past" : "future";

export const computeSpeakerLayout = (lines: LineCue[], activeIndex: number) => {
  const items: Array<{ top: number; textCenter: number; state: SpeakerLineState }> = [];
  let top = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const state = speakerLineState(index, activeIndex);
    const style = SPEAKER_LINE_STYLES[state];
    const textTop = top + style.headerHeight + style.headerMargin;
    const textCenter = textTop + (style.fontSize * style.lineHeight) / 2;
    items.push({ top, textCenter, state });
    top += style.headerHeight + style.headerMargin + style.fontSize * style.lineHeight + style.marginBottom;
  }
  return { items, totalHeight: top };
};

export const buildSceneSlices = (lines: LineCue[], durationInFrames: number) => {
  if (durationInFrames <= 0) {
    return [];
  }
  if (lines.length === 0) {
    return [{ activeIndex: -1, startFrame: 0, endFrame: durationInFrames }];
  }
  const segmentStarts = lines.reduce<Array<{ activeIndex: number; startFrame: number; segmentKey: string }>>(
    (items, line, index) => {
      const segmentKey = line.segmentId || line.id;
      if (items.at(-1)?.segmentKey !== segmentKey) {
        items.push({ activeIndex: index, startFrame: line.startFrame, segmentKey });
      }
      return items;
    },
    [],
  );
  return segmentStarts.map((segment, index) => ({
    activeIndex: segment.activeIndex,
    startFrame: index === 0 ? 0 : Math.max(0, segment.startFrame),
    endFrame:
      index === segmentStarts.length - 1
        ? durationInFrames
        : Math.max(segment.startFrame + 1, Math.min(durationInFrames, segmentStarts[index + 1].startFrame)),
  }));
};

export const layoutTextLines = (value: unknown, maxChars: number, maxLines: number): string[] => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return [];
  const result: string[] = [];
  let current = "";
  for (const char of text) {
    current += char;
    const boundary = /[。！？；!?;]/.test(char);
    if (current.length >= maxChars || (boundary && current.length >= Math.floor(maxChars * 0.55))) {
      result.push(current);
      current = "";
    }
  }
  if (current) result.push(current);
  if (result.length <= maxLines) return result;
  const visible = result.slice(0, maxLines);
  const last = visible[maxLines - 1];
  visible[maxLines - 1] = `${last.slice(0, Math.max(1, last.length - 1))}…`;
  return visible;
};

export type SceneViewModel = {
  layout: typeof SCENE_LAYOUT;
  colors: typeof SCENE_COLORS;
  activeSegmentId: string | null;
  activeSegmentKind: string | null;
  activeRole: string | null;
  activeLineIndex: number;
  speakerLines: Array<{
    cue: LineCue;
    displayText: string;
    displayLines: string[];
    index: number;
    state: SpeakerLineState;
    style: (typeof SPEAKER_LINE_STYLES)[SpeakerLineState];
  }>;
  judgeLines: string[];
  scoreCards: Array<ScoreItem & { commentLines: string[]; displayDimensions: ScoreItem["dimensions"] }>;
};

export const buildSceneViewModel = (scene: DebateScene, frame: number): SceneViewModel => {
  const activeLineIndex = activeLineIndexAtFrame(scene.speakerLines, frame);
  const activeSegment = scene.segmentCues.find((cue) => frame >= cue.startFrame && frame < cue.endFrame);
  const firstIndex = Math.max(0, activeLineIndex - 4);
  const lastIndex = Math.min(scene.speakerLines.length, activeLineIndex + 7);
  const speakerLines = scene.speakerLines.slice(firstIndex, lastIndex).map((cue, offset) => {
    const index = firstIndex + offset;
    const state = speakerLineState(index, activeLineIndex);
    const style = SPEAKER_LINE_STYLES[state];
    const availablePixels = SCENE_LAYOUT.speaker.width - 98;
    const maxVisualWidth = availablePixels / style.fontSize;
    const displayLines = wrapTextLinesToWidth(cue.text, maxVisualWidth);
    return { cue, displayText: displayLines.join("\n"), displayLines, index, state, style };
  });
  const winnerLabel = scene.winner === "proposer" ? "正方" : scene.winner === "opposer" ? "反方" : scene.winner;
  return {
    layout: SCENE_LAYOUT,
    colors: SCENE_COLORS,
    activeSegmentId: activeSegment?.id ?? null,
    activeSegmentKind: activeSegment?.kind ?? null,
    activeRole: activeSegment?.role ?? null,
    activeLineIndex,
    speakerLines,
    judgeLines: layoutTextLines(
      [winnerLabel ? `胜方：${winnerLabel}。` : "", ...scene.judgeItems.map((item) => item.text)].filter(Boolean).join(" "),
      13,
      8,
    ),
    scoreCards: scene.scoreItems.slice(0, 2).map((score) => ({
      ...score,
      commentLines: layoutTextLines(score.overallComment, 21, 4),
      displayDimensions: score.dimensions.slice(0, 3),
    })),
  };
};
