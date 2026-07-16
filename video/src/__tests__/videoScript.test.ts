import { describe, it, expect } from "vitest";

import {
  buildVideoScript,
  charCount,
  cleanTextForSpeech,
  distributeFramesByWeight,
  estimateLineTimingWeight,
  estimateSegmentDurationFrames,
  markdownToReadableText,
  resolveSegmentationOptions,
  segmentCuesToLineCues,
  segmentTextForVideo,
  segmentTextToLines,
  stripThinking,
  VIDEO_SCRIPT_VERSION,
} from "../videoScript";
import type { ElenchusEntry, ElenchusExport, SegmentCue, VideoScriptSegment } from "../types";

const makeEntry = (overrides: Partial<ElenchusEntry> = {}): ElenchusEntry => ({
  role: "proposer",
  content: "这是一段测试发言。",
  turn: 0,
  ...overrides,
});

const makeExport = (
  entries: ElenchusEntry[] = [],
  overrides: Partial<ElenchusExport> = {},
): ElenchusExport => ({
  topic: "测试辩题",
  participants: ["proposer", "opposer"],
  dialogue_history: entries,
  ...overrides,
});

describe("charCount", () => {
  it("counts only non-whitespace characters", () => {
    expect(charCount("hello world")).toBe(10);
    expect(charCount("你好 世界")).toBe(4);
    expect(charCount("  ")).toBe(0);
    expect(charCount("")).toBe(0);
  });

  it("handles mixed content", () => {
    expect(charCount("a b\nc\td")).toBe(4);
  });
});

describe("stripThinking", () => {
  it("removes a single think block", () => {
    const result = stripThinking("<think>internal reasoning</think>visible text");
    expect(result).toBe("visible text");
  });

  it("removes multiple consecutive think blocks", () => {
    const result = stripThinking("\x3Cthink\x3Eblock 1\x3C/think\x3E\x3Cthink\x3Eblock 2\x3C/think\x3Efinal text");
    expect(result).toBe("final text");
  });

  it("returns original text when think tag is unclosed", () => {
    const result = stripThinking("<think>unclosed reasoning");
    expect(result).toBe("<think>unclosed reasoning");
  });

  it("handles non-string input", () => {
    expect(stripThinking(null)).toBe("");
    expect(stripThinking(undefined)).toBe("");
  });

  it("handles think tags with attributes", () => {
    const result = stripThinking('<think type="reasoning">hidden</think>shown');
    expect(result).toBe("shown");
  });
});

describe("markdownToReadableText", () => {
  it("strips heading markers", () => {
    expect(markdownToReadableText("## Title")).toBe("Title");
    expect(markdownToReadableText("### Subtitle")).toBe("Subtitle");
  });

  it("strips bold and italic markers", () => {
    expect(markdownToReadableText("**bold** text")).toBe("bold text");
    expect(markdownToReadableText("*italic* text")).toBe("italic text");
  });

  it("strips inline code markers", () => {
    expect(markdownToReadableText("use `code` here")).toBe("use code here");
  });

  it("converts list markers to bullet points", () => {
    const result = markdownToReadableText("- item one\n- item two");
    expect(result).toContain("· item one");
    expect(result).toContain("· item two");
  });

  it("collapses multiple newlines", () => {
    expect(markdownToReadableText("para 1\n\n\n\npara 2")).toBe("para 1\n\npara 2");
  });

  it("removes think blocks before processing", () => {
    const result = markdownToReadableText("<think>hidden</think>## Heading");
    expect(result).toBe("Heading");
  });
});

describe("resolveSegmentationOptions", () => {
  it("returns standard preset by default", () => {
    const opts = resolveSegmentationOptions();
    expect(opts.mode).toBe("standard");
    expect(opts.targetChars).toBe(200);
  });

  it("returns compact preset", () => {
    const opts = resolveSegmentationOptions("compact");
    expect(opts.mode).toBe("compact");
    expect(opts.targetChars).toBe(260);
  });

  it("returns detailed preset", () => {
    const opts = resolveSegmentationOptions("detailed");
    expect(opts.mode).toBe("detailed");
    expect(opts.targetChars).toBe(140);
  });

  it("falls back to standard for unknown mode", () => {
    const opts = resolveSegmentationOptions("nonexistent");
    expect(opts.mode).toBe("standard");
  });
});

