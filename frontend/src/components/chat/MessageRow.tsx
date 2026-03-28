import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useSettingsStore } from '../../stores/settingsStore';
import { DISPLAY_FONT_TOKENS } from '../../config/display';
import type { DialogueEntry } from '../../types';
import { splitLeadingThinkingContent } from '../../utils/thinkingContent';
import RoundInsights from './RoundInsights';
import type { InsightSection } from './RoundInsights';
import { AgentMetaPill } from './messageRow/AgentMetaPill';
import { MessageMarkdown } from './messageRow/MarkdownRenderer';
import { ScoreGrid } from './messageRow/ScoreGrid';
import { markdownBodyStyle, messageContentWrapperStyle } from './messageRow/contentStyles';
import {
    agentMetaBackground,
    bodyControlsStyle,
    bodyHeaderStyle,
    bodyHintStyle,
    bodyMetaGroupStyle,
    collapseButtonLabel,
    collapseButtonStyle,
    collapseButtonSymbol,
    collapseButtonTitle,
    collapsedBodyStyle,
    formatCollapsedHint,
    formatRoleLabel,
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
}: MessageRowProps) {
    const neutralColor = 'var(--color-neutral, #6b7280)';
    const rowFocused = highlightAgent || highlightJudge || highlightSystem;
    const agentText = agentEntry?.content || '';
    const judgeText = judgeEntry?.content || '';
    const agentVisual = useMemo(() => getAgentVisual(agentEntry), [agentEntry]);
    const judgeVisual = useMemo(() => getJudgeVisual(judgeEntry), [judgeEntry]);
    const agentContent = useMemo(() => splitLeadingThinkingContent(agentText), [agentText]);
    const judgeContent = useMemo(() => splitLeadingThinkingContent(judgeText), [judgeText]);
    const fontSize = useSettingsStore((state) => state.displaySettings.fontSize);
    const messageFontSizes = DISPLAY_FONT_TOKENS[fontSize].message;
    const agentTurnLabel = formatTurnPill(agentEntry?.turn);
    const collapsedHint = formatCollapsedHint(agentEntry);
    const metaBackground = agentMetaBackground(agentVisual.color);
    const agentRoleLabel =
        agentVisual.label === '正方' || agentEntry?.role === 'proposer'
            ? '正方'
            : agentVisual.label === '反方' || agentEntry?.role === 'opposer'
                ? '反方'
                : formatRoleLabel(agentEntry?.role);

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

    const agentCard = agentEntry ? (
        <motion.div
            {...(animated
                ? { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4 } }
                : STATIC_MOTION_PROPS)}
            style={{
                position: 'relative',
                background: 'var(--bg-card)',
                padding: '28px',
                borderRadius: 'var(--radius-xl)',
                boxShadow: highlightAgent
                    ? `0 0 0 2px rgba(99, 102, 241, 0.55), var(--shadow-sm), 0 4px 20px ${agentVisual.cardTint}`
                    : `var(--shadow-sm), 0 4px 20px ${agentVisual.cardTint}`,
                marginTop: '20px',
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    top: '-16px',
                    left: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                }}
            >
                <motion.div
                    {...(animated ? { whileHover: { scale: 1.05 } } : STATIC_MOTION_PROPS)}
                    style={{
                        width: '40px',
                        height: '40px',
                        background: agentVisual.color,
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '16px',
                        boxShadow: `0 6px 16px ${agentVisual.glowTint}`,
                    }}
                >
                    {agentVisual.badge}
                </motion.div>
                <span
                    style={{
                        fontSize: '13px',
                        color: 'var(--text-secondary)',
                        background: 'var(--bg-card)',
                        padding: '6px 14px',
                        borderRadius: 'var(--radius-full)',
                        boxShadow: 'var(--shadow-xs)',
                        fontWeight: 500,
                    }}
                >
                    {agentVisual.label}
                </span>
            </div>

            <div style={bodyHeaderStyle()}>
                <div style={bodyMetaGroupStyle()}>
                    <AgentMetaPill label={agentVisual.label} color={agentVisual.color} background={metaBackground} />
                    {agentTurnLabel && (
                        <AgentMetaPill
                            label={agentTurnLabel}
                            color="var(--text-secondary)"
                            background="var(--bg-tertiary)"
                        />
                    )}
                    <AgentMetaPill label={agentRoleLabel} color={agentVisual.color} background={metaBackground} />
                </div>
                <div style={bodyControlsStyle()}>
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
            </div>

            {agentCollapsed ? (
                <div data-agent-content="collapsed" style={collapsedBodyStyle(agentVisual.color, messageFontSizes.body)}>
                    {collapsedHint}
                </div>
            ) : (
                <div data-agent-content="visible" style={messageContentWrapperStyle('16px')}>
                    <ThinkingBlock
                        content={agentContent.thinking}
                        accentColor={agentVisual.color}
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
                position: 'relative',
                background: judgeVisual.background,
                padding: judgeOnly ? '28px' : '24px',
                borderRadius: 'var(--radius-xl)',
                boxShadow: highlightJudge
                    ? `0 0 0 2px rgba(99, 102, 241, 0.55), var(--shadow-sm), 0 4px 20px ${judgeVisual.glowTint}`
                    : `var(--shadow-sm), 0 4px 20px ${judgeVisual.glowTint}`,
                marginTop: '20px',
                border: `1px solid ${highlightJudge ? 'rgba(99, 102, 241, 0.45)' : judgeVisual.border}`,
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    top: '-16px',
                    left: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                }}
            >
                <motion.div
                    {...(animated ? { whileHover: { scale: 1.05 } } : STATIC_MOTION_PROPS)}
                    style={{
                        width: '36px',
                        height: '36px',
                        background: judgeVisual.color,
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '14px',
                        boxShadow: `0 6px 16px ${judgeVisual.glowTint}`,
                    }}
                >
                    {judgeVisual.badge}
                </motion.div>
                <span
                    style={{
                        fontSize: '12px',
                        color: 'var(--text-secondary)',
                        background: 'var(--bg-card)',
                        padding: '5px 12px',
                        borderRadius: 'var(--radius-full)',
                        boxShadow: 'var(--shadow-xs)',
                        fontWeight: 500,
                    }}
                >
                    {judgeVisual.label}
                </span>
            </div>

            <div style={messageContentWrapperStyle('12px')}>
                <ThinkingBlock
                    content={judgeContent.thinking}
                    accentColor={judgeVisual.color}
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
                gap: '14px',
                marginBottom: '32px',
                borderRadius: 'var(--radius-xl)',
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
        && sectionsEqual(previous.insightSections, next.insightSections);
}

export default memo(MessageRow, areEqual);
