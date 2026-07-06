import {
  AudioManifest,
  DebateScene,
  DebateVideoInputProps,
  DebateVideoModel,
  ElenchusEntry,
  ElenchusExport,
  FPS,
  LineCue,
  ScoreBlock,
  ScoreItem,
  TextItem,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
} from "./types";

const NON_SPEAKER_ROLES = new Set([
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

const ROLE_LABELS: Record<string, string> = {
  proposer: "正方",
  opposer: "反方",
  judge: "裁判",
  group_discussion: "组内讨论",
  consensus_summary: "共识总结",
  fact_checker: "事实核查",
  audience: "观众",
  system: "系统",
};

const DIMENSION_LABELS: Record<string, string> = {
  logical_rigor: "逻辑严密度",
  evidence_quality: "证据质量",
  topic_focus: "切题度与定义稳定",
  rebuttal_strength: "反驳力度",
  consistency: "前后一致性",
  persuasiveness: "价值立意与说服力",
};

const DIMENSION_WEIGHTS: Record<string, number> = {
  logical_rigor: 20,
  evidence_quality: 15,
  topic_focus: 15,
  rebuttal_strength: 20,
  consistency: 15,
  persuasiveness: 15,
};

const SCORE_KEYS = Object.keys(DIMENSION_LABELS);

export const roleLabel = (role: string): string => ROLE_LABELS[role] ?? role;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const charCount = (text: string): number => text.replace(/\s+/g, "").length;

const MIN_LINE_FRAMES = Math.ceil(1.8 * FPS);
const PRE_ROLL_FRAMES = Math.ceil(1.2 * FPS);
const POST_ROLL_FRAMES = Math.ceil(1.2 * FPS);
const MS_PER_CHAR = 150;
const MS_PER_SENTENCE_PAUSE = 400;
const MS_PER_CLAUSE_PAUSE = 180;
const MAX_LINE_CHARS = 28;

const countPunctuation = (text: string, pattern: RegExp): number => {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
};

const splitLongClause = (clause: string, maxChars: number): string[] => {
  if (clause.length <= maxChars) {
    return [clause];
  }
  const chunks: string[] = [];
  for (let i = 0; i < clause.length; i += maxChars) {
    chunks.push(clause.slice(i, i + maxChars));
  }
  return chunks;
};

export const segmentTextToLines = (text: string, maxChars = MAX_LINE_CHARS): string[] => {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  // Split by sentence-ending punctuation / newline, keeping delimiters.
  const sentenceParts = trimmed.split(/([。！？；\n]+)/).filter(Boolean);
  const sentences: string[] = [];
  let buffer = "";
  for (const part of sentenceParts) {
    buffer += part;
    if (/[。！？；\n]/.test(part)) {
      sentences.push(buffer);
      buffer = "";
    }
  }
  if (buffer) {
    sentences.push(buffer);
  }

  const lines: string[] = [];
  for (const sentence of sentences) {
    const trimmedSentence = sentence.replace(/\s+/g, "");
    if (!trimmedSentence) {
      continue;
    }
    if (trimmedSentence.length <= maxChars) {
      lines.push(trimmedSentence);
      continue;
    }
    // Split by clause punctuation and greedily pack clauses into lines.
    const clauseParts = trimmedSentence.split(/([，、：])/).filter(Boolean);
    let currentLine = "";
    for (const part of clauseParts) {
      if (/[，、：]/.test(part)) {
        currentLine += part;
        continue;
      }
      const subClauses = splitLongClause(part, maxChars);
      for (const sub of subClauses) {
        const trimmedSub = sub.replace(/\s+/g, "");
        if (!trimmedSub) {
          continue;
        }
        if (!currentLine) {
          currentLine = trimmedSub;
          continue;
        }
        if (currentLine.length + trimmedSub.length <= maxChars) {
          currentLine += trimmedSub;
        } else {
          lines.push(currentLine);
          currentLine = trimmedSub;
        }
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines;
};

const estimateLineDurationFrames = (text: string): number => {
  const chars = charCount(text);
  const sentencePauses = countPunctuation(text, /[。！？；]/g);
  const clausePauses = countPunctuation(text, /[，、：]/g);
  const ms = Math.max(
    chars * MS_PER_CHAR + sentencePauses * MS_PER_SENTENCE_PAUSE + clausePauses * MS_PER_CLAUSE_PAUSE,
    (MIN_LINE_FRAMES / FPS) * 1000,
  );
  return Math.ceil((ms / 1000) * FPS);
};

const buildSpeakerLines = (
  speakerItems: TextItem[],
  lineTimings?: Array<{ startFrame: number; endFrame: number }>,
): LineCue[] => {
  const lines: LineCue[] = [];
  speakerItems.forEach((item, itemIndex) => {
    const textLines = segmentTextToLines(item.text);
    textLines.forEach((lineText, lineIndex) => {
      const timing = lineTimings?.[lines.length];
      lines.push({
        id: `${item.id}-line-${lineIndex}`,
        role: item.role,
        label: item.label,
        agentName: item.agentName,
        text: lineText,
        charCount: charCount(lineText),
        startFrame: timing?.startFrame ?? 0,
        endFrame: timing?.endFrame ?? 0,
      });
    });
  });
  return lines;
};

const distributeFramesByWeight = (
  totalFrames: number,
  weights: number[],
): Array<{ startFrame: number; endFrame: number }> => {
  if (weights.length === 0 || totalFrames <= 0) {
    return [];
  }
  const safeWeights = weights.map((w) => Math.max(0, w));
  const totalWeight = safeWeights.reduce((sum, w) => sum + w, 0);
  if (totalWeight <= 0) {
    const per = Math.max(0, Math.floor(totalFrames / weights.length));
    return weights.map((_, i) => ({
      startFrame: i * per,
      endFrame: i === weights.length - 1 ? totalFrames : (i + 1) * per,
    }));
  }

  const raw = safeWeights.map((w) => (w / totalWeight) * totalFrames);
  const allocated: number[] = [];
  let remainder = 0;
  for (const value of raw) {
    const floor = Math.floor(value + remainder);
    allocated.push(Math.max(MIN_LINE_FRAMES, floor));
    remainder = value + remainder - floor;
  }

  // Adjust if rounding pushed us over/under totalFrames.
  let current = 0;
  const result: Array<{ startFrame: number; endFrame: number }> = [];
  for (let i = 0; i < allocated.length; i++) {
    const end = i === allocated.length - 1 ? totalFrames : Math.min(totalFrames, current + allocated[i]);
    result.push({ startFrame: current, endFrame: end });
    current = end;
  }
  return result;
};

export const stripThinking = (value: unknown): string => {
  let text = String(value ?? "");
  while (/^\s*<think\b[^>]*>/i.test(text)) {
    const close = text.search(/<\/think\s*>/i);
    if (close < 0) {
      return text;
    }
    text = text.slice(close).replace(/^<\/think\s*>\s*/i, "");
  }
  return text;
};

export const markdownToReadableText = (value: unknown): string => {
  const text = stripThinking(value);
  return text
    .replace(/^```[a-zA-Z0-9_-]*\s*$/gm, "")
    .replace(/^~~~[a-zA-Z0-9_-]*\s*$/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "· ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const entryTurnIndex = (entry: ElenchusEntry, fallback: number): number => {
  return typeof entry.turn === "number" && entry.turn >= 0 ? entry.turn : fallback;
};

const toTextItem = (entry: ElenchusEntry, index: number): TextItem => {
  const role = String(entry.role ?? "unknown");
  const text = markdownToReadableText(entry.content);
  return {
    id: `${role}-${entry.turn ?? "x"}-${index}`,
    role,
    label: roleLabel(role),
    agentName: String(entry.agent_name ?? "").trim() || roleLabel(role),
    text: text || "（无内容）",
    charCount: charCount(text),
  };
};

const resolveComprehensiveScore = (scores: ScoreBlock): number | null => {
  if (typeof scores.comprehensive_score === "number") {
    return Number(scores.comprehensive_score.toFixed(1));
  }

  let weightedSum = 0;
  let totalWeight = 0;
  for (const key of SCORE_KEYS) {
    const value = scores[key as keyof ScoreBlock];
    if (typeof value === "object" && value && "score" in value && typeof value.score === "number") {
      const weight = DIMENSION_WEIGHTS[key] ?? 1;
      weightedSum += value.score * weight;
      totalWeight += weight;
    }
  }

  if (!totalWeight) {
    return null;
  }
  return Number((weightedSum / totalWeight).toFixed(1));
};

const toScoreItem = (role: string, scores: ScoreBlock): ScoreItem => {
  return {
    role,
    label: roleLabel(role),
    comprehensiveScore: resolveComprehensiveScore(scores),
    overallComment: markdownToReadableText(scores.overall_comment ?? ""),
    dimensions: SCORE_KEYS.map((key) => {
      const value = scores[key as keyof ScoreBlock];
      const dimension = typeof value === "object" && value ? value : {};
      return {
        key,
        label: DIMENSION_LABELS[key],
        score: typeof dimension.score === "number" ? dimension.score : null,
        rationale: markdownToReadableText(dimension.rationale ?? ""),
      };
    }),
  };
};

const buildParticipants = (raw: ElenchusExport): string[] => {
  const fromExport = Array.isArray(raw.participants) ? raw.participants.filter(Boolean) : [];
  const speakers = fromExport.filter((role) => !NON_SPEAKER_ROLES.has(role));
  if (speakers.length >= 2) {
    return speakers;
  }
  return ["proposer", "opposer"];
};

const collectScoresForTurn = (
  entries: Array<{ entry: ElenchusEntry; index: number }>,
  raw: ElenchusExport,
  turnIndex: number,
  isLastScene: boolean,
): ScoreItem[] => {
  const scoreItems: ScoreItem[] = [];
  const seen = new Set<string>();

  for (const { entry } of entries) {
    if (entry.role !== "judge" || !entry.scores) {
      continue;
    }
    const targetRole = String(entry.target_role ?? "");
    if (!targetRole || seen.has(targetRole)) {
      continue;
    }
    scoreItems.push(toScoreItem(targetRole, entry.scores));
    seen.add(targetRole);
  }

  if (scoreItems.length || !isLastScene || !raw.current_scores) {
    return scoreItems;
  }

  for (const [role, scores] of Object.entries(raw.current_scores)) {
    if (!scores || seen.has(role)) {
      continue;
    }
    scoreItems.push(toScoreItem(role, scores));
  }

  return scoreItems;
};

const sceneDurationFallback = (lineFrames: number[]): number => {
  const contentFrames = lineFrames.reduce((sum, frames) => sum + frames, 0);
  return Math.max(PRE_ROLL_FRAMES + POST_ROLL_FRAMES + contentFrames, 5 * FPS);
};

export const buildVideoModel = (
  raw: ElenchusExport,
  props: Partial<DebateVideoInputProps> = {},
  audioManifest?: AudioManifest,
): DebateVideoModel => {
  const participants = buildParticipants(raw);
  const history = Array.isArray(raw.dialogue_history) ? raw.dialogue_history : [];
  const grouped = new Map<number, Array<{ entry: ElenchusEntry; index: number }>>();

  history.forEach((entry, index) => {
    const turnIndex = entryTurnIndex(entry, 0);
    const items = grouped.get(turnIndex) ?? [];
    items.push({ entry, index });
    grouped.set(turnIndex, items);
  });

  const orderedTurns = Array.from(grouped.keys()).sort((a, b) => a - b);
  const manifestScenes = new Map(audioManifest?.scenes.map((s) => [s.id, s]) ?? []);

  const scenes: DebateScene[] = orderedTurns.map((turnIndex, sceneIndex) => {
    const entries = grouped.get(turnIndex) ?? [];
    const speakerItems = entries
      .filter(({ entry }) => {
        const role = String(entry.role ?? "");
        return participants.includes(role) || !NON_SPEAKER_ROLES.has(role);
      })
      .map(({ entry, index }) => toTextItem(entry, index));
    const judgeItems = entries
      .filter(({ entry }) => entry.role === "judge")
      .map(({ entry, index }) => toTextItem(entry, index));
    const contextItems = entries
      .filter(({ entry }) => ["group_discussion", "consensus_summary"].includes(String(entry.role ?? "")))
      .map(({ entry, index }) => toTextItem(entry, index));
    const scoreItems = collectScoresForTurn(entries, raw, turnIndex, sceneIndex === orderedTurns.length - 1);

    const id = `turn-${turnIndex + 1}`;
    const manifestScene = manifestScenes.get(id);

    const fallbackLineFrames = speakerItems.flatMap((item) =>
      segmentTextToLines(item.text).map((line) => estimateLineDurationFrames(line)),
    );

    let speakerLines: LineCue[];
    let durationInFrames: number;
    let audioFile: string | undefined;
    let audioDurationFrames: number | undefined;

    if (manifestScene) {
      audioFile = manifestScene.audioFile;
      audioDurationFrames = manifestScene.durationFrames;
      durationInFrames = manifestScene.durationFrames;
      const contentFrames = durationInFrames - PRE_ROLL_FRAMES - POST_ROLL_FRAMES;
      const timings =
        manifestScene.lineCues && manifestScene.lineCues.length > 0
          ? manifestScene.lineCues.map((cue) => ({
              startFrame: cue.startFrame,
              endFrame: cue.endFrame,
            }))
          : distributeFramesByWeight(Math.max(0, contentFrames), fallbackLineFrames);
      speakerLines = buildSpeakerLines(
        speakerItems,
        timings.map((t) => ({
          startFrame: t.startFrame + PRE_ROLL_FRAMES,
          endFrame: t.endFrame + PRE_ROLL_FRAMES,
        })),
      );
    } else {
      const totalFallbackFrames = sceneDurationFallback(fallbackLineFrames);
      durationInFrames = totalFallbackFrames;
      const contentFrames = totalFallbackFrames - PRE_ROLL_FRAMES - POST_ROLL_FRAMES;
      const timings = distributeFramesByWeight(Math.max(0, contentFrames), fallbackLineFrames);
      speakerLines = buildSpeakerLines(
        speakerItems,
        timings.map((t) => ({
          startFrame: t.startFrame + PRE_ROLL_FRAMES,
          endFrame: t.endFrame + PRE_ROLL_FRAMES,
        })),
      );
    }

    const totalChars =
      speakerItems.reduce((sum, item) => sum + item.charCount, 0) +
      judgeItems.reduce((sum, item) => sum + item.charCount, 0) +
      scoreItems.reduce(
        (sum, item) =>
          sum +
          charCount(item.overallComment) +
          item.dimensions.reduce((dimSum, dim) => dimSum + charCount(dim.rationale), 0),
        0,
      );

    return {
      id,
      turnIndex,
      turnLabel: `第 ${turnIndex + 1} 轮`,
      durationInFrames,
      speakerItems,
      judgeItems,
      contextItems,
      scoreItems,
      totalChars,
      speakerLines,
      audioFile,
      audioDurationFrames,
    };
  });

  const introFrames = 5 * FPS;
  const outroFrames = 5 * FPS;
  const scenesDuration = scenes.reduce((sum, scene) => sum + scene.durationInFrames, 0);

  return {
    topic: props.title?.trim() || raw.topic || "未命名辩题",
    participants,
    fps: FPS,
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    introFrames,
    outroFrames,
    durationInFrames: introFrames + scenesDuration + outroFrames,
    scenes,
  };
};
