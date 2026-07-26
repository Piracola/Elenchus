import { describe, expect, it } from "vitest";

import {
  activeLineIndexAtFrame,
  buildFooterModel,
  buildHeaderModel,
  buildOutroModel,
  buildRoundStepper,
  buildSceneSlices,
  buildSceneViewModel,
  computeSpeakerLayout,
  fitTextLine,
  sampleFrameForSlice,
  SCENE_LAYOUT,
  SPEAKER_SCROLL_FRAMES,
  wrapTextLinesClamped,
  wrapTextLinesToWidth,
} from "../scenePresentation";
import { DIMENSION_LABELS, SCORE_KEYS } from "../videoScript";
import type { DebateScene, DebateVideoModel, LineCue, ScoreItem } from "../types";

const line = (id: string, startFrame: number, endFrame: number): LineCue => ({
  id,
  role: "proposer",
  label: "正方",
  agentName: "正方辩手",
  text: id,
  charCount: id.length,
  startFrame,
  endFrame,
});

const sceneWith = (overrides: Partial<DebateScene>): DebateScene => ({
  id: "scene-1",
  turnIndex: 0,
  turnLabel: "第 1 轮",
  durationInFrames: 300,
  speakerItems: [],
  judgeItems: [],
  contextItems: [],
  scoreItems: [],
  winner: null,
  totalChars: 0,
  speakerLines: [],
  segmentCues: [],
  ...overrides,
});

const scoreItem = (role: string, score: number): ScoreItem => ({
  role,
  label: role === "proposer" ? "正方" : "反方",
  comprehensiveScore: score,
  overallComment: `${role} 总评`,
  dimensions: SCORE_KEYS.map((key) => ({
    key,
    label: DIMENSION_LABELS[key],
    score,
    rationale: "",
  })),
});

const videoWith = (scenes: DebateScene[]): DebateVideoModel => ({
  topic: "语言是思想的边界",
  participants: ["proposer", "opposer"],
  fps: 30,
  width: SCENE_LAYOUT.width,
  height: SCENE_LAYOUT.height,
  introFrames: 150,
  outroFrames: 150,
  durationInFrames: 300 + scenes.reduce((sum, scene) => sum + scene.durationInFrames, 0),
  timelineKind: "audio",
  scenes,
});

