import { describe, expect, it } from "vitest";

import {
  createTtsCacheKey,
  EDGE_TTS_MAX_CHARS,
  normalizeTtsConcurrency,
  normalizeTtsRole,
  runRecoverableTtsChunk,
  runWithConcurrency,
  shouldGenerateTtsForSegment,
  splitFailedTtsChunk,
  splitTextForTts,
} from "../ttsPipeline";
import type { TtsChunkPlan, TtsErrorKind } from "../ttsPipeline";
import { cleanTextForTts } from "../videoScript";
import { buildVideoScript, cleanTextForSpeech } from "../videoScript";

describe("splitTextForTts", () => {
  it("keeps short text in one request", () => {
    expect(splitTextForTts("这是一段短文本。")) .toEqual(["这是一段短文本。"]);
  });

  it("keeps a compact video segment in one Edge TTS request", () => {
    const text = "第一句说明观点。第二句补充理由。第三句给出结论。".repeat(10).slice(0, 250);
    expect(splitTextForTts(text)).toEqual([text]);
  });

  it("preserves normalized text exactly", () => {
    const text = "第一句说明观点。第二句补充理由；第三句给出结论！".repeat(8);
    const chunks = splitTextForTts(text);
    expect(chunks.join("")) .toBe(cleanTextForTts(text));
    expect(chunks.every((chunk) => chunk.length <= EDGE_TTS_MAX_CHARS)).toBe(true);
  });

  it("hard-splits a sentence without punctuation", () => {
    const text = "字".repeat(500);
    const chunks = splitTextForTts(text);
    expect(chunks.join("")) .toBe(text);
    expect(chunks.every((chunk) => chunk.length <= EDGE_TTS_MAX_CHARS)).toBe(true);
  });

  it("restores every segment from a long formatted speech in order", () => {
    const source = [
      "## 语言是思想的边界",
      "",
      "正方提出 English concepts must keep spaces，并给出第一组论证。".repeat(18),
      "",
      "反方回应：画面切分和 TTS requests 必须各自稳定。".repeat(18),
    ].join("\n");
    const script = buildVideoScript({
      topic: "语言是思想的边界",
      participants: ["proposer", "opposer"],
      dialogue_history: [{ role: "proposer", turn: 0, content: source }],
    });
    const speech = script.rounds[0].speeches[0];
    expect(speech.content).toBe(source);
    expect(speech.segments.map((segment) => segment.text).join("")).toBe(cleanTextForSpeech(source));
    for (const segment of speech.segments) {
      expect(splitTextForTts(segment.text).join("")).toBe(cleanTextForTts(segment.text));
    }
  });
});

describe("splitFailedTtsChunk", () => {
  it("splits retryable long text into smaller requests", () => {
    const text = "第一部分。第二部分。第三部分。第四部分。".repeat(10);
    const parts = splitFailedTtsChunk(text);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join("")) .toBe(cleanTextForTts(text));
  });
});

describe("createTtsCacheKey", () => {
  it("changes when voice or text changes", () => {
    const base = { provider: "edge", engineVersion: "7.2.8", voice: "voice-a", speed: 1, format: "mp3", text: "你好" };
    expect(createTtsCacheKey(base)).toBe(createTtsCacheKey(base));
    expect(createTtsCacheKey(base)).not.toBe(createTtsCacheKey({ ...base, voice: "voice-b" }));
    expect(createTtsCacheKey(base)).not.toBe(createTtsCacheKey({ ...base, text: "您好" }));
    expect(createTtsCacheKey(base)).not.toBe(createTtsCacheKey({ ...base, engineVersion: "7.2.9" }));
  });
});

const plan = (id = "chunk-1", text = "这是一段需要生成语音的测试文本。".repeat(5)): TtsChunkPlan => ({
  id,
  roundIndex: 0,
  segmentId: "segment-1",
  role: "affirmative",
  text,
  order: 0,
  voice: "zh-CN-XiaoxiaoNeural",
  cacheKey: id,
});

const recoveryOptions = <T>(overrides: Partial<Parameters<typeof runRecoverableTtsChunk<T>>[1]> = {}) => ({
  tryReuse: async () => null,
  runAttempt: async (candidate: TtsChunkPlan) => candidate.id as T,
  classifyError: () => "fatal" as TtsErrorKind,
  splitPlan: () => [],
  consumeRequest: () => undefined,
  sleep: async () => undefined,
  ...overrides,
});

