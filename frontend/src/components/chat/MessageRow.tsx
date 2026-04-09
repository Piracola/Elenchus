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

    // 根据正方/反方设置颜色
    const isProposer = agentVisual.label === '正方' || agentEntry?.role === 'proposer';
    const badgeColor = '#fff';
    const badgeBg = isProposer ? '#22c55e' : '#ef4444';

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
    const agentOnly = Boolean(agentEntry && !judgeEntry);

    // 正方/反方消息卡片（统一头部行样式）
    const agentCard = agentEntry ? (
        <motion.div
            {...(animated
                ? { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4 } }
                : STATIC_MOTION_PROPS)}
            style={{
                position: 'relative',
                background: 'var(--bg-card)',
                padding: '20px 28px 28px 28px',
                borderRadius: 'var(--radius-xl)',
                boxShadow: '0 2px 12px rgba(224, 224, 224, 0.5)',
            }}
        >
            {/* 统一头部行：头像 + 身份 + 轮数 + 模型 + 折叠按钮 居中对齐 */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    marginBottom: '12px',
                }}
            >
                <motion.div
                    {...(animated ? { whileHover: { scale: 1.05 } } : STATIC_MOTION_PROPS)}
                    style={{
                        width: '36px',
                        height: '36px',
                        background: badgeBg,
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: badgeColor,
                        fontWeight: 700,
                        fontSize: '15px',
                        boxShadow: '0 2px 8px rgba(224, 224, 224, 0.6)',
                        flexShrink: 0,
                    }}
                >
                    {agentVisual.badge}
                </motion.div>
                <span
                    style={{
                        fontSize: '13px',
                        color: '#333333',
                        border: '1px solid #CCCCCC',
                        padding: '5px 12px',
                        borderRadius: 'var(--radius-full)',
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                    }}
                >
                    {agentVisual.label}
                </span>
                {agentTurnLabel && (
                    <span
                        style={{
                            fontSize: '12px',
                            color: 'var(--text-muted)',
                            background: 'var(--bg-tertiary)',
                            padding: '4px 10px',
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
                <button
                    type="button"
                    onClick={onToggleAgentCollapsed}
                    style={collapseButtonStyle(agentCollapsed)}
                    title={collapseButtonTitle(agentCollapsed)}
                >
                    <span>{collapseButtonSymbol(agentCollapsed)}</span>
                    <span>{collapseButtonLabel(agentCollapsed)}</span>
                </button>
            </div>

            {/* 消息内容 */}
            <div>
                {agentCollapsed ? (
                    <div data-agent-content="collapsed" style={{
                        color: 'var(--text-secondary)',
                        fontSize: messageFontSizes.body,
                        lineHeight: 1.7,
                        padding: '14px 16px',
                        borderRadius: 'var(--radius-lg)',
                        border: `2px dashed ${badgeBg}`,
                    }}>
                        {collapsedHint}
                    </div>
                ) : (
                    <div data-agent-content="visible" style={messageContentWrapperStyle('16px')}>
                        <ThinkingBlock
                            content={agentContent.thinking}
                            accentColor={badgeColor}
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
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                overflow: 'hidden',
                boxShadow: '0 2px 12px rgba(224, 224, 224, 0.5)',
            }}
        >
            {/* 裁判头部栏 */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '14px 16px 10px 16px',
                background: 'var(--bg-card)',
            }}>
                <motion.div
                    {...(animated ? { whileHover: { scale: 1.05 } } : STATIC_MOTION_PROPS)}
                    style={{
                        width: '36px',
                        height: '36px',
                        background: '#d97706',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '15px',
                        boxShadow: '0 2px 8px rgba(224, 224, 224, 0.6)',
                        flexShrink: 0,
                    }}
                >
                    {judgeVisual.badge}
                </motion.div>
                <span style={{
                    fontSize: '13px',
                    color: '#333333',
                    border: '1px solid #CCCCCC',
                    padding: '5px 12px',
                    borderRadius: 'var(--radius-full)',
                    fontWeight: 500,
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
                <div style={{ padding: '0px 16px 12px 16px' }}>
                <div style={messageContentWrapperStyle('12px')}>
                    <ThinkingBlock
                        content={judgeContent.thinking}
                        accentColor="#d97706"
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
                gap: '12px',
                marginBottom: '24px',
                background: rowFocused ? 'rgba(99, 102, 241, 0.05)' : 'transparent',
                transition: 'background var(--transition-fast)',
            }}
        >
            <RoundInsights sections={insightSections} />

            {agentEntry && judgeEntry && (
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'row',
                        width: '100%',
                        gap: '20px',
                    }}
                >
                    <div style={{ flex: '6 1 0', display: 'flex', flexDirection: 'column' }}>
                        {agentCard}
                    </div>
                    <div style={{ flex: '4 1 0', display: 'flex', flexDirection: 'column' }}>
                        {judgeCard}
                    </div>
                </div>
            )}

            {agentOnly && (
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'row',
                        width: '100%',
                        gap: '20px',
                    }}
                >
                    <div style={{ flex: '6 1 0', display: 'flex', flexDirection: 'column' }}>
                        {agentCard}
                    </div>
                    <div style={{ flex: '4 1 0' }} />
                </div>
            )}

            {judgeOnly && (
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'row',
                        width: '100%',
                        gap: '20px',
                    }}
                >
                    <div style={{ flex: '6 1 0' }} />
                    <div style={{ flex: '4 1 0', display: 'flex', flexDirection: 'column' }}>
                        {judgeCard}
                    </div>
                </div>
            )}
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
