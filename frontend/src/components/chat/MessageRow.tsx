import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useSettingsStore } from '../../stores/settingsStore';
import { getMessageFontTokens } from '../../config/display';
import type { DialogueEntry } from '../../types';
import { splitLeadingThinkingContent } from '../../utils/chat/thinkingContent';
import RoundInsights from './RoundInsights';
import type { InsightSection } from './RoundInsights';
import { MessageMarkdown } from './messageRow/MarkdownRenderer';
import { ScoreGrid } from './messageRow/ScoreGrid';
import { markdownBodyStyle, messageContentWrapperStyle } from './messageRow/contentStyles';
import {
    collapseButtonLabel,
    collapseButtonStyle,
    collapseButtonSymbol,
    collapseButtonTitle,
    formatCollapsedHint,
    formatTurnPill,
    getAgentVisual,
    getJudgeVisual,
    STATIC_MOTION_PROPS,
} from './messageRow/shared';
import { ThinkingBlock } from './messageRow/ThinkingBlock';

function renderUnsupportedParamsNotice(entry?: DialogueEntry | null) {
    const message = entry?.metadata?.unsupported_request_parameters?.message;
    if (!message) {
        return null;
    }

    return (
        <div
            style={{
                marginBottom: '12px',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--accent-amber-alpha)',
                background: 'var(--accent-amber-alpha)',
                color: 'var(--text-secondary)',
                fontSize: '12px',
                lineHeight: 1.55,
            }}
        >
            <strong style={{ fontWeight: 700 }}>参数提示：</strong>
            {message}
        </div>
    );
}

export interface MessageRowProps {
    agentEntry?: DialogueEntry | null;
    judgeEntry?: DialogueEntry | null;
    systemEntry?: DialogueEntry | null;
    highlightAgent?: boolean;
    highlightJudge?: boolean;
    highlightSystem?: boolean;
    insightSections?: InsightSection[];
    animated?: boolean;
    agentCollapsed?: boolean;
    onToggleAgentCollapsed?: () => void;
    agentModel?: string;
}

