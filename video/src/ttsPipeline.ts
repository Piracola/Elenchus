import { createHash } from "node:crypto";

import { cleanTextForTts } from "./videoScript";

export const EDGE_TTS_TARGET_CHARS = 120;
export const EDGE_TTS_MAX_CHARS = 180;
export const EDGE_TTS_MIN_SPLIT_CHARS = 48;
export const EDGE_TTS_VERSION = "7.2.8";
export const EDGE_TTS_RETRY_DELAYS_MS = [2_000, 5_000, 10_000] as const;
export const MAX_TTS_REQUESTS_PER_SEGMENT = 24;
export const DEFAULT_TTS_CONCURRENCY = 50;
export const MAX_TTS_CONCURRENCY = 100;

export type TtsChunkStatus = "pending" | "running" | "completed" | "failed";
export type TtsRole = "affirmative" | "negative" | "judge" | "narrator";

export type TtsChunk = {
  id: string;
  roundIndex: number;
  segmentId: string;
  role: TtsRole;
  text: string;
  order: number;
  voice: string;
  cacheKey: string;
  status: TtsChunkStatus;
  attempts: number;
  audioFile?: string;
  durationMs?: number;
  error?: string;
};

export type TtsChunkPlan = Omit<TtsChunk, "status" | "attempts" | "audioFile" | "durationMs" | "error">;

type ChunkIdentity = {
  provider: string;
  engineVersion: string;
  voice: string;
  speed: string | number;
  volume?: string | number;
  pitch?: string | number;
  format: string;
  text: string;
};

export const normalizeTtsRole = (role: unknown): TtsRole => {
  const value = String(role ?? "").trim().toLowerCase();
  if (["affirmative", "proposer", "positive", "正方"].includes(value)) {
    return "affirmative";
  }
  if (["negative", "opposer", "反方"].includes(value)) {
    return "negative";
  }
  if (["judge", "裁判"].includes(value)) {
    return "judge";
  }
  return "narrator";
};

export const shouldGenerateTtsForSegment = (
  segment: { role?: unknown; kind?: unknown },
  options: { includeJudge?: unknown; includeNarrator?: unknown } = {},
): boolean => {
  if (segment.kind === "judge_summary" || segment.kind === "score_comment" || segment.role === "judge") {
    return Boolean(options.includeJudge);
  }
  if (segment.kind === "context") {
    return Boolean(options.includeNarrator);
  }
  const role = normalizeTtsRole(segment.role);
  return role === "affirmative" || role === "negative" || Boolean(options.includeNarrator);
};

const splitWithDelimiter = (text: string, delimiter: RegExp): string[] => {
  const tokens = text.split(delimiter).filter(Boolean);
  const parts: string[] = [];
  let current = "";

  for (const token of tokens) {
    current += token;
    if (delimiter.test(token)) {
      parts.push(current);
      current = "";
    }
    delimiter.lastIndex = 0;
  }
  if (current) {
    parts.push(current);
  }
  return parts;
};

const hardSplit = (text: string, maxChars: number): string[] => {
  const parts: string[] = [];
  for (let index = 0; index < text.length; index += maxChars) {
    parts.push(text.slice(index, index + maxChars));
  }
  return parts;
};

const splitOversizedPart = (text: string, maxChars: number): string[] => {
  if (text.length <= maxChars) {
    return [text];
  }

  const clauses = splitWithDelimiter(text, /([，、：,:]+)/g);
  if (clauses.length <= 1) {
    return hardSplit(text, maxChars);
  }

  return clauses.flatMap((clause) => (clause.length <= maxChars ? [clause] : hardSplit(clause, maxChars)));
};

export const splitTextForTts = (
  value: unknown,
  options: { targetChars?: number; maxChars?: number } = {},
): string[] => {
  const text = cleanTextForTts(value);
  if (!text) {
    return [];
  }

  const maxChars = Math.max(EDGE_TTS_MIN_SPLIT_CHARS, Math.round(options.maxChars ?? EDGE_TTS_MAX_CHARS));
  const targetChars = Math.min(maxChars, Math.max(EDGE_TTS_MIN_SPLIT_CHARS, Math.round(options.targetChars ?? EDGE_TTS_TARGET_CHARS)));
  const sentences = splitWithDelimiter(text, /([。！？；!?;]+)/g).flatMap((part) => splitOversizedPart(part, maxChars));
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (!sentence) {
      continue;
    }
    if (!current) {
      current = sentence;
      continue;
    }

    const combinedLength = current.length + sentence.length;
    if (combinedLength <= targetChars || (current.length < EDGE_TTS_MIN_SPLIT_CHARS && combinedLength <= maxChars)) {
      current += sentence;
      continue;
    }

    chunks.push(current);
    current = sentence;
  }

  if (current) {
    chunks.push(current);
  }

  const normalizedChunks = chunks.flatMap((chunk) => splitOversizedPart(chunk, maxChars)).filter(Boolean);
  if (normalizedChunks.join("") !== text) {
    throw new Error("TTS 文本切分校验失败：切分结果无法还原原文。");
  }
  return normalizedChunks;
};

