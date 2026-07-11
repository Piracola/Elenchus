import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { createCanvas, loadImage } from "@napi-rs/canvas";

const rootDir = process.cwd();
const publicDir = join(rootDir, "public");
const dataDir = join(publicDir, "data");
const ffprobePath = join(rootDir, "node_modules", "@remotion", "compositor-win32-x64-msvc", "ffprobe.exe");

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const session = readJson(join(dataDir, "session-export.json"));
const script = readJson(join(dataDir, "video-script.json"));
const manifest = readJson(join(dataDir, "session-audio.json"));
const ttsState = readJson(join(dataDir, "tts-state.json"));

assert.equal(manifest.schemaVersion, 2);
assert.equal(manifest.scriptHash, script.scriptHash, "音频清单与脚本哈希不一致");
assert.equal(ttsState.scriptHash, script.scriptHash, "TTS 状态与脚本哈希不一致");
assert.equal(ttsState.status, "completed", "TTS 顶层状态尚未完成");
assert.equal(ttsState.ttsSignature, manifest.ttsSignature, "TTS 状态与音频清单配置签名不一致");
// scriptHash already proves script identity. Use the audio manifest timestamp
// for freshness because each render command may rewrite an identical script.
const renderSources = [
  "src/DebateVideo.tsx",
  "src/normalizeElenchusExport.ts",
  "src/scenePresentation.ts",
  "src/videoScript.ts",
  "src/types.ts",
  "scripts/fast-render.mjs",
];
const sourceMtime = Math.max(
  statSync(join(dataDir, "session-audio.json")).mtimeMs,
  ...renderSources.map((relative) => statSync(join(rootDir, relative)).mtimeMs),
);

for (const round of script.rounds) {
  for (const speech of round.speeches) {
    const sourceIndex = Number(speech.id.split("-").at(-1));
    assert.equal(speech.content, String(session.dialogue_history[sourceIndex]?.content ?? ""), `${speech.id} 未保留完整原文`);
    assert.equal(speech.segments.map((segment) => segment.text).join(""), speech.displayContent, `${speech.id} 的 segment 不可逆`);
  }
}

const inspect = (file) => {
  assert.equal(existsSync(file), true, `缺少媒体文件：${file}`);
  const result = spawnSync(ffprobePath, [
    "-v", "error",
    "-show_entries", "stream=codec_type,duration",
    "-show_entries", "format=duration",
    "-of", "json",
    file,
  ], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, `FFprobe 失败：${file}\n${result.stderr}`);
  return JSON.parse(result.stdout);
};

const statesById = new Map(Object.values(ttsState.chunks || {}).map((chunk) => [chunk.id, chunk]));
let cueCount = 0;
for (const scene of manifest.scenes) {
  let cursor = scene.startMs;
  for (const cue of scene.cues) {
    assert.equal(cue.startMs, cursor, `${cue.chunkId} 与前一 cue 不连续`);
    assert.ok(cue.endMs > cue.startMs, `${cue.chunkId} 时长无效`);
    const state = statesById.get(cue.chunkId);
    assert.ok(state, `${cue.chunkId} 缺少 TTS 状态`);
    assert.equal(state.status, "completed", `${cue.chunkId} 尚未完成`);
    assert.equal(state.segmentId, cue.segmentId, `${cue.chunkId} 的 segmentId 不一致`);
    const info = inspect(join(publicDir, cue.audioFile));
    assert.ok(info.streams.some((stream) => stream.codec_type === "audio"), `${cue.chunkId} 没有音频流`);
    cursor = cue.endMs;
    cueCount += 1;
  }
  assert.equal(cursor, scene.endMs, `${scene.id} cue 未覆盖整轮音频`);
  inspect(join(publicDir, scene.audioFile));
}
assert.equal(manifest.scenes.at(-1)?.endMs, manifest.durationMs, "scene 未覆盖整场音频");
inspect(join(publicDir, manifest.sessionAudioFile));

for (const file of [join(rootDir, "out", "debate.mp4"), join(rootDir, "out", "debate-fast.mp4")]) {
  assert.ok(statSync(file).mtimeMs >= sourceMtime, `${file} 早于当前脚本或音频清单`);
  const info = inspect(file);
  const video = info.streams.find((stream) => stream.codec_type === "video");
  const audio = info.streams.find((stream) => stream.codec_type === "audio");
  assert.ok(video && audio, `${file} 必须同时包含视频流和音频流`);
  assert.ok(Math.abs(Number(video.duration) - Number(audio.duration)) <= 0.5, `${file} 音视频时长差超过 500ms`);
}

const imageFiles = [
  "out/verification/final/remotion-speaker.png",
  "out/verification/final/remotion-judge.png",
  "out/verification/final/remotion-score.png",
  "out/fast/frames/scene-001-segment-001.png",
  "out/fast/frames/scene-001-segment-004.png",
  "out/fast/frames/scene-001-segment-005.png",
];
for (const relative of imageFiles) {
  assert.ok(statSync(join(rootDir, relative)).mtimeMs >= sourceMtime, `${relative} 早于当前脚本或音频清单`);
  const image = await loadImage(join(rootDir, relative));
  assert.equal(image.width / image.height, 16 / 9, `${relative} 不是 16:9`);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const colors = new Set();
  for (let y = 0; y < image.height; y += Math.max(1, Math.floor(image.height / 12))) {
    for (let x = 0; x < image.width; x += Math.max(1, Math.floor(image.width / 20))) {
      colors.add(Array.from(context.getImageData(x, y, 1, 1).data).join(","));
    }
  }
  assert.ok(colors.size >= 5, `${relative} 疑似空白画面`);
}

console.log(`产物验收通过：${script.rounds.length} 轮，${cueCount} 个 cue，2 份双流 MP4，6 张关键帧。`);
