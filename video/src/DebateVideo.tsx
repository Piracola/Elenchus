import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  interpolate,
  Series,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import {
  DebateScene,
  DebateVideoModel,
  DebateVideoProps,
  LineCue,
  ScoreItem,
  TextItem,
} from "./types";

const fontFamily =
  '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Source Han Sans SC", Arial, sans-serif';

const colors = {
  background: "#f5f7f8",
  ink: "#1f2933",
  muted: "#6b7280",
  faint: "#d8dee5",
  panel: "#ffffff",
  panelSoft: "#eef3f4",
  proposer: "#2f7d68",
  proposerSoft: "#e5f2ee",
  opposer: "#a04a5b",
  opposerSoft: "#f7e8eb",
  judge: "#8a6a2f",
  judgeSoft: "#f4eddd",
  score: "#405f8f",
  scoreSoft: "#e8eef8",
};

const clampText = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength).trim()}...`;
};

const roleAccent = (role: string): { accent: string; soft: string; label: string } => {
  if (role === "proposer") {
    return { accent: colors.proposer, soft: colors.proposerSoft, label: "正方" };
  }
  if (role === "opposer") {
    return { accent: colors.opposer, soft: colors.opposerSoft, label: "反方" };
  }
  if (role === "judge") {
    return { accent: colors.judge, soft: colors.judgeSoft, label: "裁判" };
  }
  return { accent: colors.score, soft: colors.scoreSoft, label: "评分" };
};

const formatScore = (score: number | null): string => {
  if (score === null) {
    return "-";
  }
  return Number.isInteger(score) ? `${score}` : score.toFixed(1);
};

const useEntrance = () => {
  const frame = useCurrentFrame();
  return interpolate(frame, [0, 22], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
};

const PageShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <AbsoluteFill
      style={{
        background: colors.background,
        color: colors.ink,
        fontFamily,
        letterSpacing: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(135deg, rgba(47,125,104,0.08), transparent 34%), linear-gradient(315deg, rgba(64,95,143,0.08), transparent 38%)",
        }}
      />
      <div style={{ position: "relative", width: "100%", height: "100%" }}>{children}</div>
    </AbsoluteFill>
  );
};

const IntroFrame: React.FC<{ video: DebateVideoModel }> = ({ video }) => {
  const enter = useEntrance();
  return (
    <PageShell>
      <div
        style={{
          display: "grid",
          gridTemplateRows: "1fr auto",
          height: "100%",
          padding: 72,
          opacity: enter,
          transform: `translateY(${interpolate(enter, [0, 1], [26, 0])}px)`,
        }}
      >
        <div style={{ alignSelf: "center" }}>
          <div
            style={{
              color: colors.score,
              fontSize: 26,
              fontWeight: 800,
              marginBottom: 28,
            }}
          >
            Elenchus 视频辩论记录
          </div>
          <div
            style={{
              maxWidth: 1340,
              fontSize: 64,
              fontWeight: 850,
              lineHeight: 1.2,
            }}
          >
            {video.topic}
          </div>
          <div
            style={{
              display: "flex",
              gap: 16,
              marginTop: 36,
              fontSize: 25,
              color: colors.muted,
            }}
          >
            <span>{video.scenes.length} 轮</span>
            <span>·</span>
            <span>歌词式发言高亮</span>
            <span>·</span>
            <span>裁判与评分侧边摘要</span>
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2.5fr 1fr",
            gap: 20,
          }}
        >
          <IntroCard
            title="辩手发言"
            text="当前发言行高亮放大，已读与未读行淡化缩小，按句 snap 切换，便于跟随阅读。"
            accent={colors.proposer}
          />
          <IntroCard
            title="裁判与评分"
            text="右侧窄边栏只保留评语摘要和核心分数，避免喧宾夺主。"
            accent={colors.score}
          />
        </div>
      </div>
    </PageShell>
  );
};

const IntroCard: React.FC<{ title: string; text: string; accent: string }> = ({ title, text, accent }) => {
  return (
    <div
      style={{
        minHeight: 124,
        padding: "24px 26px",
        borderRadius: 8,
        background: colors.panel,
        border: `2px solid ${colors.faint}`,
        boxShadow: "0 18px 45px rgba(31,41,51,0.08)",
      }}
    >
      <div style={{ color: accent, fontSize: 24, fontWeight: 850, marginBottom: 12 }}>{title}</div>
      <div style={{ color: colors.muted, fontSize: 22, lineHeight: 1.55 }}>{text}</div>
    </div>
  );
};

const RoundSceneView: React.FC<{ scene: DebateScene; video: DebateVideoModel }> = ({ scene, video }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = useEntrance();
  const progress = interpolate(frame, [0, scene.durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <PageShell>
      <div
        style={{
          display: "grid",
          gridTemplateRows: "104px 1fr 42px",
          gap: 18,
          height: "100%",
          padding: "42px 48px 34px",
          opacity: enter,
          transform: `translateY(${interpolate(enter, [0, 1], [18, 0])}px)`,
        }}
      >
        <header
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 24,
            alignItems: "center",
            padding: "0 4px",
          }}
        >
          <div>
            <div style={{ color: colors.score, fontSize: 24, fontWeight: 850, marginBottom: 8 }}>
              {scene.turnLabel}
            </div>
            <div
              style={{
                fontSize: 34,
                fontWeight: 820,
                lineHeight: 1.25,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {video.topic}
            </div>
          </div>
          <div
            style={{
              minWidth: 210,
              padding: "13px 18px",
              borderRadius: 8,
              background: colors.panel,
              border: `2px solid ${colors.faint}`,
              textAlign: "right",
            }}
          >
            <div style={{ color: colors.muted, fontSize: 18, fontWeight: 750 }}>本轮文本量</div>
            <div style={{ fontSize: 30, fontWeight: 860 }}>{scene.totalChars.toLocaleString()} 字</div>
          </div>
        </header>

        <main
          style={{
            display: "grid",
            gridTemplateColumns: "4fr 1fr",
            gap: 22,
            minHeight: 0,
          }}
        >
          <SpeakerColumn scene={scene} frame={frame} fps={fps} />
          <InfoColumn scene={scene} />
        </main>

        {scene.audioFile ? <Audio src={staticFile(scene.audioFile)} /> : null}

        <footer
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 999,
            background: "#e4e9ee",
          }}
        >
          <div
            style={{
              width: `${progress * 100}%`,
              height: "100%",
              background: "linear-gradient(90deg, #2f7d68, #a04a5b, #405f8f)",
            }}
          />
        </footer>
      </div>
    </PageShell>
  );
};

const ColumnShell: React.FC<{
  title: string;
  subtitle: string;
  accent: string;
  children: React.ReactNode;
  compact?: boolean;
}> = ({ title, subtitle, accent, children, compact = false }) => {
  return (
    <section
      style={{
        minHeight: 0,
        display: "grid",
        gridTemplateRows: compact ? "52px 1fr" : "68px 1fr",
        borderRadius: 8,
        background: colors.panel,
        border: `2px solid ${colors.faint}`,
        boxShadow: "0 18px 45px rgba(31,41,51,0.08)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 14,
          padding: compact ? "12px 16px" : "16px 20px",
          borderBottom: `2px solid ${colors.faint}`,
        }}
      >
        <div style={{ color: accent, fontSize: compact ? 20 : 24, fontWeight: 850 }}>{title}</div>
        <div style={{ color: colors.muted, fontSize: compact ? 14 : 17, fontWeight: 700 }}>{subtitle}</div>
      </div>
      {children}
    </section>
  );
};

const activeLineStyle = {
  headerHeight: 20,
  headerMargin: 6,
  fontSize: 38,
  lineHeight: 1.45,
  marginBottom: 26,
  opacity: 1,
  fontWeight: 820,
};

const pastLineStyle = {
  headerHeight: 14,
  headerMargin: 4,
  fontSize: 21,
  lineHeight: 1.45,
  marginBottom: 14,
  opacity: 0.45,
  fontWeight: 600,
};

const futureLineStyle = {
  headerHeight: 14,
  headerMargin: 4,
  fontSize: 19,
  lineHeight: 1.45,
  marginBottom: 12,
  opacity: 0.22,
  fontWeight: 520,
};

const lineStyleForState = (state: "active" | "past" | "future") => {
  if (state === "active") return activeLineStyle;
  if (state === "past") return pastLineStyle;
  return futureLineStyle;
};

const computeLyricLayout = (lines: LineCue[], activeIndex: number) => {
  const items: Array<{ top: number; textCenter: number; state: "active" | "past" | "future" }> = [];
  let top = 0;
  for (let i = 0; i < lines.length; i++) {
    const state: "active" | "past" | "future" =
      i === activeIndex ? "active" : i < activeIndex ? "past" : "future";
    const style = lineStyleForState(state);
    const headerTop = top;
    const textTop = headerTop + style.headerHeight + style.headerMargin;
    const textCenter = textTop + (style.fontSize * style.lineHeight) / 2;
    const blockHeight = textTop + style.fontSize * style.lineHeight + style.marginBottom - top;
    items.push({ top, textCenter, state });
    top += blockHeight;
  }
  return { items, totalHeight: top };
};

const SpeakerColumn: React.FC<{ scene: DebateScene; frame: number; fps: number }> = ({
  scene,
  frame,
}) => {
  const lines = scene.speakerLines;
  const viewportHeight = 754;
  const transitionFrames = 10;

  const activeIndex = React.useMemo(() => {
    if (lines.length === 0) return -1;
    for (let i = 0; i < lines.length; i++) {
      if (frame >= lines[i].startFrame && frame < lines[i].endFrame) {
        return i;
      }
    }
    if (frame < lines[0].startFrame) return 0;
    return lines.length - 1;
  }, [lines, frame]);

  const previousIndex = React.useMemo(() => {
    if (activeIndex <= 0) return activeIndex;
    const cue = lines[activeIndex];
    const transitionEnd = cue.startFrame + transitionFrames;
    return frame < transitionEnd ? activeIndex - 1 : activeIndex;
  }, [activeIndex, frame, lines]);

  const currentLayout = computeLyricLayout(lines, activeIndex);
  const previousLayout = computeLyricLayout(lines, previousIndex);

  const targetCenter = viewportHeight / 2;
  const currentOffset =
    activeIndex >= 0 ? targetCenter - currentLayout.items[activeIndex].textCenter : 0;
  const previousOffset =
    previousIndex >= 0 ? targetCenter - previousLayout.items[previousIndex].textCenter : currentOffset;

  const isTransitioning = previousIndex !== activeIndex;
  const cue = lines[activeIndex];
  const transitionProgress = isTransitioning
    ? interpolate(
        frame,
        [cue.startFrame, cue.startFrame + transitionFrames],
        [0, 1],
        {
          easing: Easing.bezier(0.22, 1, 0.36, 1),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        },
      )
    : 1;

  const rawOffset = previousOffset + (currentOffset - previousOffset) * transitionProgress;
  const maxOffset = 0;
  const minOffset = viewportHeight - currentLayout.totalHeight;
  const clampedOffset =
    currentLayout.totalHeight <= viewportHeight ? 0 : Math.max(minOffset, Math.min(maxOffset, rawOffset));

  return (
    <ColumnShell title="辩手发言" subtitle="歌词式高亮" accent={colors.proposer}>
      <div style={{ position: "relative", minHeight: 0, height: "100%", overflow: "hidden" }}>
        {lines.length === 0 ? (
          <EmptyState text="本轮没有辩手发言。" />
        ) : (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              transform: `translateY(${clampedOffset}px)`,
              padding: "18px 22px",
            }}
          >
            {lines.map((line, index) => {
              const state = currentLayout.items[index].state;
              const style = lineStyleForState(state);
              const { accent } = roleAccent(line.role);
              const isActive = state === "active";
              return (
                <div
                  key={line.id}
                  style={{
                    marginBottom: style.marginBottom,
                    opacity: style.opacity,
                    borderLeft: isActive ? `4px solid ${accent}` : `3px solid ${accent}44`,
                    paddingLeft: isActive ? 14 : 11,
                  }}
                >
                  <div
                    style={{
                      height: style.headerHeight,
                      marginBottom: style.headerMargin,
                      color: colors.muted,
                      fontSize: isActive ? 15 : 12,
                      fontWeight: 760,
                      lineHeight: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {line.label} · {line.agentName}
                  </div>
                  <div
                    style={{
                      color: colors.ink,
                      fontSize: style.fontSize,
                      lineHeight: style.lineHeight,
                      fontWeight: style.fontWeight,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {line.text}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ColumnShell>
  );
};

const InfoColumn: React.FC<{ scene: DebateScene }> = ({ scene }) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        minHeight: 0,
      }}
    >
      <JudgePanel scene={scene} />
      <ScorePanel scene={scene} />
    </div>
  );
};

const JudgePanel: React.FC<{ scene: DebateScene }> = ({ scene }) => {
  const items = [...scene.judgeItems, ...scene.contextItems];
  return (
    <ColumnShell title="裁判消息" subtitle="评语摘要" accent={colors.judge} compact>
      <div style={{ position: "relative", minHeight: 0, height: "100%", overflow: "hidden" }}>
        {items.length === 0 ? (
          <EmptyState text="本轮暂无裁判消息。" compact />
        ) : (
          <div style={{ padding: "12px 14px" }}>
            {items.map((item) => (
              <CompactTextCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </ColumnShell>
  );
};

const CompactTextCard: React.FC<{ item: TextItem }> = ({ item }) => {
  const { accent, soft } = roleAccent(item.role);
  return (
    <article
      style={{
        marginBottom: 10,
        padding: "10px 12px",
        borderRadius: 6,
        background: soft,
        border: `1px solid ${accent}33`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <div style={{ color: accent, fontSize: 15, fontWeight: 800 }}>{item.label}</div>
        <div style={{ color: colors.muted, fontSize: 12, fontWeight: 700 }}>{item.charCount} 字</div>
      </div>
      <div
        style={{
          color: colors.ink,
          fontSize: 15,
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: 3,
          overflow: "hidden",
        }}
      >
        {item.text}
      </div>
    </article>
  );
};

const ScorePanel: React.FC<{ scene: DebateScene }> = ({ scene }) => {
  return (
    <ColumnShell title="评分" subtitle="综合分" accent={colors.score} compact>
      <div style={{ position: "relative", minHeight: 0, height: "100%", overflow: "hidden" }}>
        {scene.scoreItems.length === 0 ? (
          <EmptyState text="本轮暂未记录评分。" compact />
        ) : (
          <div style={{ padding: "12px 14px" }}>
            {scene.scoreItems.map((item) => (
              <CompactScoreCard key={item.role} item={item} />
            ))}
          </div>
        )}
      </div>
    </ColumnShell>
  );
};

const CompactScoreCard: React.FC<{ item: ScoreItem }> = ({ item }) => {
  const { accent } = roleAccent(item.role);
  return (
    <article style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <div style={{ color: accent, fontSize: 16, fontWeight: 820 }}>{item.label}</div>
        <div style={{ color: accent, fontSize: 28, fontWeight: 900, lineHeight: 1 }}>
          {formatScore(item.comprehensiveScore)}
          <span style={{ color: colors.muted, fontSize: 13, fontWeight: 800 }}>/10</span>
        </div>
      </div>
      {item.overallComment ? (
        <div
          style={{
            color: colors.muted,
            fontSize: 13,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
            overflow: "hidden",
            marginBottom: 8,
          }}
        >
          {item.overallComment}
        </div>
      ) : null}
      <div style={{ display: "grid", gap: 5 }}>
        {item.dimensions.map((dimension) => (
          <div key={dimension.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ color: colors.ink, fontSize: 12, fontWeight: 740, width: 56, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {dimension.label.slice(0, 4)}
            </div>
            <div
              style={{
                flex: 1,
                height: 5,
                overflow: "hidden",
                borderRadius: 999,
                background: "rgba(31,41,51,0.12)",
              }}
            >
              <div
                style={{
                  width: `${Math.max(0, Math.min(10, dimension.score ?? 0)) * 10}%`,
                  height: "100%",
                  background: accent,
                }}
              />
            </div>
            <div style={{ color: accent, fontSize: 12, fontWeight: 780, width: 24, textAlign: "right" }}>
              {formatScore(dimension.score)}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
};

const EmptyState: React.FC<{ text: string; compact?: boolean }> = ({ text, compact = false }) => {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: compact ? 120 : 240,
        borderRadius: 8,
        color: colors.muted,
        background: colors.panelSoft,
        fontSize: compact ? 16 : 22,
        fontWeight: 760,
      }}
    >
      {text}
    </div>
  );
};

const OutroFrame: React.FC<{ video: DebateVideoModel }> = ({ video }) => {
  const enter = useEntrance();
  return (
    <PageShell>
      <div
        style={{
          display: "grid",
          placeItems: "center",
          height: "100%",
          padding: 72,
          opacity: enter,
          transform: `translateY(${interpolate(enter, [0, 1], [22, 0])}px)`,
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 1180 }}>
          <div style={{ color: colors.score, fontSize: 28, fontWeight: 850, marginBottom: 26 }}>
            复盘结束
          </div>
          <div style={{ fontSize: 54, fontWeight: 880, lineHeight: 1.25, marginBottom: 28 }}>
            {video.topic}
          </div>
          <div style={{ color: colors.muted, fontSize: 25, lineHeight: 1.55 }}>
            本视频由 Elenchus 导出 JSON 生成，采用歌词式发言高亮与侧边裁判评分摘要。
          </div>
        </div>
      </div>
    </PageShell>
  );
};

export const DebateVideo: React.FC<DebateVideoProps> = ({ video }) => {
  if (!video) {
    return (
      <PageShell>
        <AbsoluteFill style={{ display: "grid", placeItems: "center", fontSize: 34, fontWeight: 820 }}>
          正在读取 Elenchus 导出 JSON...
        </AbsoluteFill>
      </PageShell>
    );
  }

  return (
    <Series>
      <Series.Sequence durationInFrames={video.introFrames}>
        <IntroFrame video={video} />
      </Series.Sequence>
      {video.scenes.map((scene) => (
        <Series.Sequence key={scene.id} durationInFrames={scene.durationInFrames}>
          <RoundSceneView scene={scene} video={video} />
        </Series.Sequence>
      ))}
      <Series.Sequence durationInFrames={video.outroFrames}>
        <OutroFrame video={video} />
      </Series.Sequence>
    </Series>
  );
};
