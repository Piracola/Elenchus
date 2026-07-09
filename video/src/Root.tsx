import { Composition, CalculateMetadataFunction, staticFile } from "remotion";

import { DebateVideo } from "./DebateVideo";
import { buildVideoModel } from "./normalizeElenchusExport";
import {
  AudioManifest,
  DebateVideoInputSchema,
  DebateVideoProps,
  ElenchusExport,
  FPS,
  VideoScript,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
} from "./types";

const defaultProps: DebateVideoProps = {
  dataFile: "data/session-export.json",
  sourceName: "sample",
};

const filenameFromTopic = (topic: string): string => {
  const compact = topic
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 48);
  return compact ? `elenchus-${compact}` : "elenchus-debate";
};

const loadExport = async (dataFile: string): Promise<ElenchusExport> => {
  const response = await fetch(staticFile(dataFile));
  if (!response.ok) {
    throw new Error(`无法读取导出 JSON：${dataFile}`);
  }
  return (await response.json()) as ElenchusExport;
};

const loadVideoScript = async (scriptFile?: string): Promise<VideoScript | undefined> => {
  if (!scriptFile) {
    return undefined;
  }
  try {
    const response = await fetch(staticFile(scriptFile));
    if (!response.ok) {
      return undefined;
    }
    return (await response.json()) as VideoScript;
  } catch {
    return undefined;
  }
};

const loadAudioManifest = async (audioManifest?: string): Promise<AudioManifest | undefined> => {
  if (!audioManifest) {
    return undefined;
  }
  try {
    const response = await fetch(staticFile(audioManifest));
    if (!response.ok) {
      return undefined;
    }
    return (await response.json()) as AudioManifest;
  } catch {
    return undefined;
  }
};

const calculateMetadata: CalculateMetadataFunction<DebateVideoProps> = async ({ props }) => {
  const raw = await loadExport(props.dataFile);
  const script = await loadVideoScript(props.scriptFile);
  const audioManifest = await loadAudioManifest(props.audioManifest);
  const video = buildVideoModel(raw, props, audioManifest, script);

  return {
    durationInFrames: video.durationInFrames,
    fps: video.fps,
    width: video.width,
    height: video.height,
    defaultOutName: filenameFromTopic(video.topic),
    props: {
      ...props,
      video,
    },
  };
};

export const RemotionRoot = () => {
  return (
    <Composition
      id="DebateTranscript"
      component={DebateVideo}
      durationInFrames={300}
      fps={FPS}
      width={VIDEO_WIDTH}
      height={VIDEO_HEIGHT}
      defaultProps={defaultProps}
      schema={DebateVideoInputSchema}
      calculateMetadata={calculateMetadata}
    />
  );
};
