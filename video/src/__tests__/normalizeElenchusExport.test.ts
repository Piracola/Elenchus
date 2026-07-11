import { describe, expect, it } from "vitest";

import { buildVideoModel } from "../normalizeElenchusExport";
import type { AudioManifest, ElenchusExport } from "../types";
import { buildVideoScript } from "../videoScript";

const raw: ElenchusExport = {
  topic: "时间轴测试",
  participants: ["proposer", "opposer"],
  dialogue_history: [
    {
      role: "proposer",
      agent_name: "正方辩手",
      turn: 0,
      content: "第一句陈述观点。第二句补充依据。第三句作出结论。".repeat(18),
    },
  ],
};

describe("buildVideoModel audio manifest v2", () => {
  it("uses millisecond cues as the authoritative timeline", () => {
    const script = buildVideoScript(raw, "detailed");
    const segments = script.rounds[0].speakerSegments;
    const durationMs = segments.length * 1000;
    const manifest: AudioManifest = {
      schemaVersion: 2,
      provider: "edge",
      scriptHash: script.scriptHash,
      durationMs,
      sessionAudioFile: "audio/session.mp3",
      scenes: [
        {
          id: script.rounds[0].id,
          roundIndex: 0,
          audioFile: "audio/turn-1.mp3",
          durationFrames: 9999,
          durationMs,
          startMs: 0,
          endMs: durationMs,
          cues: segments.map((segment, index) => ({
            segmentId: segment.id,
            chunkId: `${segment.id}-chunk`,
            startMs: index * 1000,
            endMs: (index + 1) * 1000,
            audioFile: `audio/chunks/${segment.id}.mp3`,
          })),
        },
      ],
    };

    const model = buildVideoModel(raw, {}, manifest, script);
    expect(model.scenes[0].durationInFrames).toBe(segments.length * 30);
    expect(model.scenes[0].speakerLines[0].startFrame).toBe(0);
    expect(model.scenes[0].speakerLines.at(-1)?.endFrame).toBe(segments.length * 30);
    expect(model.scenes[0].audioFile).toBe("audio/turn-1.mp3");
  });

  it("ignores audio generated for a different script", () => {
    const script = buildVideoScript(raw);
    const manifest: AudioManifest = {
      schemaVersion: 2,
      provider: "edge",
      scriptHash: "different-script",
      durationMs: 1000,
      sessionAudioFile: "audio/session.mp3",
      scenes: [{ id: script.rounds[0].id, roundIndex: 0, audioFile: "audio/stale.mp3", durationMs: 1000, startMs: 0, endMs: 1000, cues: [] }],
    };
    const model = buildVideoModel(raw, {}, manifest, script);
    expect(model.scenes[0].audioFile).toBeUndefined();
  });
});