describe("scene presentation", () => {
  const lines = [line("a", 10, 30), line("b", 30, 60), line("c", 60, 90)];

  it("selects the first and last line during scene padding", () => {
    expect(activeLineIndexAtFrame(lines, 0)).toBe(0);
    expect(activeLineIndexAtFrame(lines, 45)).toBe(1);
    expect(activeLineIndexAtFrame(lines, 99)).toBe(2);
  });

  it("builds contiguous slices covering the full scene", () => {
    const slices = buildSceneSlices(lines, 100);
    expect(slices[0].startFrame).toBe(0);
    expect(slices.at(-1)?.endFrame).toBe(100);
    for (let index = 1; index < slices.length; index += 1) {
      expect(slices[index].startFrame).toBe(slices[index - 1].endFrame);
    }
  });

  it("uses one fast-render slice for every line in the same segment", () => {
    const sameSegment = [
      { ...line("a", 0, 20), segmentId: "segment-1" },
      { ...line("b", 20, 40), segmentId: "segment-1" },
      { ...line("c", 40, 60), segmentId: "segment-2" },
    ];
    expect(buildSceneSlices(sameSegment, 60)).toHaveLength(3);
  });

  it("preserves non-speaker visual boundaries", () => {
    const segments = [
      {
        id: "judge-segment",
        roundIndex: 0,
        speechId: "judge-1",
        role: "judge",
        label: "裁判",
        agentName: "裁判",
        text: "裁判总结",
        lines: ["裁判总结"],
        charCount: 4,
        order: 1,
        kind: "judge_summary" as const,
        startFrame: 45,
        endFrame: 60,
      },
    ];
    expect(buildSceneSlices([line("speech", 0, 60)], 60, segments).map((slice) => slice.startFrame)).toEqual([0, 45]);
  });

  it("uses one stable slice for scenes without speech", () => {
    expect(buildSceneSlices([], 120)).toEqual([{ activeIndex: -1, startFrame: 0, endFrame: 120 }]);
  });

  it("keeps the active line visually dominant", () => {
    const layout = computeSpeakerLayout(lines, 1);
    expect(layout.items[1].state).toBe("active");
    expect(layout.items[0].state).toBe("near");
    expect(layout.items[2].state).toBe("near");
  });

  it("keeps line geometry stable across focus states", () => {
    const layout = computeSpeakerLayout([line("a", 0, 30), line("b", 30, 60), line("c", 60, 90)], 1);
    expect(layout.items.map((item) => item.textCenter)).toEqual([
      layout.items[0].textCenter,
      layout.items[1].textCenter,
      layout.items[2].textCenter,
    ]);
    expect(layout.items[1].textCenter - layout.items[0].textCenter)
      .toBeCloseTo(layout.items[2].textCenter - layout.items[1].textCenter, 5);
  });

  it("uses one deterministic ellipsis for Canvas and Remotion", () => {
    const fitted = fitTextLine("中英文 mixed content that is too long", 10);
    expect(fitted).toBe(fitTextLine("中英文 mixed content that is too long", 10));
    expect(fitted.endsWith("…")).toBe(true);
    expect(fitted.length).toBeLessThan("中英文 mixed content that is too long".length);
    expect(fitTextLine("短文本", 10)).toBe("短文本");
  });

  it("gives roughly 80 percent of the content width to the speaker", () => {
    const contentWidth = SCENE_LAYOUT.speaker.width + SCENE_LAYOUT.judge.width;
    expect(SCENE_LAYOUT.speaker.width / contentWidth).toBeCloseTo(0.8, 2);
  });

  it("wraps active speech without dropping text", () => {
    const text = "这是一段需要换行展示但不能被省略的当前辩手发言";
    const wrapped = wrapTextLinesToWidth(text, 10);
    expect(wrapped.length).toBeGreaterThan(1);
    expect(wrapped.join("")).toBe(text);

    const activeLine = { ...line("active", 0, 60), text, charCount: text.length };
    const futureLine = { ...line("future", 60, 90), text, charCount: text.length };
    const scene: DebateScene = {
      id: "scene-1",
      turnIndex: 0,
      turnLabel: "第 1 轮",
      durationInFrames: 90,
      totalChars: text.length,
      speakerItems: [],
      speakerLines: [activeLine, futureLine],
      segmentCues: [],
      judgeItems: [],
      contextItems: [],
      scoreItems: [],
      winner: null,
    };
    const view = buildSceneViewModel(scene, 30);
    expect(view.speakerLines[0].displayLines.join(" ").replace(/\s/g, "")).toBe(text);
    expect(view.speakerLines[0].displayText).not.toContain("…");
    expect(view.speakerLines[1].displayLines.join(" ").replace(/\s/g, "")).toBe(text);
    expect(view.speakerLines[1].displayText).not.toContain("…");
  });

  it("never opens a wrapped line with punctuation", () => {
    const wrapped = wrapTextLinesToWidth("语言是思想的边界。反方并不认同，理由有三。", 10);
    expect(wrapped.length).toBeGreaterThan(1);
    for (const wrappedLine of wrapped.slice(1)) {
      expect("，。、；：！？".includes(wrappedLine[0])).toBe(false);
    }
    expect(wrapped.join("")).toBe("语言是思想的边界。反方并不认同，理由有三。");
  });

  it("keeps latin words whole when wrapping", () => {
    const wrapped = wrapTextLinesToWidth("对方提出 violation-of-expectation 作为判据", 14);
    expect(wrapped.length).toBeGreaterThan(1);
    expect(wrapped.some((wrappedLine) => wrappedLine.includes("violation-of-expectation"))).toBe(true);
    expect(wrapped.join("").replace(/\s/g, "")).toBe("对方提出violation-of-expectation作为判据");
  });

  it("clamps overflowing text with a single ellipsis", () => {
    const clamped = wrapTextLinesClamped("裁判总结".repeat(40), 12, 3);
    expect(clamped).toHaveLength(3);
    expect(clamped.at(-1)?.endsWith("…")).toBe(true);
    expect(clamped.slice(0, -1).every((wrappedLine) => !wrappedLine.includes("…"))).toBe(true);
  });

  it("locks the active line to the reading focal point once it settles", () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      ({ ...line(`line-${index}`, index * 30, index * 30 + 30), text: `第 ${index} 句发言内容` }),
    );
    const scene = sceneWith({ speakerLines: many, durationInFrames: 900 });
    const settled = buildSceneViewModel(scene, 20 * 30 + SPEAKER_SCROLL_FRAMES);
    const active = settled.speaker.blocks.find((block) => block.state === "active");
    expect(active).toBeDefined();
    const center = (active?.top ?? 0) + (active?.height ?? 0) / 2 + settled.speaker.scrollOffset;
    expect(center).toBeCloseTo(settled.speaker.rect.height * 0.42, 0);

    // The first lines stay anchored to the top instead of scrolling into blank space.
    expect(buildSceneViewModel(scene, 0).speaker.scrollOffset).toBe(0);
  });

  it("samples fast-render slices after the scroll has settled", () => {
    expect(sampleFrameForSlice({ startFrame: 0, endFrame: 90 })).toBe(SPEAKER_SCROLL_FRAMES);
    expect(sampleFrameForSlice({ startFrame: 40, endFrame: 42 })).toBe(41);
  });

  it("pairs both sides into one head-to-head scoreboard", () => {
    const board = buildSceneViewModel(sceneWith({ scoreItems: [scoreItem("opposer", 8), scoreItem("proposer", 2)] }), 0)
      .score;
    expect(board.kind).toBe("versus");
    if (board.kind !== "versus") return;
    expect(board.left.role).toBe("proposer");
    expect(board.right.role).toBe("opposer");
    expect(board.leftShare).toBeCloseTo(0.2, 5);
    expect(board.rows.map((row) => row.label)).toEqual(["逻辑", "证据", "切题", "反驳", "一致", "说服"]);
    expect(board.rows[0]).toMatchObject({ leftScore: 2, rightScore: 8 });
  });

  it("falls back to stacked cards when only one side was scored", () => {
    const board = buildSceneViewModel(sceneWith({ scoreItems: [scoreItem("proposer", 7)] }), 0).score;
    expect(board.kind).toBe("stack");
    if (board.kind !== "stack") return;
    expect(board.cards).toHaveLength(1);
    expect(board.cards[0].rows).toHaveLength(6);
  });

  it("tracks progress across the whole video, not just the current round", () => {
    const video = videoWith([sceneWith({ durationInFrames: 300 }), sceneWith({ durationInFrames: 300 })]);
    const first = buildFooterModel(video, 0, 150);
    const second = buildFooterModel(video, 1, 150);
    expect(second.progress).toBeGreaterThan(first.progress);
    expect(second.elapsed).toBe("00:20");
    expect(second.total).toBe("00:30");
    expect(buildFooterModel(video, 0, 0).ticks).toHaveLength(1);
  });

  it("summarises wins and average scores on the outro", () => {
    const video = videoWith([
      sceneWith({ winner: "opposer", scoreItems: [scoreItem("proposer", 4), scoreItem("opposer", 8)] }),
      sceneWith({ winner: "opposer", scoreItems: [scoreItem("proposer", 6), scoreItem("opposer", 9)] }),
    ]);
    const outro = buildOutroModel(video);
    expect(outro.sides.map((side) => [side.label, side.average, side.wins])).toEqual([
      ["正方", 5, 0],
      ["反方", 8.5, 2],
    ]);
  });

  it("keeps the header topic inside the space left by the round stepper", () => {
    const video = videoWith([sceneWith({})]);
    const header = buildHeaderModel({ ...video, topic: "很长的辩题".repeat(20) }, video.scenes[0], 0);
    expect(header.topic.endsWith("…")).toBe(true);
    expect(header.stepper.kind).toBe("pills");
    expect(buildRoundStepper(20, 4).kind).toBe("bar");
  });
});
