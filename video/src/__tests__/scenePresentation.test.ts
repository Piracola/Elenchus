import { describe, expect, it } from "vitest";

import {
  activeLineIndexAtFrame,
  buildSceneSlices,
  buildSceneViewModel,
  computeSpeakerLayout,
  fitTextLine,
  SCENE_LAYOUT,
  wrapTextLinesToWidth,
} from "../scenePresentation";
import type { DebateScene, LineCue } from "../types";

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
});
