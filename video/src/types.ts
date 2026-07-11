import { z } from "zod";
import type { TtsRole } from "./ttsPipeline";

export const FPS = 30;
export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;

export const DebateVideoInputSchema = z.object({
  dataFile: z.string().default("data/session-export.json"),
  scriptFile: z.string().optional(),
  sourceName: z.string().optional(),
  title: z.string().optional(),
  audioManifest: z.string().optional(),
  textPreset: z.string().optional(),
});

export type DebateVideoInputProps = z.infer<typeof DebateVideoInputSchema>;

export type ElenchusEntry = {
  role?: string;
  target_role?: string;
  agent_name?: string;
  content?: string;
  citations?: string[];
  timestamp?: string;
  turn?: number;
  scores?: ScoreBlock;
};

export type ElenchusExport = {
  topic?: string;
  participants?: string[];
  dialogue_history?: ElenchusEntry[];
  current_scores?: Record<string, ScoreBlock>;
};

export type ScoreDimension = {
  score?: number;
  rationale?: string;
};

export type ScoreBlock = {
  comprehensive_score?: number;
  overall_comment?: string;
  logical_rigor?: ScoreDimension;
  evidence_quality?: ScoreDimension;
  topic_focus?: ScoreDimension;
  rebuttal_strength?: ScoreDimension;
  consistency?: ScoreDimension;
  persuasiveness?: ScoreDimension;
  module_scores?: Record<string, number>;
};

export type TextItem = {
  id: string;
  role: string;
  label: string;
  agentName: string;
  text: string;
  charCount: number;
};

export type ScoreItem = {
  role: string;
  label: string;
  comprehensiveScore: number | null;
  overallComment: string;
  dimensions: Array<{
    key: string;
    label: string;
    score: number | null;
    rationale: string;
  }>;
};

export type ScriptSegmentKind = "argument" | "judge_summary" | "score_comment" | "context";

export type ScriptSegmentationPreset = "standard" | "compact" | "detailed";

export type ScriptSegmentationOptions = {
  mode: ScriptSegmentationPreset;
  minChars: number;
  targetChars: number;
  maxChars: number;
};

export type VideoScriptSegment = {
  id: string;
  roundIndex: number;
  speechId: string;
  role: string;
  label: string;
  agentName: string;
  text: string;
  lines: string[];
  charCount: number;
  order: number;
  kind: ScriptSegmentKind;
};

export type VideoScriptSpeech = {
  id: string;
  roundIndex: number;
  role: string;
  label: string;
  agentName: string;
  /** Complete source content from the exported dialogue entry. */
  content: string;
  /** Readable text used by layout and segmentation. */
  displayContent?: string;
  charCount: number;
  order: number;
  kind: ScriptSegmentKind;
  segments: VideoScriptSegment[];
};

export type VideoScriptJudgeCriterion = {
  role: string;
  label: string;
  score: number | null;
  comment: string;
};

export type VideoScriptRound = {
  id: string;
  roundIndex: number;
  turnLabel: string;
  speeches: VideoScriptSpeech[];
  speakerSegments: VideoScriptSegment[];
  judgeSegments: VideoScriptSegment[];
  contextSegments: VideoScriptSegment[];
  scoreSegments: VideoScriptSegment[];
  judge: {
    summary: string;
    criteria: VideoScriptJudgeCriterion[];
    winner: string | null;
    scoreComments: VideoScriptSegment[];
  };
  totalChars: number;
};

export type VideoScript = {
  version: string;
  scriptHash?: string;
  topic: string;
  participants: string[];
  segmentation: ScriptSegmentationOptions;
  rounds: VideoScriptRound[];
};

export type SegmentCue = VideoScriptSegment & {
  startFrame: number;
  endFrame: number;
  startMs?: number;
  endMs?: number;
};

export type LineCue = {
  id: string;
  segmentId?: string;
  speechId?: string;
  kind?: ScriptSegmentKind;
  role: string;
  label: string;
  agentName: string;
  text: string;
  charCount: number;
  startFrame: number;
  endFrame: number;
};

export type AudioManifest = {
  schemaVersion: 2;
  provider: "edge" | "mimo";
  scriptFile?: string;
  scriptHash?: string;
  ttsSignature?: string;
  durationMs: number;
  sessionAudioFile: string;
  scenes: Array<{
    id: string;
    roundIndex: number;
    audioFile: string;
    durationFrames?: number;
    durationMs: number;
    startMs: number;
    endMs: number;
    cues: AudioCue[];
    segmentCues?: SegmentCue[];
    lineCues?: LineCue[];
  }>;
};

export type AudioCue = {
  segmentId: string;
  chunkId: string;
  role?: TtsRole;
  startMs: number;
  endMs: number;
  audioFile: string;
};

export type DebateScene = {
  id: string;
  turnIndex: number;
  turnLabel: string;
  durationInFrames: number;
  speakerItems: TextItem[];
  judgeItems: TextItem[];
  contextItems: TextItem[];
  scoreItems: ScoreItem[];
  winner: string | null;
  totalChars: number;
  speakerLines: LineCue[];
  segmentCues: SegmentCue[];
  audioFile?: string;
  audioDurationFrames?: number;
};

export type DebateVideoModel = {
  topic: string;
  participants: string[];
  fps: number;
  width: number;
  height: number;
  introFrames: number;
  outroFrames: number;
  durationInFrames: number;
  timelineKind: "audio" | "estimated";
  scenes: DebateScene[];
};

export type DebateVideoProps = DebateVideoInputProps & {
  video?: DebateVideoModel;
};