describe("runRecoverableTtsChunk", () => {
  it("retries NoAudioReceived, then splits and generates children", async () => {
    const attempts: string[] = [];
    const result = await runRecoverableTtsChunk(plan(), recoveryOptions<string>({
      runAttempt: async (candidate) => {
        attempts.push(candidate.id);
        if (candidate.id === "chunk-1") throw new Error("NoAudioReceived");
        return candidate.id;
      },
      classifyError: (error) => String(error).includes("NoAudioReceived") ? "no-audio" : "fatal",
      splitPlan: (candidate) => [
        { ...candidate, id: `${candidate.id}-a`, cacheKey: `${candidate.cacheKey}-a`, text: candidate.text.slice(0, 60) },
        { ...candidate, id: `${candidate.id}-b`, cacheKey: `${candidate.cacheKey}-b`, text: candidate.text.slice(60) },
      ],
    }));
    expect(attempts.filter((id) => id === "chunk-1")).toHaveLength(4);
    expect(result).toEqual(["chunk-1-a", "chunk-1-b"]);
  });

  it.each(["请求超时", "媒体文件为空", "FFprobe 检测到损坏音频"])("retries %s without recursively splitting", async (message) => {
    let attempts = 0;
    let splitCalls = 0;
    await expect(runRecoverableTtsChunk(plan(), recoveryOptions({
      runAttempt: async () => {
        attempts += 1;
        throw new Error(message);
      },
      classifyError: () => "retryable",
      splitPlan: () => {
        splitCalls += 1;
        return [];
      },
    }))).rejects.toThrow(message);
    expect(attempts).toBe(4);
    expect(splitCalls).toBe(0);
  });

  it("resumes from a completed cached chunk without another request", async () => {
    let attempts = 0;
    const result = await runRecoverableTtsChunk(plan(), recoveryOptions<string>({
      tryReuse: async () => "cached-audio.mp3",
      runAttempt: async () => {
        attempts += 1;
        return "new-audio.mp3";
      },
    }));
    expect(result).toEqual(["cached-audio.mp3"]);
    expect(attempts).toBe(0);
  });

  it("stops when the segment request budget is exhausted", async () => {
    let requests = 0;
    await expect(runRecoverableTtsChunk(plan(), recoveryOptions({
      consumeRequest: () => {
        requests += 1;
        if (requests > 2) throw new Error("请求上限");
      },
      runAttempt: async () => {
        throw new Error("请求超时");
      },
      classifyError: () => "retryable",
    }))).rejects.toThrow("请求上限");
    expect(requests).toBe(3);
  });
});

describe("normalizeTtsRole", () => {
  it("uses narrator for unknown roles instead of guessing a debate side", () => {
    expect(normalizeTtsRole("proposer")).toBe("affirmative");
    expect(normalizeTtsRole("opposer")).toBe("negative");
    expect(normalizeTtsRole("judge")).toBe("judge");
    expect(normalizeTtsRole("fact_checker")).toBe("narrator");
  });
});

describe("shouldGenerateTtsForSegment", () => {
  it("voices only debaters by default", () => {
    expect(shouldGenerateTtsForSegment({ role: "proposer", kind: "argument" })).toBe(true);
    expect(shouldGenerateTtsForSegment({ role: "opposer", kind: "argument" })).toBe(true);
    expect(shouldGenerateTtsForSegment({ role: "judge", kind: "judge_summary" })).toBe(false);
    expect(shouldGenerateTtsForSegment({ role: "proposer", kind: "score_comment" })).toBe(false);
    expect(shouldGenerateTtsForSegment({ role: "group_discussion", kind: "context" })).toBe(false);
  });

  it("allows judge and narrator voiceovers independently", () => {
    expect(shouldGenerateTtsForSegment(
      { role: "judge", kind: "judge_summary" },
      { includeJudge: true },
    )).toBe(true);
    expect(shouldGenerateTtsForSegment(
      { role: "group_discussion", kind: "context" },
      { includeNarrator: true },
    )).toBe(true);
    expect(shouldGenerateTtsForSegment(
      { role: "judge", kind: "judge_summary" },
      { includeNarrator: true },
    )).toBe(false);
  });
});

describe("TTS concurrency", () => {
  it("defaults to 50 and clamps the configured value to 1-100", () => {
    expect(normalizeTtsConcurrency(undefined)).toBe(50);
    expect(normalizeTtsConcurrency(0)).toBe(1);
    expect(normalizeTtsConcurrency(75)).toBe(75);
    expect(normalizeTtsConcurrency(500)).toBe(100);
  });

  it("runs requests concurrently while preserving result order", async () => {
    let active = 0;
    let peak = 0;
    const results = await runWithConcurrency([30, 5, 15, 1], 3, async (delay) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, delay));
      active -= 1;
      return delay;
    });
    expect(peak).toBe(3);
    expect(results).toEqual([30, 5, 15, 1]);
  });
});
