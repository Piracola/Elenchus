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

import { DebateScene, DebateVideoModel, DebateVideoProps } from "./types";
import {
  BOOKEND_TYPE,
  buildFooterModel,
  buildHeaderModel,
  buildIntroModel,
  buildOutroModel,
  buildSceneViewModel,
  CARD_RADIUS,
  formatScore,
  formatScoreFixed,
  HEADER_TYPE,
  INTRO_LAYOUT,
  JUDGE_BOARD,
  OUTRO_LAYOUT,
  SCENE_COLORS,
  SCENE_LAYOUT,
  SCORE_BOARD,
  SPEAKER_BOARD,
  type BookendSide,
  type HeaderModel,
  type JudgeBoard,
  type ScoreBoard,
  type SceneViewModel,
  VIDEO_FONT_FAMILY,
} from "./scenePresentation";

const colors = SCENE_COLORS;
const fontFamily = VIDEO_FONT_FAMILY;

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

const rectStyle = (rect: { x: number; y: number; width: number; height: number }) => ({
  left: rect.x,
  top: rect.y,
  width: rect.width,
  height: rect.height,
});

const useEntrance = () => {
  const frame = useCurrentFrame();
  return interpolate(frame, [0, 22], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
};

const PageShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      background: `linear-gradient(180deg, ${colors.background} 0%, ${colors.backgroundEdge} 100%)`,
      color: colors.ink,
      fontFamily,
      letterSpacing: 0,
    }}
  >
    {children}
  </AbsoluteFill>
);