export const splitFailedTtsChunk = (text: string, minChars = EDGE_TTS_MIN_SPLIT_CHARS): string[] => {
  const clean = cleanTextForTts(text);
  if (clean.length <= minChars) {
    return [clean];
  }
  const maxChars = Math.max(minChars, Math.ceil(clean.length / 2));
  const parts = splitTextForTts(clean, { targetChars: maxChars, maxChars });
  if (parts.length > 1) {
    return parts;
  }
  const midpoint = Math.ceil(clean.length / 2);
  return [clean.slice(0, midpoint), clean.slice(midpoint)].filter(Boolean);
};

export const createTtsCacheKey = (identity: ChunkIdentity): string =>
  createHash("sha256")
    .update(JSON.stringify(identity))
    .digest("hex");

export type TtsErrorKind = "no-audio" | "retryable" | "fatal";

export type TtsRecoveryOptions<Result> = {
  tryReuse: (plan: TtsChunkPlan) => Promise<Result | null>;
  runAttempt: (plan: TtsChunkPlan, attempt: number, totalAttempts: number) => Promise<Result>;
  classifyError: (error: unknown) => TtsErrorKind;
  splitPlan: (plan: TtsChunkPlan) => TtsChunkPlan[];
  consumeRequest: (segmentId: string) => void;
  sleep?: (delayMs: number) => Promise<void>;
  retryDelaysMs?: readonly number[];
  maxSplitDepth?: number;
};

export const normalizeTtsConcurrency = (value: unknown): number => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TTS_CONCURRENCY;
  return Math.min(MAX_TTS_CONCURRENCY, Math.max(1, parsed));
};

export const runWithConcurrency = async <Item, Result>(
  items: readonly Item[],
  concurrency: unknown,
  worker: (item: Item, index: number) => Promise<Result>,
): Promise<Result[]> => {
  const results = new Array<Result>(items.length);
  let nextIndex = 0;
  let stopped = false;
  const workerCount = Math.min(items.length, normalizeTtsConcurrency(concurrency));

  const runWorker = async () => {
    while (!stopped && nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        stopped = true;
        throw error;
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
};

export const runRecoverableTtsChunk = async <Result>(
  plan: TtsChunkPlan,
  options: TtsRecoveryOptions<Result>,
  depth = 0,
): Promise<Result[]> => {
  const reused = await options.tryReuse(plan);
  if (reused) return [reused];

  const retryDelays = [0, ...(options.retryDelaysMs ?? EDGE_TTS_RETRY_DELAYS_MS)];
  const sleep = options.sleep ?? ((delayMs: number) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  let lastError: unknown = new Error("TTS request did not run");
  let lastKind: TtsErrorKind = "fatal";

  for (let attempt = 1; attempt <= retryDelays.length; attempt += 1) {
    const delayMs = retryDelays[attempt - 1];
    if (delayMs > 0) await sleep(delayMs);
    options.consumeRequest(plan.segmentId);
    try {
      return [await options.runAttempt(plan, attempt, retryDelays.length)];
    } catch (error) {
      lastError = error;
      lastKind = options.classifyError(error);
      if (lastKind === "fatal") break;
    }
  }

  const maxSplitDepth = options.maxSplitDepth ?? 4;
  if (lastKind === "no-audio" && plan.text.length > EDGE_TTS_MIN_SPLIT_CHARS && depth < maxSplitDepth) {
    const children = options.splitPlan(plan);
    if (children.length > 1) {
      const results: Result[] = [];
      for (const child of children) {
        results.push(...(await runRecoverableTtsChunk(child, options, depth + 1)));
      }
      return results;
    }
  }

  throw lastError;
};
