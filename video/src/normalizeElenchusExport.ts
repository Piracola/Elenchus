import {
  AudioManifest,
  DebateScene,
  DebateVideoInputProps,
  DebateVideoModel,
  ElenchusExport,
  FPS,
  LineCue,
  ScoreBlock,
  ScoreItem,
  SegmentCue,
  TextItem,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
  VideoScript,
  VideoScriptSegment,
  VideoScriptSpeech,
} from "./types";
import {
  buildVideoScript,
  charCount,
  cleanTextForSpeech,
  DIMENSION_LABELS,
  distributeFramesByWeight,
  estimateSegmentDurationFrames,
  roleLabel,
  SCORE_KEYS,
  segmentCuesToLineCues,
} from "./videoScript";

const PRE_ROLL_FRAMES = Math.ceil(1.2 * FPS);
const POST_ROLL_FRAMES = Math.ceil(1.2 * FPS);

const DIMENSION_WEIGHTS: Record<string, number> = {
  logical_rigor: 20,
  evidence_quality: 15,
  topic_focus: 15,
  rebuttal_strength: 20,
  consistency: 15,
  persuasiveness: 15,
};

const toTextItem = (speech: VideoScriptSpeech): TextItem => ({
  id: speech.id,
  role: speech.role,
  label: speech.label,
  agentName: speech.agentName,
  text: speech.displayContent || cleanTextForSpeech(speech.content) || "（无内容）",
  charCount: speech.charCount,
});

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

  return totalWeight ? Number((weightedSum / totalWeight).toFixed(1)) : null;
};

const readableScoreText = (value: unknown): string => String(value ?? "").trim();

const toScoreItem = (role: string, scores: ScoreBlock): ScoreItem => ({
  role,
  label: roleLabel(role),
  comprehensiveScore: resolveComprehensiveScore(scores),
  overallComment: readableScoreText(scores.overall_comment),
  dimensions: SCORE_KEYS.map((key) => {
    const value = scores[key as keyof ScoreBlock];
    const dimension = typeof value === "object" && value ? value : {};
    return {
      key,
      label: DIMENSION_LABELS[key],
      score: typeof dimension.score === "number" ? dimension.score : null,
      rationale: readableScoreText(dimension.rationale),
    };
  }),
});