const Card: React.FC<{
  rect: { x: number; y: number; width: number; height: number };
  accent?: string;
  active?: boolean;
  children: React.ReactNode;
}> = ({ rect, accent, active = false, children }) => (
  <div
    style={{
      position: "absolute",
      ...rectStyle(rect),
      boxSizing: "border-box",
      borderRadius: CARD_RADIUS,
      background: colors.panel,
      border: `1px solid ${active && accent ? accent : colors.faint}`,
      boxShadow: active
        ? `0 0 0 3px ${accent}1a, 0 20px 40px rgba(23,34,43,0.07)`
        : "0 20px 40px rgba(23,34,43,0.06)",
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

const CardTitle: React.FC<{
  title: string;
  height: number;
  paddingX: number;
  accent: string;
  right?: React.ReactNode;
}> = ({ title, height, paddingX, accent, right }) => (
  <div
    style={{
      height,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 14,
      padding: `0 ${paddingX}px`,
      borderBottom: `1px solid ${colors.hairline}`,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 4, height: 18, borderRadius: 2, background: accent }} />
      <div style={{ fontSize: 22, fontWeight: 700, color: colors.ink }}>{title}</div>
    </div>
    {right}
  </div>
);

const Header: React.FC<{ model: HeaderModel }> = ({ model }) => {
  const { stepper } = model;
  return (
    <div
      style={{
        position: "absolute",
        ...rectStyle(SCENE_LAYOUT.header),
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 48,
      }}
    >
      <div>
        <div
          style={{
            color: colors.score,
            fontSize: HEADER_TYPE.kickerFontSize,
            fontWeight: 700,
            letterSpacing: HEADER_TYPE.kickerLetterSpacing,
            lineHeight: 1.2,
            marginBottom: 12,
          }}
        >
          {model.kicker}
        </div>
        <div style={{ fontSize: HEADER_TYPE.topicFontSize, fontWeight: 700, lineHeight: 1.15 }}>
          {model.topic}
        </div>
      </div>
      <div style={{ textAlign: "right", paddingBottom: 4 }}>
        <div
          style={{
            fontSize: HEADER_TYPE.metaFontSize,
            fontWeight: 600,
            color: colors.muted,
            lineHeight: 1.2,
            marginBottom: 14,
          }}
        >
          {model.stepper.label} · {model.timelineLabel}
        </div>
        <div style={{ display: "flex", gap: HEADER_TYPE.pillGap, justifyContent: "flex-end" }}>
          {stepper.kind === "pills" ? (
            Array.from({ length: stepper.total }, (_, index) => (
              <div
                key={index}
                style={{
                  width: index === stepper.index ? HEADER_TYPE.pillActiveWidth : HEADER_TYPE.pillWidth,
                  height: HEADER_TYPE.pillHeight,
                  borderRadius: 999,
                  background:
                    index === stepper.index
                      ? colors.score
                      : index < stepper.index
                        ? "rgba(63,95,143,0.32)"
                        : colors.faint,
                }}
              />
            ))
          ) : (
            <div
              style={{
                width: HEADER_TYPE.barWidth,
                height: HEADER_TYPE.pillHeight,
                borderRadius: 999,
                background: colors.faint,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${((stepper.index + 1) / stepper.total) * 100}%`,
                  height: "100%",
                  background: colors.score,
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const SpeakerCard: React.FC<{ view: SceneViewModel }> = ({ view }) => {
  const { speaker } = view;
  const fade = `linear-gradient(180deg, transparent 0px, #000 ${SPEAKER_BOARD.fadeHeight}px, #000 calc(100% - ${SPEAKER_BOARD.fadeHeight}px), transparent 100%)`;
  return (
    <Card rect={SCENE_LAYOUT.speaker}>
      <CardTitle
        title="辩手发言"
        height={SPEAKER_BOARD.titleHeight}
        paddingX={SPEAKER_BOARD.paddingX}
        accent={speaker.speaker?.theme.accent ?? colors.muted}
        right={
          speaker.speaker ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: speaker.speaker.theme.accent,
                }}
              />
              <div style={{ fontSize: 21, fontWeight: 700, color: speaker.speaker.theme.text }}>
                {speaker.speaker.label}
              </div>
              {speaker.speaker.detail ? (
                <div style={{ fontSize: 18, fontWeight: 500, color: colors.muted }}>
                  {speaker.speaker.detail}
                </div>
              ) : null}
            </div>
          ) : null
        }
      />
      {speaker.empty ? (
        <EmptyState
          text="本轮没有辩手发言。"
          height={SCENE_LAYOUT.speaker.height - SPEAKER_BOARD.titleHeight}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            left: speaker.rect.x - SCENE_LAYOUT.speaker.x,
            top: speaker.rect.y - SCENE_LAYOUT.speaker.y,
            width: speaker.rect.width,
            height: speaker.rect.height,
            overflow: "hidden",
            maskImage: fade,
            WebkitMaskImage: fade,
          }}
        >
          {speaker.blocks.map((block) => (
            <div
              key={block.id}
              style={{
                position: "absolute",
                left: 0,
                top: block.top + speaker.scrollOffset,
                width: speaker.rect.width,
                height: block.height,
                borderRadius: 8,
                background: block.state === "active" ? `${block.theme.accent}0f` : "transparent",
                opacity: block.opacity,
              }}
            >
              {block.state === "active" ? (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: SPEAKER_BOARD.blockPaddingY,
                    width: SPEAKER_BOARD.railWidth,
                    height: block.height - SPEAKER_BOARD.blockPaddingY * 2,
                    borderRadius: 999,
                    background: block.theme.accent,
                  }}
                />
              ) : null}
              <div
                style={{
                  position: "absolute",
                  left: SPEAKER_BOARD.blockTextLeft,
                  top: SPEAKER_BOARD.blockPaddingY,
                  width: speaker.textWidth,
                  color: block.theme.text,
                  fontSize: speaker.fontSize,
                  lineHeight: `${speaker.lineHeightPx}px`,
                  fontWeight: block.fontWeight,
                  whiteSpace: "pre",
                }}
              >
                {block.lines.map((text, index) => (
                  <div key={`${block.id}-${index}`}>{text}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

const JudgeCard: React.FC<{ board: JudgeBoard }> = ({ board }) => (
  <Card rect={SCENE_LAYOUT.judge} accent={colors.judge} active={board.active}>
    <CardTitle
      title="裁判评议"
      height={JUDGE_BOARD.titleHeight}
      paddingX={JUDGE_BOARD.paddingX}
      accent={colors.judge}
    />
    <div style={{ padding: `${JUDGE_BOARD.paddingTop}px ${JUDGE_BOARD.paddingX}px 0` }}>
      {board.winner ? (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: JUDGE_BOARD.chipGap,
            height: JUDGE_BOARD.chipHeight,
            padding: `0 ${JUDGE_BOARD.chipPaddingX}px`,
            borderRadius: 999,
            background: board.winner.theme.soft,
            color: board.winner.theme.text,
            fontSize: JUDGE_BOARD.chipFontSize,
            fontWeight: 700,
            marginBottom: JUDGE_BOARD.chipMarginBottom,
          }}
        >
          <span style={{ color: colors.muted, fontWeight: 600 }}>本轮胜方</span>
          {board.winner.label}
        </div>
      ) : (
        <div
          style={{
            height: JUDGE_BOARD.chipHeight,
            display: "flex",
            alignItems: "center",
            color: colors.muted,
            fontSize: JUDGE_BOARD.chipFontSize,
            fontWeight: 600,
            marginBottom: JUDGE_BOARD.chipMarginBottom,
          }}
        >
          本轮未判定胜方
        </div>
      )}
      {board.empty ? (
        <div style={{ color: colors.muted, fontSize: JUDGE_BOARD.fontSize, fontWeight: 500 }}>
          本轮暂无裁判评议。
        </div>
      ) : (
        <div
          style={{
            color: colors.inkSoft,
            fontSize: JUDGE_BOARD.fontSize,
            lineHeight: JUDGE_BOARD.lineHeight,
            whiteSpace: "pre",
          }}
        >
          {board.lines.map((line, index) => (
            <div key={`${index}-${line}`}>{line}</div>
          ))}
        </div>
      )}
    </div>
  </Card>
);

const ScoreBar: React.FC<{ value: number | null; accent: string; align: "left" | "right" }> = ({
  value,
  accent,
  align,
}) => (
  <div
    style={{
      width: SCORE_BOARD.barWidth,
      height: SCORE_BOARD.barHeight,
      borderRadius: 999,
      background: colors.faint,
      display: "flex",
      justifyContent: align === "right" ? "flex-end" : "flex-start",
      overflow: "hidden",
    }}
  >
    <div
      style={{
        width: `${Math.max(0, Math.min(10, value ?? 0)) * 10}%`,
        height: "100%",
        borderRadius: 999,
        background: accent,
      }}
    />
  </div>
);

const ScoreCard: React.FC<{ board: ScoreBoard }> = ({ board }) => {
  const active = board.kind !== "empty" && board.active;
  return (
    <Card rect={SCENE_LAYOUT.score} accent={colors.score} active={active}>
      <CardTitle
        title="本轮评分"
        height={SCORE_BOARD.titleHeight}
        paddingX={SCORE_BOARD.paddingX}
        accent={colors.score}
        right={<div style={{ fontSize: 16, fontWeight: 600, color: colors.muted }}>综合分 / 10</div>}
      />
      {board.kind === "empty" ? (
        <EmptyState text="本轮暂未记录评分。" height={SCENE_LAYOUT.score.height - SCORE_BOARD.titleHeight} />
      ) : board.kind === "versus" ? (
        <div style={{ padding: `${SCORE_BOARD.paddingTop}px ${SCORE_BOARD.paddingX}px 0` }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "flex-end" }}>
            <SideScore side={board.left} align="left" />
            <div
              style={{
                width: 34,
                textAlign: "center",
                fontSize: 15,
                fontWeight: 700,
                color: colors.muted,
                paddingBottom: 10,
              }}
            >
              VS
            </div>
            <SideScore side={board.right} align="right" />
          </div>
          <div
            style={{
              display: "flex",
              height: SCORE_BOARD.splitBarHeight,
              borderRadius: 999,
              overflow: "hidden",
              marginTop: SCORE_BOARD.splitBarMarginTop,
              background: colors.faint,
            }}
          >
            <div style={{ width: `${board.leftShare * 100}%`, background: board.left.theme.accent }} />
            <div style={{ flex: 1, background: board.right.theme.accent }} />
          </div>
          <div style={{ marginTop: SCORE_BOARD.rowsMarginTop }}>
            {board.rows.map((row) => (
              <div
                key={row.key}
                style={{
                  height: SCORE_BOARD.rowHeight,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: SCORE_BOARD.rowGap,
                }}
              >
                <div
                  style={{
                    width: SCORE_BOARD.valueWidth,
                    textAlign: "right",
                    fontSize: 14,
                    fontWeight: 700,
                    color: board.left.theme.text,
                  }}
                >
                  {formatScore(row.leftScore)}
                </div>
                <ScoreBar value={row.leftScore} accent={board.left.theme.accent} align="right" />
                <div
                  style={{
                    width: SCORE_BOARD.dimensionLabelWidth,
                    textAlign: "center",
                    fontSize: 15,
                    fontWeight: 600,
                    color: colors.muted,
                  }}
                >
                  {row.label}
                </div>
                <ScoreBar value={row.rightScore} accent={board.right.theme.accent} align="left" />
                <div
                  style={{
                    width: SCORE_BOARD.valueWidth,
                    fontSize: 14,
                    fontWeight: 700,
                    color: board.right.theme.text,
                  }}
                >
                  {formatScore(row.rightScore)}
                </div>
              </div>
            ))}
          </div>
          {board.comment ? (
            <div
              style={{
                marginTop: SCORE_BOARD.commentMarginTop,
                borderTop: `1px solid ${colors.hairline}`,
                paddingTop: SCORE_BOARD.commentPaddingTop,
              }}
            >
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: board.comment.theme.text,
                  lineHeight: 1.2,
                  marginBottom: SCORE_BOARD.commentTitleGap,
                }}
              >
                {board.comment.label}总评
              </div>
              <div
                style={{
                  color: colors.muted,
                  fontSize: SCORE_BOARD.commentFontSize,
                  lineHeight: SCORE_BOARD.commentLineHeight,
                  whiteSpace: "pre",
                }}
              >
                {board.comment.lines.map((line, index) => (
                  <div key={`${index}-${line}`}>{line}</div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div style={{ padding: `16px ${SCORE_BOARD.paddingX}px 0` }}>
          {board.cards.map((card) => (
            <div key={card.role} style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <div style={{ fontSize: 19, fontWeight: 700, color: card.theme.text }}>{card.label}</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: card.theme.accent, lineHeight: 1 }}>
                  {formatScoreFixed(card.score)}
                </div>
              </div>
              {card.rows.map((row) => (
                <div
                  key={row.key}
                  style={{ height: SCORE_BOARD.rowHeight, display: "flex", alignItems: "center", gap: 8 }}
                >
                  <div style={{ width: SCORE_BOARD.dimensionLabelWidth, fontSize: 15, color: colors.muted }}>
                    {row.label}
                  </div>
                  <div style={{ flex: 1 }}>
                    <ScoreBar value={row.score} accent={card.theme.accent} align="left" />
                  </div>
                  <div
                    style={{
                      width: SCORE_BOARD.valueWidth,
                      textAlign: "right",
                      fontSize: 14,
                      fontWeight: 700,
                      color: card.theme.text,
                    }}
                  >
                    {formatScore(row.score)}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

const SideScore: React.FC<{
  side: { label: string; score: number | null; theme: { accent: string; text: string } };
  align: "left" | "right";
}> = ({ side, align }) => (
  <div style={{ textAlign: align }}>
    <div
      style={{
        fontSize: SCORE_BOARD.sideLabelFontSize,
        fontWeight: 700,
        color: side.theme.text,
        lineHeight: 1.2,
        marginBottom: SCORE_BOARD.sideLabelGap,
      }}
    >
      {side.label}
    </div>
    <div
      style={{
        fontSize: SCORE_BOARD.sideScoreFontSize,
        fontWeight: 700,
        color: side.theme.accent,
        lineHeight: 1,
      }}
    >
      {formatScoreFixed(side.score)}
    </div>
  </div>
);

const EmptyState: React.FC<{ text: string; height: number }> = ({ text, height }) => (
  <div
    style={{
      height,
      display: "grid",
      placeItems: "center",
      color: colors.muted,
      fontSize: 20,
      fontWeight: 500,
    }}
  >
    {text}
  </div>
);

const Footer: React.FC<{ video: DebateVideoModel; sceneIndex: number; frame: number }> = ({
  video,
  sceneIndex,
  frame,
}) => {
  const model = buildFooterModel(video, sceneIndex, frame);
  return (
    <>
      <div
        style={{
          position: "absolute",
          ...rectStyle(SCENE_LAYOUT.footerLabel),
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          color: colors.muted,
          fontSize: 17,
          fontWeight: 600,
        }}
      >
        <span>{model.elapsed}</span>
        <span>{model.total}</span>
      </div>
      <div
        style={{
          position: "absolute",
          ...rectStyle(SCENE_LAYOUT.footer),
          borderRadius: 999,
          background: colors.faint,
          overflow: "hidden",
        }}
      >
        <div style={{ width: `${model.progress * 100}%`, height: "100%", background: colors.score }} />
        {model.ticks.map((tick) => (
          <div
            key={tick}
            style={{
              position: "absolute",
              left: `${tick * 100}%`,
              top: 0,
              width: 2,
              height: "100%",
              background: colors.background,
            }}
          />
        ))}
      </div>
    </>
  );
};

const RoundSceneView: React.FC<{
  scene: DebateScene;
  video: DebateVideoModel;
  sceneIndex: number;
}> = ({ scene, video, sceneIndex }) => {
  const frame = useCurrentFrame();
  const enter = useEntrance();
  const view = React.useMemo(() => buildSceneViewModel(scene, frame), [scene, frame]);
  const header = React.useMemo(() => buildHeaderModel(video, scene, sceneIndex), [video, scene, sceneIndex]);

  return (
    <PageShell>
      <div style={{ position: "absolute", inset: 0, opacity: enter }}>
        <Header model={header} />
        <SpeakerCard view={view} />
        <JudgeCard board={view.judge} />
        <ScoreCard board={view.score} />
        <Footer video={video} sceneIndex={sceneIndex} frame={frame} />
      </div>
      {scene.audioFile ? <Audio src={staticFile(scene.audioFile)} /> : null}
    </PageShell>
  );
};

const BookendKicker: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      color: colors.score,
      fontSize: BOOKEND_TYPE.kickerFontSize,
      fontWeight: 700,
      letterSpacing: BOOKEND_TYPE.kickerLetterSpacing,
      lineHeight: 1.2,
      textAlign: "center",
    }}
  >
    {text}
  </div>
);

const BookendTopic: React.FC<{ lines: string[]; fontSize: number; lineHeight: number }> = ({
  lines,
  fontSize,
  lineHeight,
}) => (
  <div style={{ textAlign: "center", fontSize, fontWeight: 700, lineHeight }}>
    {lines.map((line, index) => (
      <div key={`${index}-${line}`}>{line}</div>
    ))}
  </div>
);

const SidePanel: React.FC<{
  side: BookendSide;
  width: number;
  height: number;
  children?: React.ReactNode;
}> = ({ side, width, height, children }) => (
  <div
    style={{
      width,
      height,
      boxSizing: "border-box",
      borderRadius: CARD_RADIUS,
      background: colors.panel,
      border: `1px solid ${colors.faint}`,
      borderTop: `${BOOKEND_TYPE.sideAccentHeight}px solid ${side.theme.accent}`,
      boxShadow: "0 20px 40px rgba(23,34,43,0.06)",
      display: "grid",
      placeItems: "center",
      alignContent: "center",
      gap: BOOKEND_TYPE.sideGapY,
    }}
  >
    <div style={{ fontSize: BOOKEND_TYPE.sideLabelFontSize, fontWeight: 700, lineHeight: 1.2, color: side.theme.text }}>
      {side.label}
    </div>
    {side.detail ? (
      <div style={{ fontSize: BOOKEND_TYPE.sideDetailFontSize, lineHeight: 1.2, color: colors.muted }}>{side.detail}</div>
    ) : null}
    {children}
  </div>
);

const BookendStat: React.FC<{ label: string; value: string; accent: string }> = ({ label, value, accent }) => (
  <div style={{ width: BOOKEND_TYPE.statColumnWidth, textAlign: "center" }}>
    <div
      style={{
        fontSize: BOOKEND_TYPE.statLabelFontSize,
        color: colors.muted,
        lineHeight: 1.2,
        marginBottom: BOOKEND_TYPE.statLabelGap,
      }}
    >
      {label}
    </div>
    <div style={{ fontSize: BOOKEND_TYPE.statValueFontSize, fontWeight: 700, lineHeight: 1.2, color: accent }}>{value}</div>
  </div>
);

const IntroFrame: React.FC<{ video: DebateVideoModel }> = ({ video }) => {
  const enter = useEntrance();
  const model = React.useMemo(() => buildIntroModel(video), [video]);
  return (
    <PageShell>
      {video.introAudioFile ? <Audio src={staticFile(video.introAudioFile)} /> : null}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: enter,
          transform: `translateY(${interpolate(enter, [0, 1], [22, 0])}px)`,
        }}
      >
        <div style={{ position: "absolute", top: INTRO_LAYOUT.kickerY, left: 0, right: 0 }}>
          <BookendKicker text={model.kicker} />
        </div>
        <div style={{ position: "absolute", top: INTRO_LAYOUT.topicY, left: 160, right: 160 }}>
          <BookendTopic
            lines={model.topicLines}
            fontSize={INTRO_LAYOUT.topicFontSize}
            lineHeight={INTRO_LAYOUT.topicLineHeight}
          />
        </div>
        <div
          style={{
            position: "absolute",
            top: INTRO_LAYOUT.sideY,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: INTRO_LAYOUT.sideGap,
          }}
        >
          {model.sides[0] ? (
            <SidePanel side={model.sides[0]} width={INTRO_LAYOUT.sideWidth} height={INTRO_LAYOUT.sideHeight} />
          ) : null}
          <div
            style={{
              width: BOOKEND_TYPE.vsWidth,
              textAlign: "center",
              fontSize: BOOKEND_TYPE.vsFontSize,
              fontWeight: 700,
              color: colors.muted,
              letterSpacing: BOOKEND_TYPE.vsLetterSpacing,
            }}
          >
            VS
          </div>
          {model.sides[1] ? (
            <SidePanel side={model.sides[1]} width={INTRO_LAYOUT.sideWidth} height={INTRO_LAYOUT.sideHeight} />
          ) : null}
        </div>
        <div
          style={{
            position: "absolute",
            top: INTRO_LAYOUT.metaY,
            left: 0,
            right: 0,
            textAlign: "center",
            color: colors.muted,
            fontSize: BOOKEND_TYPE.metaFontSize,
            lineHeight: 1.2,
          }}
        >
          {model.meta}
        </div>
      </div>
    </PageShell>
  );
};

const OutroFrame: React.FC<{ video: DebateVideoModel }> = ({ video }) => {
  const enter = useEntrance();
  const model = React.useMemo(() => buildOutroModel(video), [video]);
  return (
    <PageShell>
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: enter,
          transform: `translateY(${interpolate(enter, [0, 1], [18, 0])}px)`,
        }}
      >
        <div style={{ position: "absolute", top: OUTRO_LAYOUT.kickerY, left: 0, right: 0 }}>
          <BookendKicker text={model.kicker} />
        </div>
        <div style={{ position: "absolute", top: OUTRO_LAYOUT.topicY, left: 160, right: 160 }}>
          <BookendTopic
            lines={model.topicLines}
            fontSize={OUTRO_LAYOUT.topicFontSize}
            lineHeight={OUTRO_LAYOUT.topicLineHeight}
          />
        </div>
        <div
          style={{
            position: "absolute",
            top: OUTRO_LAYOUT.sideY,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: OUTRO_LAYOUT.sideGap,
          }}
        >
          {model.sides.map((side) => (
            <SidePanel
              key={side.role}
              side={side}
              width={OUTRO_LAYOUT.sideWidth}
              height={OUTRO_LAYOUT.sideHeight}
            >
              <div
                style={{
                  display: "flex",
                  gap: BOOKEND_TYPE.statGap,
                  marginTop: BOOKEND_TYPE.statMarginTop,
                }}
              >
                <BookendStat label="均分" value={formatScoreFixed(side.average)} accent={side.theme.accent} />
                <BookendStat label="胜出" value={`${side.wins} 轮`} accent={side.theme.accent} />
              </div>
            </SidePanel>
          ))}
        </div>
        <div
          style={{
            position: "absolute",
            top: OUTRO_LAYOUT.metaY,
            left: 0,
            right: 0,
            textAlign: "center",
            color: colors.muted,
            fontSize: BOOKEND_TYPE.metaFontSize,
            lineHeight: 1.2,
          }}
        >
          {model.meta}
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
          <AbsoluteFill style={{ display: "grid", placeItems: "center", fontSize: 32, fontWeight: 700 }}>
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
        {video.scenes.map((scene, sceneIndex) => (
          <Series.Sequence key={scene.id} durationInFrames={scene.durationInFrames}>
            <RoundSceneView scene={scene} video={video} sceneIndex={sceneIndex} />
          </Series.Sequence>
        ))}
        <Series.Sequence durationInFrames={video.outroFrames}>
          <OutroFrame video={video} />
        </Series.Sequence>
      </Series>
    </>
  );
};
