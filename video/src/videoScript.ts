import {
  ElenchusEntry,
  ElenchusExport,
  FPS,
  LineCue,
  ScoreBlock,
  ScriptSegmentationOptions,
  ScriptSegmentationPreset,
  ScriptSegmentKind,
  SegmentCue,
  VideoScript,
  VideoScriptSegment,
  VideoScriptSpeech,
} from "./types";

export const VIDEO_SCRIPT_VERSION = "2026-07-09.segmented-script.v1";

export const NON_SPEAKER_ROLES = new Set([
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

export const ROLE_LABELS: Record<string, string> = {
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

const SCORE_KEYS = Object.keys(DIMENSION_LABELS);

const PRESET_OPTIONS: Record<ScriptSegmentationPreset, ScriptSegmentationOptions> = {
  standard: { mode: "standard", minChars: 80, targetChars: 200, maxChars: 260 },
  compact: { mode: "compact", minChars: 100, targetChars: 260, maxChars: 320 },
  detailed: { mode: "detailed", minChars: 60, targetChars: 140, maxChars: 190 },
};

const MIN_SEGMENT_FRAMES = Math.ceil(2.6 * FPS);
const MS_PER_CHAR = 145;
const MS_PER_SENTENCE_PAUSE = 380;
const MS_PER_CLAUSE_PAUSE = 150;
const MAX_LINE_CHARS = 28;

export const roleLabel = (role: string): string => ROLE_LABELS[role] ?? role;

export const charCount = (text: string): number => text.replace(/\s+/g, "").length;

export const resolveSegmentationOptions = (mode?: string): ScriptSegmentationOptions => {
  const key = String(mode || "standard") as ScriptSegmentationPreset;
  return PRESET_OPTIONS[key] ?? PRESET_OPTIONS.standard;
};

const splitByDelimiter = (text: string, delimiterPattern: RegExp): string[] => {
  const tokens = text.split(delimiterPattern).filter(Boolean);
  const parts: string[] = [];
  let buffer = "";

  for (const token of tokens) {
    buffer += token;
    if (delimiterPattern.test(token)) {
      parts.push(buffer.trim());
      buffer = "";
    }
  }
  if (buffer.trim()) {
    parts.push(buffer.trim());
  }
  return parts.filter(Boolean);
};

const splitHard = (text: string, maxChars: number): string[] => {
  const result: string[] = [];
  for (let index = 0; index < text.length; index += maxChars) {
    result.push(text.slice(index, index + maxChars));
  }
  return result;
};

const splitOversizedPart = (text: string, options: ScriptSegmentationOptions): string[] => {
  if (charCount(text) <= options.maxChars) {
    return [text];
  }

  const clauseParts = splitByDelimiter(text, /([，、：,:]+)/);
  const chunks: string[] = [];
  let current = "";

  for (const part of clauseParts) {
    if (charCount(part) > options.maxChars) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      chunks.push(...splitHard(part, options.maxChars));
      continue;
    }

    if (!current) {
      current = part;
      continue;
    }

    if (charCount(`${current}${part}`) <= options.maxChars) {
      current += part;
    } else {
      chunks.push(current);
      current = part;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
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

export const cleanTextForSpeech = (value: unknown): string =>
  markdownToReadableText(value)
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim();

export const cleanTextForTts = (value: unknown): string =>
  markdownToReadableText(value)
    .replace(/^\s*·\s+/gm, "")
    .replace(/\n{2,}/g, "\n")
    .replace(/\s+/g, " ")
    .trim();

export const segmentTextForVideo = (
  text: string,
  options: ScriptSegmentationOptions = PRESET_OPTIONS.standard,
): string[] => {
  const normalized = cleanTextForSpeech(text);
  if (!normalized) {
    return [];
  }

  const paragraphParts = normalized
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const sentenceParts = paragraphParts.flatMap((part) => splitByDelimiter(part, /([。！？；!?;]+)/));
  const atomicParts = sentenceParts.flatMap((part) => splitOversizedPart(part, options));
  const segments: string[] = [];
  let current = "";

  for (const rawPart of atomicParts) {
    const part = rawPart.trim();
    if (!part) {
      continue;
    }

    if (!current) {
      current = part;
      continue;
    }

    const currentChars = charCount(current);
    const candidate = `${current}${part}`;
    const candidateChars = charCount(candidate);
    const shouldMerge =
      candidateChars <= options.maxChars &&
      (currentChars < options.minChars || candidateChars <= options.targetChars);

    if (shouldMerge) {
      current = candidate;
    } else {
      segments.push(current);
      current = part;
    }
  }

  if (current) {
    segments.push(current);
  }

  return segments
    .flatMap((part) => splitOversizedPart(part, options))
    .map((part) => part.trim())
    .filter(Boolean);
};

const splitLongLine = (clause: string, maxChars: number): string[] => {
  if (clause.length <= maxChars) {
    return [clause];
  }
  return splitHard(clause, maxChars);
};

export const segmentTextToLines = (text: string, maxChars = MAX_LINE_CHARS): string[] => {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return [];
  }

  const sentences = splitByDelimiter(trimmed, /([。！？；!?;\n]+)/);
  const lines: string[] = [];

  for (const sentence of sentences) {
    const compact = sentence.replace(/\s+/g, "");
    if (!compact) {
      continue;
    }
    if (compact.length <= maxChars) {
      lines.push(compact);
      continue;
    }

    const clauses = splitByDelimiter(compact, /([，、：,:]+)/);
    let current = "";
    for (const clause of clauses) {
      for (const sub of splitLongLine(clause, maxChars)) {
        if (!current) {
          current = sub;
          continue;
        }
        if (current.length + sub.length <= maxChars) {
          current += sub;
        } else {
          lines.push(current);
          current = sub;
        }
      }
    }
    if (current) {
      lines.push(current);
    }
  }

  return lines;
};

const countPunctuation = (text: string, pattern: RegExp): number => {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
};

export const estimateSegmentDurationFrames = (text: string): number => {
  const chars = charCount(text);
  const sentencePauses = countPunctuation(text, /[。！？；!?;]/g);
  const clausePauses = countPunctuation(text, /[，、：,:]/g);
  const ms = Math.max(
    chars * MS_PER_CHAR + sentencePauses * MS_PER_SENTENCE_PAUSE + clausePauses * MS_PER_CLAUSE_PAUSE,
    (MIN_SEGMENT_FRAMES / FPS) * 1000,
  );
  return Math.ceil((ms / 1000) * FPS);
};

const hashString = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

export const distributeFramesByWeight = (
  totalFrames: number,
  weights: number[],
): Array<{ startFrame: number; endFrame: number }> => {
  if (weights.length === 0 || totalFrames <= 0) {
    return [];
  }

  const safeWeights = weights.map((weight) => Math.max(1, weight));
  const totalWeight = safeWeights.reduce((sum, weight) => sum + weight, 0);
  let cursor = 0;

  return safeWeights.map((weight, index) => {
    const remainingItems = safeWeights.length - index;
    const remainingFrames = totalFrames - cursor;
    const ideal = index === safeWeights.length - 1 ? remainingFrames : Math.round((weight / totalWeight) * totalFrames);
    const frameCount = Math.max(1, Math.min(remainingFrames - (remainingItems - 1), ideal));
    const startFrame = cursor;
    const endFrame = index === safeWeights.length - 1 ? totalFrames : cursor + frameCount;
    cursor = endFrame;
    return { startFrame, endFrame };
  });
};

const entryTurnIndex = (entry: ElenchusEntry, fallback: number): number =>
  typeof entry.turn === "number" && entry.turn >= 0 ? entry.turn : fallback;

export const groupEntriesByTurn = (
  history: ElenchusEntry[],
): Array<[number, Array<{ entry: ElenchusEntry; index: number }>]> => {
  const grouped = new Map<number, Array<{ entry: ElenchusEntry; index: number }>>();
  history.forEach((entry, index) => {
    const turnIndex = entryTurnIndex(entry, 0);
    const items = grouped.get(turnIndex) ?? [];
    items.push({ entry, index });
    grouped.set(turnIndex, items);
  });
  return Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);
};

export const buildParticipants = (raw: ElenchusExport): string[] => {
  const fromExport = Array.isArray(raw.participants) ? raw.participants.filter(Boolean) : [];
  const speakers = fromExport.filter((role) => !NON_SPEAKER_ROLES.has(role));
  return speakers.length >= 2 ? speakers : ["proposer", "opposer"];
};

const scoreValue = (scores?: ScoreBlock): number | null => {
  if (!scores) {
    return null;
  }
  if (typeof scores.comprehensive_score === "number") {
    return Number(scores.comprehensive_score.toFixed(1));
  }
  return null;
};

const roleKind = (role: string): ScriptSegmentKind => {
  if (role === "judge") {
    return "judge_summary";
  }
  if (role === "group_discussion" || role === "consensus_summary") {
    return "context";
  }
  return "argument";
};

const createSpeech = (
  entry: ElenchusEntry,
  sourceIndex: number,
  roundIndex: number,
  speechOrder: number,
  options: ScriptSegmentationOptions,
): VideoScriptSpeech | null => {
  const role = String(entry.role ?? "unknown");
  const kind = roleKind(role);
  const content = cleanTextForSpeech(entry.content);
  if (!content) {
    return null;
  }

  const speechId = `${role}-${roundIndex + 1}-${sourceIndex}`;
  const label = roleLabel(role);
  const agentName = String(entry.agent_name ?? "").trim() || label;
  const segmentTexts = segmentTextForVideo(content, options);
  const segments: VideoScriptSegment[] = segmentTexts.map((text, index) => ({
    id: `${speechId}-seg-${String(index + 1).padStart(3, "0")}`,
    roundIndex,
    speechId,
    role,
    label,
    agentName,
    text,
    lines: segmentTextToLines(text),
    charCount: charCount(text),
    order: index,
    kind,
  }));

  return {
    id: speechId,
    roundIndex,
    role,
    label,
    agentName,
    content,
    charCount: charCount(content),
    order: speechOrder,
    kind,
    segments,
  };
};

const createScoreSegments = (
  entries: Array<{ entry: ElenchusEntry; index: number }>,
  roundIndex: number,
  options: ScriptSegmentationOptions,
): VideoScriptSegment[] => {
  const result: VideoScriptSegment[] = [];

  for (const { entry, index } of entries) {
    if (entry.role !== "judge" || !entry.scores) {
      continue;
    }

    const targetRole = String(entry.target_role || "");
    const targetLabel = roleLabel(targetRole);
    const score = scoreValue(entry.scores);
    const parts = [
      score === null ? "" : `${targetLabel}综合评分 ${score} 分。`,
      cleanTextForSpeech(entry.scores.overall_comment),
    ].filter(Boolean);

    for (const key of SCORE_KEYS) {
      const dimension = entry.scores[key as keyof ScoreBlock];
      if (typeof dimension === "object" && dimension?.rationale) {
        parts.push(`${DIMENSION_LABELS[key]}：${cleanTextForSpeech(dimension.rationale)}`);
      }
    }

    const text = parts.join("\n");
    if (!text.trim()) {
      continue;
    }

    const speechId = `score-${targetRole || "unknown"}-${roundIndex + 1}-${index}`;
    segmentTextForVideo(text, options).forEach((segmentText, segmentIndex) => {
      result.push({
        id: `${speechId}-seg-${String(segmentIndex + 1).padStart(3, "0")}`,
        roundIndex,
        speechId,
        role: targetRole || "score",
        label: targetLabel || "评分",
        agentName: "裁判评分",
        text: segmentText,
        lines: segmentTextToLines(segmentText),
        charCount: charCount(segmentText),
        order: result.length,
        kind: "score_comment",
      });
    });
  }

  return result;
};

const detectWinner = (entries: Array<{ entry: ElenchusEntry }>): string | null => {
  const scored = entries
    .filter(({ entry }) => entry.role === "judge" && entry.scores && entry.target_role)
    .map(({ entry }) => ({ role: String(entry.target_role), score: scoreValue(entry.scores) }))
    .filter((item): item is { role: string; score: number } => typeof item.score === "number");
  if (scored.length < 2) {
    return null;
  }
  const sorted = scored.sort((a, b) => b.score - a.score);
  if (sorted[0].score === sorted[1].score) {
    return null;
  }
  return sorted[0].role;
};

export const buildVideoScript = (
  raw: ElenchusExport,
  optionsOrMode?: ScriptSegmentationPreset | ScriptSegmentationOptions | string,
): VideoScript => {
  const options =
    typeof optionsOrMode === "object" && optionsOrMode
      ? optionsOrMode
      : resolveSegmentationOptions(String(optionsOrMode || "standard"));
  const participants = buildParticipants(raw);
  const history = Array.isArray(raw.dialogue_history) ? raw.dialogue_history : [];
  const grouped = groupEntriesByTurn(history);

  const rounds = grouped.map(([roundIndex, entries]) => {
    const speeches = entries
      .map(({ entry, index }, order) => createSpeech(entry, index, roundIndex, order, options))
      .filter((speech): speech is VideoScriptSpeech => Boolean(speech));
    const speakerSegments = speeches
      .filter((speech) => participants.includes(speech.role) || !NON_SPEAKER_ROLES.has(speech.role))
      .flatMap((speech) => speech.segments);
    const judgeSegments = speeches.filter((speech) => speech.role === "judge").flatMap((speech) => speech.segments);
    const contextSegments = speeches
      .filter((speech) => ["group_discussion", "consensus_summary"].includes(speech.role))
      .flatMap((speech) => speech.segments);
    const scoreSegments = createScoreSegments(entries, roundIndex, options);
    const criteria = entries
      .filter(({ entry }) => entry.role === "judge" && entry.scores && entry.target_role)
      .map(({ entry }) => ({
        role: String(entry.target_role),
        label: roleLabel(String(entry.target_role)),
        score: scoreValue(entry.scores),
        comment: cleanTextForSpeech(entry.scores?.overall_comment),
      }));

    const totalChars = [...speakerSegments, ...judgeSegments, ...contextSegments, ...scoreSegments].reduce(
      (sum, segment) => sum + segment.charCount,
      0,
    );

    return {
      id: `turn-${roundIndex + 1}`,
      roundIndex,
      turnLabel: `第 ${roundIndex + 1} 轮`,
      speeches,
      speakerSegments,
      judgeSegments,
      contextSegments,
      scoreSegments,
      judge: {
        summary: judgeSegments.map((segment) => segment.text).join("\n"),
        criteria,
        winner: detectWinner(entries),
        scoreComments: scoreSegments,
      },
      totalChars,
    };
  });

  const scriptWithoutHash = {
    version: VIDEO_SCRIPT_VERSION,
    topic: raw.topic || "未命名辩题",
    participants,
    segmentation: options,
    rounds,
  };
  const scriptHash = hashString(
    JSON.stringify({
      version: scriptWithoutHash.version,
      topic: scriptWithoutHash.topic,
      participants: scriptWithoutHash.participants,
      segmentation: scriptWithoutHash.segmentation,
      rounds: scriptWithoutHash.rounds.map((round) => ({
        id: round.id,
        segments: [...round.speakerSegments, ...round.judgeSegments, ...round.contextSegments, ...round.scoreSegments].map(
          (segment) => ({
            id: segment.id,
            role: segment.role,
            kind: segment.kind,
            text: segment.text,
          }),
        ),
      })),
    }),
  );

  return { ...scriptWithoutHash, scriptHash };
};

export const segmentCuesToLineCues = (segments: SegmentCue[]): LineCue[] => {
  const cues: LineCue[] = [];

  for (const segment of segments) {
    const lines = segment.lines.length ? segment.lines : segmentTextToLines(segment.text);
    const weights = lines.map((line) => estimateSegmentDurationFrames(line));
    const timings = distributeFramesByWeight(Math.max(1, segment.endFrame - segment.startFrame), weights);

    lines.forEach((line, index) => {
      const timing = timings[index] ?? { startFrame: 0, endFrame: Math.max(1, segment.endFrame - segment.startFrame) };
      cues.push({
        id: `${segment.id}-line-${String(index + 1).padStart(2, "0")}`,
        segmentId: segment.id,
        speechId: segment.speechId,
        kind: segment.kind,
        role: segment.role,
        label: segment.label,
        agentName: segment.agentName,
        text: line,
        charCount: charCount(line),
        startFrame: segment.startFrame + timing.startFrame,
        endFrame: segment.startFrame + timing.endFrame,
      });
    });
  }

  return cues;
};
