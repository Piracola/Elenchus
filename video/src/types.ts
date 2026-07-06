import { z } from "zod";

export const FPS = 30;
export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;

export const DebateVideoInputSchema = z.object({
  dataFile: z.string().default("data/session-export.json"),
  sourceName: z.string().optional(),
  title: z.string().optional(),
  audioManifest: z.string().optional(),
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
  max_turns?: number;
  current_turn?: number;
  dialogue_history?: ElenchusEntry[];
  current_scores?: Record<string, ScoreBlock>;
  cumulative_scores?: Record<string, Record<string, number[]>>;
  run_events?: Array<{
    type?: string;
    payload?: Record<string, unknown>;
    timestamp?: string;
  }>;
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

export type LineCue = {
  id: string;
  role: string;
  label: string;
  agentName: string;
  text: string;
  charCount: number;
  startFrame: number;
  endFrame: number;
};

export type AudioManifest = {
  scenes: Array<{
    id: string;
    audioFile: string;
    durationFrames: number;
    lineCues?: LineCue[];
  }>;
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
  totalChars: number;
  speakerLines: LineCue[];
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
  scenes: DebateScene[];
};

export type DebateVideoProps = DebateVideoInputProps & {
  video?: DebateVideoModel;
};