describe("segmentTextForVideo", () => {
  it("returns empty array for empty input", () => {
    expect(segmentTextForVideo("")).toEqual([]);
    expect(segmentTextForVideo("   ")).toEqual([]);
  });

  it("returns single segment for short text", () => {
    const result = segmentTextForVideo("短文本。");
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("短文本");
  });

  it("splits by sentence delimiters", () => {
    const result = segmentTextForVideo("第一句。第二句。第三句。");
    expect(result.length).toBeGreaterThanOrEqual(1);
    result.forEach((segment) => {
      expect(segment.length).toBeGreaterThan(0);
    });
  });

  it("respects maxChars limit", () => {
    const longText = "这是一段很长的文本".repeat(50) + "。";
    const opts = resolveSegmentationOptions("compact");
    const result = segmentTextForVideo(longText, opts);
    result.forEach((segment) => {
      expect(charCount(segment)).toBeLessThanOrEqual(opts.maxChars);
    });
  });

  it("merges short segments up to targetChars", () => {
    const result = segmentTextForVideo("短。短。短。短。短。", resolveSegmentationOptions("standard"));
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it.each(["standard", "compact", "detailed"])("losslessly restores normalized text in %s mode", (mode) => {
    const source = [
      "第一部分：语言是思想的边界。",
      "",
      "第二部分保留 English words and spaces，也保留段落之间的换行；".repeat(12),
      "最后是一段没有标点的长文本".repeat(35),
    ].join("\n");
    const normalized = cleanTextForSpeech(source);
    const result = segmentTextForVideo(source, resolveSegmentationOptions(mode));
    expect(result.join("")).toBe(normalized);
    expect(result.every((segment) => charCount(segment) <= resolveSegmentationOptions(mode).maxChars)).toBe(true);
  });
});

describe("segmentTextToLines", () => {
  it("returns empty array for empty input", () => {
    expect(segmentTextToLines("")).toEqual([]);
    expect(segmentTextToLines("   ")).toEqual([]);
  });

  it("returns single line for short text", () => {
    const result = segmentTextToLines("短文本");
    expect(result).toEqual(["短文本"]);
  });

  it("splits long text at maxChars boundary", () => {
    const longText = "字".repeat(60);
    const result = segmentTextToLines(longText, 28);
    result.forEach((line) => {
      expect(line.length).toBeLessThanOrEqual(28);
    });
    expect(result.join("").length).toBe(60);
  });

  it("splits at sentence boundaries", () => {
    const result = segmentTextToLines("第一句。第二句。");
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("splits at clause boundaries for long sentences", () => {
    const longClause = "字".repeat(20);
    const text = `${longClause}，${longClause}，${longClause}。`;
    const result = segmentTextToLines(text, 28);
    result.forEach((line) => {
      expect(line.length).toBeLessThanOrEqual(28);
    });
  });
});

describe("estimateSegmentDurationFrames", () => {
  it("returns at least MIN_SEGMENT_FRAMES for empty text", () => {
    const frames = estimateSegmentDurationFrames("");
    expect(frames).toBeGreaterThanOrEqual(1);
  });

  it("increases with text length", () => {
    const short = estimateSegmentDurationFrames("短文本。");
    const long = estimateSegmentDurationFrames("这是一段非常非常非常长的辩论发言文本，包含了很多的内容和标点符号。");
    expect(long).toBeGreaterThan(short);
  });

  it("accounts for sentence pauses", () => {
    const noPause = estimateSegmentDurationFrames("十个字符的文本啊");
    const withPause = estimateSegmentDurationFrames("十个字符的。文本啊");
    expect(withPause).toBeGreaterThanOrEqual(noPause);
  });

  it("accounts for clause pauses", () => {
    const noPause = estimateSegmentDurationFrames("十个字符的文本啊");
    const withClausePause = estimateSegmentDurationFrames("十个字符，的文本啊");
    expect(withClausePause).toBeGreaterThanOrEqual(noPause);
  });
});

describe("estimateLineTimingWeight", () => {
  it("does not apply the segment minimum duration to every line", () => {
    expect(estimateLineTimingWeight("这是明显更长的一行发言内容。"))
      .toBeGreaterThan(estimateLineTimingWeight("短句。"));
  });

  it("adds weight for punctuation pauses", () => {
    expect(estimateLineTimingWeight("观点一，观点二。"))
      .toBeGreaterThan(estimateLineTimingWeight("观点一观点二"));
  });
});

describe("distributeFramesByWeight", () => {
  it("returns empty array for no weights", () => {
    expect(distributeFramesByWeight(100, [])).toEqual([]);
  });

  it("returns empty array for zero total frames", () => {
    expect(distributeFramesByWeight(0, [1, 2, 3])).toEqual([]);
  });

  it("allocates frames proportional to weights", () => {
    const result = distributeFramesByWeight(100, [1, 1, 1]);
    expect(result).toHaveLength(3);
    const total = result.reduce((sum, r) => sum + (r.endFrame - r.startFrame), 0);
    expect(total).toBe(100);
  });

  it("gives more frames to heavier weights", () => {
    const result = distributeFramesByWeight(100, [1, 3]);
    const first = result[0].endFrame - result[0].startFrame;
    const second = result[1].endFrame - result[1].startFrame;
    expect(second).toBeGreaterThan(first);
  });

  it("ensures contiguous frames with no gaps", () => {
    const result = distributeFramesByWeight(90, [2, 3, 4]);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].startFrame).toBe(result[i - 1].endFrame);
    }
    expect(result[result.length - 1].endFrame).toBe(90);
  });

  it("handles zero-weight items by treating them as 1", () => {
    const result = distributeFramesByWeight(30, [0, 0]);
    expect(result).toHaveLength(2);
    result.forEach((r) => {
      expect(r.endFrame - r.startFrame).toBeGreaterThanOrEqual(1);
    });
  });

  it("handles single weight", () => {
    const result = distributeFramesByWeight(50, [1]);
    expect(result).toHaveLength(1);
    expect(result[0].startFrame).toBe(0);
    expect(result[0].endFrame).toBe(50);
  });
});

describe("buildVideoScript", () => {
  it("keeps the full source content while segments restore display content", () => {
    const source = "## 标题\n\n**语言** is a tool。\n\n第二段保留 English spaces。".repeat(20);
    const script = buildVideoScript(makeExport([makeEntry({ content: source })]));
    const speech = script.rounds[0].speeches[0];
    expect(speech.content).toBe(source);
    expect(speech.displayContent).toBe(cleanTextForSpeech(source));
    expect(speech.segments.map((segment) => segment.text).join("")).toBe(speech.displayContent);
  });

  it("builds a script with correct version and topic", () => {
    const exportData = makeExport([makeEntry()]);
    const script = buildVideoScript(exportData);
    expect(script.version).toBe(VIDEO_SCRIPT_VERSION);
    expect(script.topic).toBe("测试辩题");
  });

  it("groups entries by turn", () => {
    const exportData = makeExport([
      makeEntry({ turn: 0, content: "第一轮正方。", role: "proposer" }),
      makeEntry({ turn: 0, content: "第一轮反方。", role: "opposer" }),
      makeEntry({ turn: 1, content: "第二轮正方。", role: "proposer" }),
    ]);
    const script = buildVideoScript(exportData);
    expect(script.rounds).toHaveLength(2);
    expect(script.rounds[0].speeches.length).toBeGreaterThanOrEqual(2);
    expect(script.rounds[1].speeches.length).toBeGreaterThanOrEqual(1);
  });

  it("classifies speaker segments correctly", () => {
    const exportData = makeExport([
      makeEntry({ role: "proposer", content: "正方发言。" }),
      makeEntry({ role: "opposer", content: "反方发言。" }),
    ]);
    const script = buildVideoScript(exportData);
    expect(script.rounds[0].speakerSegments.length).toBeGreaterThanOrEqual(2);
  });

  it("classifies judge segments separately from speakers", () => {
    const exportData = makeExport([
      makeEntry({ role: "proposer", content: "正方发言。" }),
      makeEntry({ role: "judge", content: "裁判评语。", target_role: "proposer" }),
    ]);
    const script = buildVideoScript(exportData);
    expect(script.rounds[0].speakerSegments.length).toBeGreaterThanOrEqual(1);
    expect(script.rounds[0].judgeSegments.length).toBeGreaterThanOrEqual(1);
  });

  it("creates score segments from judge scores", () => {
    const exportData = makeExport([
      makeEntry({ role: "proposer", content: "正方发言。" }),
      makeEntry({
        role: "judge",
        content: "裁判点评。",
        target_role: "proposer",
        scores: {
          comprehensive_score: 8.5,
          overall_comment: "表现不错。",
          logical_rigor: { score: 8, rationale: "逻辑严密。" },
        },
      }),
    ]);
    const script = buildVideoScript(exportData);
    expect(script.rounds[0].scoreSegments.length).toBeGreaterThanOrEqual(1);
    expect(script.rounds[0].judge.winner).toBeNull();
  });

  it("detects winner when two roles are scored", () => {
    const exportData = makeExport([
      makeEntry({ role: "proposer", content: "正方发言。" }),
      makeEntry({ role: "opposer", content: "反方发言。" }),
      makeEntry({
        role: "judge",
        content: "裁判点评。",
        target_role: "proposer",
        scores: { comprehensive_score: 9 },
      }),
      makeEntry({
        role: "judge",
        content: "裁判点评。",
        target_role: "opposer",
        scores: { comprehensive_score: 7 },
      }),
    ]);
    const script = buildVideoScript(exportData);
    expect(script.rounds[0].judge.winner).toBe("proposer");
  });

  it("returns null winner on tie", () => {
    const exportData = makeExport([
      makeEntry({ role: "proposer", content: "正方发言。" }),
      makeEntry({ role: "opposer", content: "反方发言。" }),
      makeEntry({
        role: "judge",
        content: "",
        target_role: "proposer",
        scores: { comprehensive_score: 8 },
      }),
      makeEntry({
        role: "judge",
        content: "",
        target_role: "opposer",
        scores: { comprehensive_score: 8 },
      }),
    ]);
    const script = buildVideoScript(exportData);
    expect(script.rounds[0].judge.winner).toBeNull();
  });

  it("computes a stable scriptHash for identical input", () => {
    const exportData = makeExport([
      makeEntry({ role: "proposer", content: "正方发言。" }),
      makeEntry({ role: "opposer", content: "反方发言。" }),
    ]);
    const script1 = buildVideoScript(exportData);
    const script2 = buildVideoScript(exportData);
    expect(script1.scriptHash).toBeTruthy();
    expect(script1.scriptHash).toBe(script2.scriptHash);
  });

  it("changes scriptHash when content changes", () => {
    const base = makeExport([
      makeEntry({ role: "proposer", content: "正方发言。" }),
    ]);
    const modified = makeExport([
      makeEntry({ role: "proposer", content: "修改后的正方发言。" }),
    ]);
    const script1 = buildVideoScript(base);
    const script2 = buildVideoScript(modified);
    expect(script1.scriptHash).not.toBe(script2.scriptHash);
  });

  it("falls back to default participants when export lacks them", () => {
    const exportData: ElenchusExport = {
      topic: "无参与者",
      dialogue_history: [makeEntry({ role: "proposer", content: "发言。" })],
    };
    const script = buildVideoScript(exportData);
    expect(script.participants).toEqual(["proposer", "opposer"]);
  });

  it("handles empty dialogue history gracefully", () => {
    const exportData = makeExport([]);
    const script = buildVideoScript(exportData);
    expect(script.rounds).toEqual([]);
    expect(script.scriptHash).toBeTruthy();
  });
});

describe("segmentCuesToLineCues", () => {
  const makeSegment = (overrides: Partial<VideoScriptSegment> = {}): VideoScriptSegment => ({
    id: "test-seg-001",
    roundIndex: 0,
    speechId: "proposer-1-0",
    role: "proposer",
    label: "正方",
    agentName: "正方辩手",
    text: "这是一段测试文本。第二句在这里。",
    lines: ["这是一段测试文本。", "第二句在这里。"],
    charCount: 18,
    order: 0,
    kind: "argument",
    ...overrides,
  });

  const makeCue = (overrides: Partial<SegmentCue> = {}): SegmentCue => ({
    ...makeSegment(),
    startFrame: 0,
    endFrame: 60,
    ...overrides,
  });

  it("returns empty array for no segments", () => {
    expect(segmentCuesToLineCues([])).toEqual([]);
  });

  it("creates one line cue per line", () => {
    const segment = makeCue();
    const cues = segmentCuesToLineCues([segment]);
    expect(cues.length).toBe(segment.lines.length);
  });

  it("distributes frames across lines within segment range", () => {
    const segment = makeCue({ startFrame: 10, endFrame: 70 });
    const cues = segmentCuesToLineCues([segment]);
    expect(cues[0].startFrame).toBe(10);
    expect(cues[cues.length - 1].endFrame).toBe(70);
    for (let i = 1; i < cues.length; i++) {
      expect(cues[i].startFrame).toBe(cues[i - 1].endFrame);
    }
  });

  it("gives longer lines more frames while preserving segment anchors", () => {
    const segment = makeCue({
      startFrame: 10,
      endFrame: 110,
      lines: ["短句。", "这是明显更长的一行发言内容，用于验证时间权重。"],
    });
    const cues = segmentCuesToLineCues([segment]);
    expect(cues[0].startFrame).toBe(10);
    expect(cues.at(-1)?.endFrame).toBe(110);
    expect(cues[1].endFrame - cues[1].startFrame).toBeGreaterThan(cues[0].endFrame - cues[0].startFrame);
  });

  it("generates line IDs from segment ID", () => {
    const segment = makeCue({ id: "proposer-1-0-seg-001" });
    const cues = segmentCuesToLineCues([segment]);
    cues.forEach((cue, index) => {
      expect(cue.id).toContain(segment.id);
      expect(cue.id).toContain(`line-${String(index + 1).padStart(2, "0")}`);
    });
  });

  it("preserves segment metadata on each line cue", () => {
    const segment = makeCue();
    const cues = segmentCuesToLineCues([segment]);
    cues.forEach((cue) => {
      expect(cue.segmentId).toBe(segment.id);
      expect(cue.speechId).toBe(segment.speechId);
      expect(cue.role).toBe(segment.role);
      expect(cue.label).toBe(segment.label);
    });
  });

  it("handles segment with no lines by deriving from text", () => {
    const segment = makeCue({ lines: [], text: "单独一句文本。" });
    const cues = segmentCuesToLineCues([segment]);
    expect(cues.length).toBeGreaterThanOrEqual(1);
  });
});
