import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useSettingsStore } from '../../stores/settingsStore';
import { getMessageFontTokens } from '../../config/display';
import type { DialogueEntry } from '../../types';
import { splitLeadingThinkingContent } from '../../utils/thinkingContent';
import RoundInsights from './RoundInsights';
import type { InsightSection } from './RoundInsights';
import { MessageMarkdown } from './messageRow/MarkdownRenderer';
import { ScoreGrid } from './messageRow/ScoreGrid';
import { markdownBodyStyle, messageContentWrapperStyle } from './messageRow/contentStyles';
import {
    bodyHintStyle,
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
    const badgeColor = isProposer ? 'var(--color-proposer, #4ade80)' : 'var(--color-opposer, #f87171)';
    const badgeBg = isProposer ? 'rgba(74, 222, 128, 0.2)' : 'rgba(248, 113, 113, 0.2)';

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

    // 正方/反方头部：左侧色块 + 信息
    const agentHeader = agentEntry ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <motion.div
                {...(animated ? { whileHover: { scale: 1.05 } } : STATIC_MOTION_PROPS)}
                style={{
                    width: '32px',
                    height: '32px',
                    background: badgeBg,
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: badgeColor,
                    fontWeight: 700,
                    fontSize: '14px',
                    flexShrink: 0,
                }}
            >
                {agentVisual.badge}
            </motion.div>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', flex: 1 }}>
                {agentVisual.label}
                {agentTurnLabel && ` · ${agentTurnLabel}`}
                {agentModel && ` · ${agentModel}`}
            </span>
            {agentCollapsed && <span style={bodyHintStyle()}>{collapsedHint}</span>}
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
    ) : null;

    // 裁判头部：右侧色块
    const judgeHeader = judgeEntry ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {judgeVisual.label}
            </span>
            <motion.div
                {...(animated ? { whileHover: { scale: 1.05 } } : STATIC_MOTION_PROPS)}
                style={{
                    width: '32px',
                    height: '32px',
                    background: 'rgba(251, 191, 36, 0.2)',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#d97706',
                    fontWeight: 700,
                    fontSize: '14px',
                    flexShrink: 0,
                }}
            >
                {judgeVisual.badge}
            </motion.div>
        </div>
    ) : null;

    // 正方/反方消息卡片
    const agentCard = agentEntry ? (
        <motion.div
            {...(animated
                ? { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4 } }
                : STATIC_MOTION_PROPS)}
            style={{
                background: 'var(--bg-secondary)',
                padding: '16px 20px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
            }}
        >
            {agentCollapsed ? (
                <div data-agent-content="collapsed" style={{
                    color: 'var(--text-secondary)',
                    fontSize: messageFontSizes.body,
                    lineHeight: 1.7,
                    padding: '14px 16px',
                    borderRadius: 'var(--radius-lg)',
                    background: 'var(--bg-tertiary)',
                    border: `1px dashed ${badgeColor}`,
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
                padding: judgeOnly ? '16px 20px' : '14px 16px',
                borderRadius: 'var(--radius-md)',
                border: `1px solid var(--border-subtle)`,
            }}
        >
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
                        {agentHeader}
                        {agentCard}
                    </div>
                    <div style={{ flex: '4 1 0', display: 'flex', flexDirection: 'column' }}>
                        {judgeHeader}
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
                        {agentHeader}
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
                        {judgeHeader}
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