const collectScoresForTurn = (raw: ElenchusExport, turnIndex: number, isLastScene: boolean): ScoreItem[] => {
  const history = Array.isArray(raw.dialogue_history) ? raw.dialogue_history : [];
  const scoreItems: ScoreItem[] = [];
  const seen = new Set<string>();

  for (const entry of history) {
    if (entry.turn !== turnIndex || entry.role !== "judge" || !entry.scores) {
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

const durationFallback = (segmentFrames: number[]): number => {
  const contentFrames = segmentFrames.reduce((sum, frames) => sum + frames, 0);
  return Math.max(PRE_ROLL_FRAMES + POST_ROLL_FRAMES + contentFrames, 5 * FPS);
};

const timedSegmentsFromWeights = (segments: VideoScriptSegment[], contentFrames: number): SegmentCue[] => {
  const weights = segments.map((segment) => estimateSegmentDurationFrames(segment.text));
  const timings = distributeFramesByWeight(Math.max(0, contentFrames), weights);
  return segments.map((segment, index) => {
    const timing = timings[index] ?? { startFrame: 0, endFrame: 0 };
    return {
      ...segment,
      startFrame: timing.startFrame + PRE_ROLL_FRAMES,
      endFrame: timing.endFrame + PRE_ROLL_FRAMES,
    };
  });
};

const segmentCuesFromManifest = (
  round: VideoScript["rounds"][number],
  manifestScene: AudioManifest["scenes"][number],
): SegmentCue[] => {
  const allSegments = [
    ...round.speakerSegments,
    ...round.judgeSegments,
    ...round.contextSegments,
    ...round.scoreSegments,
  ];
  const byId = new Map(allSegments.map((segment) => [segment.id, segment]));
  const bounds = new Map<string, { startMs: number; endMs: number }>();
  for (const cue of manifestScene.cues || []) {
    const startMs = cue.startMs - manifestScene.startMs;
    const endMs = cue.endMs - manifestScene.startMs;
    const current = bounds.get(cue.segmentId);
    bounds.set(cue.segmentId, {
      startMs: current ? Math.min(current.startMs, startMs) : startMs,
      endMs: current ? Math.max(current.endMs, endMs) : endMs,
    });
  }
  return allSegments.flatMap((segment) => {
    const bound = bounds.get(segment.id);
    const source = byId.get(segment.id);
    if (!bound || !source) return [];
    const startFrame = Math.round((bound.startMs / 1000) * FPS);
    const endFrame = Math.max(Math.round((bound.endMs / 1000) * FPS), startFrame + 1);
    return [{ ...source, startMs: bound.startMs, endMs: bound.endMs, startFrame, endFrame }];
  });
};

const sceneFromScriptRound = (
  script: VideoScript,
  raw: ElenchusExport,
  roundIndex: number,
  sceneIndex: number,
  audioManifest?: AudioManifest,
): DebateScene => {
  const round = script.rounds[sceneIndex];
  const id = round.id;
  const manifestScene = audioManifest?.scenes.find((scene) => scene.id === id);
  const speakerItems = round.speeches
    .filter((speech) => round.speakerSegments.some((segment) => segment.speechId === speech.id))
    .map(toTextItem);
  const judgeItems = round.speeches
    .filter((speech) => round.judgeSegments.some((segment) => segment.speechId === speech.id))
    .map(toTextItem);
  const contextItems = round.speeches
    .filter((speech) => round.contextSegments.some((segment) => segment.speechId === speech.id))
    .map(toTextItem);
  const scoreItems = collectScoresForTurn(raw, roundIndex, sceneIndex === script.rounds.length - 1);
  const fallbackFrames = round.speakerSegments.map((segment) => estimateSegmentDurationFrames(segment.text));

  let durationInFrames: number;
  let speakerLines: LineCue[];
  let segmentCues: SegmentCue[];
  let audioFile: string | undefined;
  let audioDurationFrames: number | undefined;

  if (manifestScene) {
    durationInFrames = Math.max(1, Math.ceil((manifestScene.durationMs / 1000) * FPS));
    audioFile = manifestScene.audioFile;
    audioDurationFrames = durationInFrames;
    segmentCues = segmentCuesFromManifest(round, manifestScene);
    const speakerIds = new Set(round.speakerSegments.map((segment) => segment.id));
    speakerLines = segmentCuesToLineCues(segmentCues.filter((segment) => speakerIds.has(segment.id)));
  } else {
    durationInFrames = durationFallback(fallbackFrames);
    segmentCues = timedSegmentsFromWeights(round.speakerSegments, durationInFrames - PRE_ROLL_FRAMES - POST_ROLL_FRAMES);
    speakerLines = segmentCuesToLineCues(segmentCues);
  }

  return {
    id,
    turnIndex: roundIndex,
    turnLabel: round.turnLabel,
    durationInFrames,
    speakerItems,
    judgeItems,
    contextItems,
    scoreItems,
    winner: round.judge.winner,
    totalChars:
      round.totalChars ||
      [...round.speakerSegments, ...round.judgeSegments, ...round.contextSegments, ...round.scoreSegments].reduce(
        (sum, segment) => sum + segment.charCount,
        0,
      ),
    speakerLines,
    segmentCues,
    audioFile,
    audioDurationFrames,
  };
};

export const buildVideoModel = (
  raw: ElenchusExport,
  props: Partial<DebateVideoInputProps> = {},
  audioManifest?: AudioManifest,
  scriptInput?: VideoScript,
): DebateVideoModel => {
  const script = scriptInput ?? buildVideoScript(raw, props.textPreset || "standard");
  const matchedAudioManifest =
    audioManifest?.scriptHash && script.scriptHash && audioManifest.scriptHash !== script.scriptHash
      ? undefined
      : audioManifest;
  const scenes = script.rounds.map((round, sceneIndex) =>
    sceneFromScriptRound(script, raw, round.roundIndex, sceneIndex, matchedAudioManifest),
  );
  const introFrames = 5 * FPS;
  const outroFrames = 5 * FPS;
  const scenesDuration = scenes.reduce((sum, scene) => sum + scene.durationInFrames, 0);

  return {
    topic: props.title?.trim() || script.topic || raw.topic || "未命名辩题",
    participants: script.participants,
    fps: FPS,
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    introFrames,
    outroFrames,
    durationInFrames: introFrames + scenesDuration + outroFrames,
    timelineKind: matchedAudioManifest ? "audio" : "estimated",
    scenes,
  };
};

export { buildVideoScript, roleLabel, segmentTextToLines } from "./videoScript";
