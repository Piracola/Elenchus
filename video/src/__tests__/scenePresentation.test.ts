import { describe, expect, it } from "vitest";

import { activeLineIndexAtFrame, buildSceneSlices, computeSpeakerLayout, fitTextLine } from "../scenePresentation";
import type { LineCue } from "../types";

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

  it("uses one fast-render slice for all lines in the same segment", () => {
    const sameSegment = [
      { ...line("a", 0, 20), segmentId: "segment-1" },
      { ...line("b", 20, 40), segmentId: "segment-1" },
      { ...line("c", 40, 60), segmentId: "segment-2" },
    ];
    expect(buildSceneSlices(sameSegment, 60)).toHaveLength(2);
  });

  it("uses one stable slice for scenes without speech", () => {
    expect(buildSceneSlices([], 120)).toEqual([{ activeIndex: -1, startFrame: 0, endFrame: 120 }]);
  });

  it("keeps the active line visually dominant", () => {
    const layout = computeSpeakerLayout(lines, 1);
    expect(layout.items[1].state).toBe("active");
    expect(layout.items[0].state).toBe("past");
    expect(layout.items[2].state).toBe("future");
  });

  it("uses one deterministic ellipsis for Canvas and Remotion", () => {
    const fitted = fitTextLine("中英文 mixed content that is too long", 10);
    expect(fitted).toBe(fitTextLine("中英文 mixed content that is too long", 10));
    expect(fitted.endsWith("…")).toBe(true);
    expect(fitted.length).toBeLessThan("中英文 mixed content that is too long".length);
    expect(fitTextLine("短文本", 10)).toBe("短文本");
  });
});