function MessageRow({
    agentEntry,
    judgeEntry,
    systemEntry,
    highlightAgent = false,
    highlightJudge = false,
    highlightSystem = false,
    insightSections = [],
    animated = false,
    agentCollapsed = false,
    onToggleAgentCollapsed,
    agentModel,
}: MessageRowProps) {
    const neutralColor = 'var(--color-neutral, #6b7280)';
    const rowFocused = highlightAgent || highlightJudge || highlightSystem;
    const agentText = agentEntry?.content || '';
    const judgeText = judgeEntry?.content || '';
    const agentVisual = useMemo(() => getAgentVisual(agentEntry), [agentEntry]);
    const judgeVisual = useMemo(() => getJudgeVisual(judgeEntry), [judgeEntry]);
    const agentContent = useMemo(() => splitLeadingThinkingContent(agentText), [agentText]);
    const judgeContent = useMemo(() => splitLeadingThinkingContent(judgeText), [judgeText]);
    const messageFontSize = useSettingsStore((state) => state.displaySettings.messageFontSize ?? 15);
    const messageFontSizes = useMemo(() => getMessageFontTokens(messageFontSize).message, [messageFontSize]);
    const agentTurnLabel = formatTurnPill(agentEntry?.turn);
    const collapsedHint = formatCollapsedHint(agentEntry);

    const agentAccentColor = agentVisual.color;
    const badgeTextColor = '#fff';

    if (systemEntry) {
        if (systemEntry.role === 'audience') {
            return (
                <div
                    data-row-focused={rowFocused ? 'true' : 'false'}
                    style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}
                >
                    <motion.div
                        {...(animated
                            ? { initial: { opacity: 0, y: 6, scale: 0.95 }, animate: { opacity: 1, y: 0, scale: 1 } }
                            : STATIC_MOTION_PROPS)}
                        style={{
                            padding: '12px 24px',
                            background: 'var(--bg-card)',
                            borderRadius: 'var(--radius-xl)',
                            maxWidth: '70%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            boxShadow: 'var(--shadow-md), 0 2px 8px rgba(107, 114, 128, 0.15)',
                            border: highlightSystem ? '1px solid var(--accent-indigo)' : '1px solid transparent',
                        }}
                    >
                        <span
                            style={{
                                fontSize: '12px',
                                color: neutralColor,
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                                padding: '4px 10px',
                                background: 'rgba(107, 114, 128, 0.12)',
                                borderRadius: 'var(--radius-full)',
                            }}
                        >
                            观众介入
                        </span>
                        <span style={{ fontSize: messageFontSizes.audienceBody, color: 'var(--text-primary)', lineHeight: 1.65 }}>
                            {systemEntry.content}
                        </span>
                    </motion.div>
                </div>
            );
        }

        return (
            <div
                data-row-focused={rowFocused ? 'true' : 'false'}
                style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}
            >
                <motion.div
                    {...(animated
                        ? { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 } }
                        : STATIC_MOTION_PROPS)}
                    style={{
                        padding: '10px 20px',
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-full)',
                        fontSize: messageFontSizes.systemBody,
                        color: 'var(--text-muted)',
                        boxShadow: 'var(--shadow-xs)',
                        border: highlightSystem ? '1px solid var(--accent-indigo)' : '1px solid transparent',
                    }}
                >
                    {systemEntry.content}
                </motion.div>
            </div>
        );
    }

    if (!agentEntry && !judgeEntry) return null;

    const judgeOnly = Boolean(judgeEntry && !agentEntry);
    // Only a speech-plus-verdict row claims the wider two-column span; a lone
    // card keeps the plain reading measure.

    // 正方/反方消息卡片（统一头部行样式）
    const agentCard = agentEntry ? (
        <motion.div
            {...(animated
                ? { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4 } }
                : STATIC_MOTION_PROPS)}
            style={{
                position: 'relative',
                background: 'var(--surface)',
                padding: 'var(--space-4) var(--space-6) var(--space-5)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-hairline)',
                // No elevation and no edge marker: a 3px bar bending around the
                // corner radius read as a defect. Role identity is carried by the
                // avatar and the name label instead.
                boxShadow: 'none',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    marginBottom: '10px',
                    minWidth: 0,
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '9px',
                        minWidth: 0,
                        flexWrap: 'wrap',
                    }}
                >
                    <motion.div
                        {...(animated ? { whileHover: { scale: 1.04 } } : STATIC_MOTION_PROPS)}
                        style={{
                            width: '32px',
                            height: '32px',
                            background: agentAccentColor,
                            borderRadius: 'var(--radius-sm)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: badgeTextColor,
                            fontWeight: 700,
                            fontSize: 'var(--text-sm)',
                            flexShrink: 0,
                        }}
                    >
                        {agentVisual.badge}
                    </motion.div>
                    <span
                        style={{
                            fontSize: '13px',
                            color: 'var(--text-primary)',
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {agentVisual.label}
                    </span>
                    {agentTurnLabel && (
                        <span
                            style={{
                                fontSize: '11px',
                                color: 'var(--text-muted)',
                                background: 'var(--bg-tertiary)',
                                padding: '3px 8px',
                                borderRadius: 'var(--radius-full)',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {agentTurnLabel}
                        </span>
                    )}
                    {agentModel && (
                        <span
                            style={{
                                fontSize: '11px',
                                color: 'var(--text-muted)',
                                background: 'var(--bg-tertiary)',
                                padding: '3px 8px',
                                borderRadius: 'var(--radius-full)',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {agentModel}
                        </span>
                    )}
                </div>
                <motion.button
                    type="button"
                    onClick={onToggleAgentCollapsed}
                    whileTap={{ scale: 0.98 }}
                    style={collapseButtonStyle(agentCollapsed)}
                    title={collapseButtonTitle(agentCollapsed)}
                >
                    <span>{collapseButtonSymbol(agentCollapsed)}</span>
                    <span>{collapseButtonLabel(agentCollapsed)}</span>
                </motion.button>
            </div>

            {/* 消息内容 */}
            <div>
                {renderUnsupportedParamsNotice(agentEntry)}
                {agentCollapsed ? (
                    <div data-agent-content="collapsed" style={{
                        color: 'var(--text-secondary)',
                        fontSize: messageFontSizes.body,
                        lineHeight: 1.7,
                        padding: '14px 16px',
                        borderRadius: 'var(--radius-lg)',
                        border: `1px dashed ${agentAccentColor}`,
                    }}>
                        {collapsedHint}
                    </div>
                ) : (
                    <div data-agent-content="visible" style={messageContentWrapperStyle('10px')}>
                        <ThinkingBlock
                            content={agentContent.thinking}
                            accentColor={agentAccentColor}
                            fontSize={messageFontSizes.body}
                            textColor="var(--text-primary)"
                        />
                        {agentContent.response && (
                            <div
                                className="markdown-body"
                                style={markdownBodyStyle(messageFontSizes.body, 'var(--text-primary)')}
                            >
                                <MessageMarkdown text={agentContent.response} />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    ) : null;

    // 裁判消息卡片
    const judgeCard = judgeEntry ? (
        <motion.div
            {...(animated
                ? {
                    initial: { opacity: 0, y: 16 },
                    animate: { opacity: 1, y: 0 },
                    transition: { duration: 0.4, delay: agentEntry ? 0.1 : 0 },
                }
                : STATIC_MOTION_PROPS)}
            style={{
                background: 'var(--surface-muted)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-hairline)',
                overflow: 'hidden',
                boxShadow: 'none',
            }}
        >
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: 'var(--space-2)',
                padding: 'var(--space-3) var(--space-4) var(--space-2)',
            }}>
                <motion.div
                    {...(animated ? { whileHover: { scale: 1.04 } } : STATIC_MOTION_PROPS)}
                    style={{
                        width: '26px',
                        height: '26px',
                        background: 'transparent',
                        border: `1px solid ${judgeVisual.color}`,
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: judgeVisual.color,
                        fontWeight: 700,
                        fontSize: 'var(--text-xs)',
                        flexShrink: 0,
                    }}
                >
                    {judgeVisual.badge}
                </motion.div>
                <span style={{
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                }}>
                    {judgeVisual.label}
                </span>
            </div>

            {agentCollapsed ? (
                <div style={{
                    padding: '14px 16px',
                    color: 'var(--text-muted)',
                    fontSize: messageFontSizes.judgeBodyCompact,
                    fontStyle: 'italic',
                }}>
                    裁判评分已折叠
                </div>
            ) : (
                <div style={{ padding: '0 14px 12px' }}>
                <div style={messageContentWrapperStyle('10px')}>
                    <ThinkingBlock
                        content={judgeContent.thinking}
                        accentColor="var(--color-judge)"
                        fontSize={judgeOnly ? messageFontSizes.judgeBody : messageFontSizes.judgeBodyCompact}
                        textColor="var(--text-secondary)"
                    />
                    {judgeContent.response && (
                        <div
                            className="markdown-body"
                            style={markdownBodyStyle(
                                judgeOnly ? messageFontSizes.judgeBody : messageFontSizes.judgeBodyCompact,
                                'var(--text-secondary)',
                            )}
                        >
                            <MessageMarkdown text={judgeContent.response} />
                        </div>
                    )}
                </div>

                <ScoreGrid judgeEntry={judgeEntry} animated={animated} />
                </div>
            )}
        </motion.div>
    ) : null;

    return (
        <div
            data-row-focused={rowFocused ? 'true' : 'false'}
            style={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                gap: 'var(--space-3)',
                marginBottom: 'var(--space-8)',
                background: rowFocused ? 'var(--accent-indigo-alpha)' : 'transparent',
                transition: 'background var(--transition-fast)',
            }}
        >
            <RoundInsights sections={insightSections} />

            {/* Speech left, verdict right, filling the width the user picked.
                The verdict column is a clamped percentage rather than a fixed
                fraction, so a wider page gives the speech proportionally more —
                the verdict's content does not grow with the viewport. The empty
                column is held open on speech-only rows so the speech does not
                resize when its verdict lands. */}
            <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 'var(--space-5)',
                    width: '100%',
                    alignItems: 'flex-start',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        flex: '1 1 var(--transcript-speech-min)',
                        minWidth: 0,
                    }}
                >
                    {agentCard}
                </div>
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        flex: '0 1 var(--transcript-verdict-column)',
                        minWidth: 0,
                    }}
                >
                    {judgeCard}
                </div>
            </div>
        </div>
    );
}

function sectionsEqual(previous?: InsightSection[], next?: InsightSection[]): boolean {
    if (previous === next) return true;
    if (!previous || !next) return previous === next;
    if (previous.length !== next.length) return false;

    for (let index = 0; index < previous.length; index += 1) {
        const previousSection = previous[index];
        const nextSection = next[index];
        if (
            previousSection.key !== nextSection.key
            || previousSection.title !== nextSection.title
            || previousSection.accent !== nextSection.accent
            || previousSection.entries.length !== nextSection.entries.length
        ) {
            return false;
        }

        for (let entryIndex = 0; entryIndex < previousSection.entries.length; entryIndex += 1) {
            if (previousSection.entries[entryIndex] !== nextSection.entries[entryIndex]) {
                return false;
            }
        }
    }

    return true;
}

function areEqual(previous: MessageRowProps, next: MessageRowProps): boolean {
    return previous.agentEntry === next.agentEntry
        && previous.judgeEntry === next.judgeEntry
        && previous.systemEntry === next.systemEntry
        && previous.highlightAgent === next.highlightAgent
        && previous.highlightJudge === next.highlightJudge
        && previous.highlightSystem === next.highlightSystem
        && previous.animated === next.animated
        && previous.agentCollapsed === next.agentCollapsed
        && previous.agentModel === next.agentModel
        && sectionsEqual(previous.insightSections, next.insightSections);
}

export default memo(MessageRow, areEqual);
