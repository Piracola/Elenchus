import React from "react";
import {
  AbsoluteFill,
  Audio,
  cancelRender,
  continueRender,
  delayRender,
  Easing,
  interpolate,
  Series,
  staticFile,
  useCurrentFrame,
} from "remotion";

import {
  DebateScene,
  DebateVideoModel,
  DebateVideoProps,
  ScoreItem,
} from "./types";
import {
  buildSceneViewModel,
  SCENE_COLORS,
  SCENE_LAYOUT,
  type SceneViewModel,
  VIDEO_FONT_FAMILY,
} from "./scenePresentation";

const fontFamily = VIDEO_FONT_FAMILY;

const colors = {
  ...SCENE_COLORS,
  proposer: SCENE_COLORS.affirmative,
  proposerSoft: SCENE_COLORS.affirmativeSoft,
  opposer: SCENE_COLORS.negative,
  opposerSoft: SCENE_COLORS.negativeSoft,
};

const BundledFontLoader: React.FC = () => {
  const [handle] = React.useState(() => delayRender("加载项目中文字体"));
  React.useEffect(() => {
    const load = async () => {
      const faces = [
        new FontFace("Noto Sans Hans", `url(${staticFile("fonts/NotoSansHans-Regular.otf")})`, { weight: "400" }),
        new FontFace("Noto Sans Hans", `url(${staticFile("fonts/NotoSansHans-Bold.otf")})`, { weight: "700" }),
      ];
      for (const face of faces) {
        document.fonts.add(await face.load());
      }
    };
    load().then(() => continueRender(handle)).catch((error) => cancelRender(error));
  }, [handle]);
  return null;
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

const participantLabel = (role: string): string => {
  if (role === "proposer") return "正方";
  if (role === "opposer") return "反方";
  if (role === "judge") return "裁判";
  return role;
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
            <span>{video.participants.map(participantLabel).join(" vs ")}</span>
            <span>·</span>
            <span>裁判评议</span>
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
            title="参与方"
            text={video.participants.map(participantLabel).join(" · ") || "正方 · 反方"}
            accent={colors.proposer}
          />
          <IntroCard
            title="视频时长"
            text={`约 ${Math.max(1, Math.ceil(video.durationInFrames / video.fps / 60))} 分钟`}
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
  const enter = useEntrance();
  const view = React.useMemo(() => buildSceneViewModel(scene, frame), [scene, frame]);
  const progress = interpolate(frame, [0, scene.durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <PageShell>
      <div style={{ position: "absolute", inset: 0, opacity: enter }}>
        <header
          style={{
            position: "absolute",
            left: SCENE_LAYOUT.header.x,
            top: SCENE_LAYOUT.header.y,
            width: SCENE_LAYOUT.header.width,
            height: SCENE_LAYOUT.header.height,
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
            <div style={{ color: colors.muted, fontSize: 18, fontWeight: 750 }}>
              {video.timelineKind === "estimated" ? "预估时间轴" : "真实音频时间轴"}
            </div>
            <div style={{ fontSize: 30, fontWeight: 860 }}>{scene.totalChars.toLocaleString()} 字</div>
          </div>
        </header>

        <div style={{ position: "absolute", ...rectStyle(SCENE_LAYOUT.speaker) }}>
          <SpeakerColumn view={view} />
        </div>
        <div style={{ position: "absolute", ...rectStyle(SCENE_LAYOUT.judge) }}>
          <JudgePanel view={view} />
        </div>
        <div style={{ position: "absolute", ...rectStyle(SCENE_LAYOUT.score) }}>
          <ScorePanel view={view} />
        </div>

        {scene.audioFile ? <Audio src={staticFile(scene.audioFile)} /> : null}

        <footer
          style={{
            position: "absolute",
            left: 72,
            right: 72,
            bottom: 34,
            height: 16,
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

const rectStyle = (rect: { x: number; y: number; width: number; height: number }) => ({
  left: rect.x,
  top: rect.y,
  width: rect.width,
  height: rect.height,
});

const ColumnShell: React.FC<{
  title: string;
  subtitle: string;
  accent: string;
  children: React.ReactNode;
  compact?: boolean;
  active?: boolean;
}> = ({ title, subtitle, accent, children, compact = false, active = false }) => {
  return (
    <section
      style={{
        minHeight: 0,
        display: "grid",
        gridTemplateRows: compact ? "52px 1fr" : "68px 1fr",
        borderRadius: 8,
        height: "100%",
        background: active ? `${accent}12` : colors.panel,
        border: `2px solid ${active ? accent : colors.faint}`,
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

const SpeakerColumn: React.FC<{ view: SceneViewModel }> = ({ view }) => {
  return (
    <ColumnShell title="辩手发言" subtitle="歌词式高亮" accent={colors.proposer}>
      <div style={{ position: "relative", minHeight: 0, height: "100%", overflow: "hidden" }}>
        {view.speakerLines.length === 0 ? (
          <EmptyState text="本轮没有辩手发言。" />
        ) : (
          <div style={{ position: "absolute", inset: 0, padding: "18px 22px" }}>
            {view.speakerLines.map(({ cue: line, displayText, state, style }) => {
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
                    {displayText}
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

const JudgePanel: React.FC<{ view: SceneViewModel }> = ({ view }) => {
  const active = view.activeRole === "judge" || view.activeSegmentKind === "judge_summary";
  return (
    <ColumnShell title="裁判消息" subtitle="评语摘要" accent={colors.judge} compact active={active}>
      <div style={{ position: "relative", minHeight: 0, height: "100%", overflow: "hidden" }}>
        {view.judgeLines.length === 0 ? (
          <EmptyState text="本轮暂无裁判消息。" compact />
        ) : (
          <div style={{ padding: "14px 18px", color: colors.ink, fontSize: 22, lineHeight: "35px" }}>
            {view.judgeLines.map((line, index) => <div key={`${index}-${line}`}>{line}</div>)}
          </div>
        )}
      </div>
    </ColumnShell>
  );
};

const ScorePanel: React.FC<{ view: SceneViewModel }> = ({ view }) => {
  const active = view.activeSegmentKind === "score_comment";
  return (
    <ColumnShell title="评分" subtitle="综合分" accent={colors.score} compact active={active}>
      <div style={{ position: "relative", minHeight: 0, height: "100%", overflow: "hidden" }}>
        {view.scoreCards.length === 0 ? (
          <EmptyState text="本轮暂未记录评分。" compact />
        ) : (
          <div style={{ padding: "12px 14px" }}>
            {view.scoreCards.map((item) => (
              <CompactScoreCard key={item.role} item={item} />
            ))}
          </div>
        )}
      </div>
    </ColumnShell>
  );
};

const CompactScoreCard: React.FC<{ item: ScoreItem & { commentLines: string[]; displayDimensions: ScoreItem["dimensions"] } }> = ({ item }) => {
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
      {item.commentLines.length ? (
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
          {item.commentLines.map((line, index) => <div key={`${index}-${line}`}>{line}</div>)}
        </div>
      ) : null}
      <div style={{ display: "grid", gap: 5 }}>
        {item.displayDimensions.map((dimension) => (
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
            共 {video.scenes.length} 轮辩论，感谢观看。
          </div>
        </div>
      </div>
    </PageShell>
  );
};

export const DebateVideo: React.FC<DebateVideoProps> = ({ video }) => {
  if (!video) {
    return (
      <>
        <BundledFontLoader />
        <PageShell>
          <AbsoluteFill style={{ display: "grid", placeItems: "center", fontSize: 34, fontWeight: 820 }}>
            正在读取 Elenchus 导出 JSON...
          </AbsoluteFill>
        </PageShell>
      </>
    );
  }

  return (
    <>
      <BundledFontLoader />
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
    </>
  );
};
