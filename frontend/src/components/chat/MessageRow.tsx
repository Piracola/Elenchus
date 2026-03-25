import { memo, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSettingsStore } from '../../stores/settingsStore';
import { DISPLAY_FONT_TOKENS } from '../../config/display';
import { SCORE_DIMENSIONS, SCORE_MODULES } from '../../types';
import type { DialogueEntry, ScoreDimensionKey, ScoreModuleKey, TurnScore } from '../../types';
import { splitLeadingThinkingContent } from '../../utils/thinkingContent';
import RoundInsights from './RoundInsights';
import type { InsightSection } from './RoundInsights';

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

const COLLAPSED_AGENT_PLACEHOLDER = '该辩手正文已折叠';

function formatTurnPill(turn?: number): string | null {
    return typeof turn === 'number' && turn >= 0 ? `第 ${turn + 1} 轮` : null;
}

function formatCollapsedHint(entry: DialogueEntry | null | undefined): string {
    const turnLabel = formatTurnPill(entry?.turn);
    return turnLabel ? `${turnLabel}发言已折叠` : COLLAPSED_AGENT_PLACEHOLDER;
}

function renderAgentMetaPill(label: string, color: string, background: string) {
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '5px 10px',
                borderRadius: 'var(--radius-full)',
                fontSize: '12px',
                fontWeight: 600,
                color,
                background,
                whiteSpace: 'nowrap',
            }}
        >
            {label}
        </span>
    );
}

function collapseButtonLabel(collapsed: boolean): string {
    return collapsed ? '展开正文' : '折叠正文';
}

function collapseButtonSymbol(collapsed: boolean): string {
    return collapsed ? '＋' : '－';
}

function collapseButtonTitle(collapsed: boolean): string {
    return collapsed ? '展开这条辩手发言正文' : '折叠这条辩手发言正文';
}

function agentMetaBackground(color: string): string {
    if (color === 'var(--color-opposer)') {
        return 'rgba(255, 59, 48, 0.10)';
    }
    if (color === 'var(--color-proposer)') {
        return 'rgba(52, 199, 89, 0.10)';
    }
    return 'rgba(99, 102, 241, 0.10)';
}

function collapseButtonStyle(collapsed: boolean) {
    return {
        border: '1px solid var(--border-subtle)',
        background: collapsed ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
        color: 'var(--text-secondary)',
        borderRadius: 'var(--radius-full)',
        padding: '6px 12px',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        boxShadow: 'var(--shadow-xs)',
    } as const;
}

function collapsedBodyStyle(color: string, fontSize: string) {
    return {
        color: 'var(--text-secondary)',
        fontSize,
        lineHeight: 1.7,
        marginTop: '16px',
        padding: '14px 16px',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-secondary)',
        border: `1px dashed ${color}`,
    } as const;
}

function bodyHeaderStyle() {
    return {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        flexWrap: 'wrap',
        marginTop: '6px',
    } as const;
}

function bodyMetaGroupStyle() {
    return {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
    } as const;
}

function bodyControlsStyle() {
    return {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
    } as const;
}

function bodyHintStyle() {
    return {
        fontSize: '12px',
        color: 'var(--text-muted)',
        fontWeight: 500,
    } as const;
}

type RoleVisual = {
    badge: string;
    label: string;
    color: string;
    cardTint: string;
    glowTint: string;
};

type JudgeVisual = {
    badge: string;
    label: string;
    color: string;
    background: string;
    border: string;
    glowTint: string;
};

const KNOWN_ROLE_VISUALS: Record<string, RoleVisual> = {
    proposer: {
        badge: '正',
        label: '正方',
        color: 'var(--color-proposer)',
        cardTint: 'rgba(52, 199, 89, 0.08)',
        glowTint: 'rgba(52, 199, 89, 0.35)',
    },
    opposer: {
        badge: '反',
        label: '反方',
        color: 'var(--color-opposer)',
        cardTint: 'rgba(255, 59, 48, 0.08)',
        glowTint: 'rgba(255, 59, 48, 0.35)',
    },
};

const EXTRA_ROLE_VISUALS: Omit<RoleVisual, 'badge' | 'label'>[] = [
    {
        color: 'var(--accent-indigo)',
        cardTint: 'rgba(99, 102, 241, 0.08)',
        glowTint: 'rgba(99, 102, 241, 0.35)',
    },
    {
        color: 'var(--accent-cyan)',
        cardTint: 'rgba(34, 211, 238, 0.08)',
        glowTint: 'rgba(34, 211, 238, 0.35)',
    },
    {
        color: 'var(--accent-amber)',
        cardTint: 'rgba(245, 158, 11, 0.08)',
        glowTint: 'rgba(245, 158, 11, 0.35)',
    },
];

const DIMENSION_WEIGHT_MAP = Object.fromEntries(
    SCORE_DIMENSIONS.map((dimension) => [dimension.key, dimension.weight]),
) as Record<ScoreDimensionKey, number>;

const MODULE_DIMENSIONS: Record<ScoreModuleKey, ScoreDimensionKey[]> = {
    foundation: ['evidence_quality', 'topic_focus'],
    confrontation: ['logical_rigor', 'rebuttal_strength'],
    stability: ['consistency'],
    vision: ['persuasiveness'],
};

const STATIC_MOTION_PROPS = {
    initial: false,
    animate: undefined,
    transition: undefined,
    whileHover: undefined,
    whileTap: undefined,
} as const;

function formatRoleLabel(role: string | undefined): string {
    if (!role) return '辩手';
    return role
        .split(/[_-\s]+/)
        .filter(Boolean)
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join(' ');
}

function getRoleBadge(text: string): string {
    const badge = text
        .split(/[_-\s]+/)
        .filter(Boolean)
        .map((part) => part[0] ?? '')
        .join('')
        .slice(0, 2);
    return badge || '辩';
}

function hashRole(role: string): number {
    let hash = 0;
    for (const char of role) {
        hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    }
    return hash;
}

function getAgentVisual(agentEntry?: DialogueEntry | null): RoleVisual {
    const role = agentEntry?.role ?? '';
    const rawLabel = agentEntry?.agent_name?.trim();
    const label = rawLabel && rawLabel !== role ? rawLabel : formatRoleLabel(role);
    const knownVisual = role ? KNOWN_ROLE_VISUALS[role] : undefined;

    if (knownVisual) {
        return {
            ...knownVisual,
            label: label || knownVisual.label,
        };
    }

    const palette = EXTRA_ROLE_VISUALS[hashRole(role || label) % EXTRA_ROLE_VISUALS.length];
    return {
        badge: getRoleBadge(label || role),
        label: label || '辩手',
        ...palette,
    };
}

function getJudgeVisual(judgeEntry?: DialogueEntry | null): JudgeVisual {
    if (judgeEntry?.role === 'sophistry_round_report') {
        return {
            badge: '观',
            label: judgeEntry.agent_name || '观察报告',
            color: 'var(--mode-sophistry-accent)',
            background: 'var(--mode-sophistry-card)',
            border: 'var(--mode-sophistry-border)',
            glowTint: 'rgba(184, 137, 70, 0.28)',
        };
    }

    if (judgeEntry?.role === 'sophistry_final_report') {
        return {
            badge: '总',
            label: judgeEntry.agent_name || '实验总览',
            color: 'var(--mode-sophistry-accent)',
            background: 'linear-gradient(180deg, var(--mode-sophistry-card), rgba(255, 248, 238, 0.95))',
            border: 'var(--mode-sophistry-border)',
            glowTint: 'rgba(184, 137, 70, 0.34)',
        };
    }

    return {
        badge: '裁',
        label: judgeEntry?.agent_name || '裁判评分',
        color: 'var(--color-judge)',
        background: 'var(--bg-secondary)',
        border: 'rgba(255, 149, 0, 0.14)',
        glowTint: 'rgba(255, 149, 0, 0.35)',
    };
}

function formatScoreValue(score: number): string {
    const rounded = Math.round(score * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function getDimensionScore(scores: TurnScore, key: ScoreDimensionKey): number | null {
    const scoreValue = scores[key]?.score;
    return typeof scoreValue === 'number' ? scoreValue : null;
}

function getWeightedAverage(scores: TurnScore, dimensions: ScoreDimensionKey[]): number | null {
    const availableDimensions = dimensions.filter((dimension) => getDimensionScore(scores, dimension) !== null);
    if (availableDimensions.length === 0) {
        return null;
    }

    const totalWeight = availableDimensions.reduce(
        (sum, dimension) => sum + DIMENSION_WEIGHT_MAP[dimension],
        0,
    );
    const weightedSum = availableDimensions.reduce((sum, dimension) => {
        const scoreValue = getDimensionScore(scores, dimension);
        return sum + (scoreValue ?? 0) * DIMENSION_WEIGHT_MAP[dimension];
    }, 0);

    return Math.round(((weightedSum / totalWeight) + Number.EPSILON) * 10) / 10;
}

function getComprehensiveScore(scores: TurnScore): number | null {
    if (typeof scores.comprehensive_score === 'number') {
        return Math.round((scores.comprehensive_score + Number.EPSILON) * 10) / 10;
    }
    return getWeightedAverage(
        scores,
        SCORE_DIMENSIONS.map((dimension) => dimension.key),
    );
}

function getModuleScore(scores: TurnScore, moduleKey: ScoreModuleKey): number | null {
    const precomputedScore = scores.module_scores?.[moduleKey];
    if (typeof precomputedScore === 'number') {
        return Math.round((precomputedScore + Number.EPSILON) * 10) / 10;
    }
    return getWeightedAverage(scores, MODULE_DIMENSIONS[moduleKey]);
}

function renderMarkdown(text: string) {
    return (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {text}
        </ReactMarkdown>
    );
}

const THINKING_PANEL_LABEL = '\u601d\u7ef4\u94fe';
const THINKING_PANEL_SHOW = '\u5c55\u5f00';
const THINKING_PANEL_HIDE = '\u6298\u53e0';
const THINKING_PANEL_HINT = '\u9ed8\u8ba4\u5df2\u6298\u53e0';
const THINKING_PANEL_SHOW_TITLE = '\u5c55\u5f00\u601d\u7ef4\u94fe';
const THINKING_PANEL_HIDE_TITLE = '\u6298\u53e0\u601d\u7ef4\u94fe';

function messageContentWrapperStyle(marginTop: string) {
    return {
        marginTop,
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
    } as const;
}

function markdownBodyStyle(fontSize: string, color: string) {
    return {
        color,
        fontSize,
        lineHeight: 1.7,
    } as const;
}

function thinkingPanelStyle(accentColor: string) {
    return {
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-xs)',
        overflow: 'hidden',
    } as const;
}

function thinkingHeaderStyle() {
    return {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '12px 16px',
    } as const;
}

function thinkingLabelStyle(accentColor: string) {
    return {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '12px',
        fontWeight: 700,
        color: accentColor,
    } as const;
}

function thinkingToggleStyle(expanded: boolean) {
    return {
        border: '1px solid var(--border-subtle)',
        background: expanded ? 'var(--bg-tertiary)' : 'var(--bg-card)',
        color: 'var(--text-secondary)',
        borderRadius: 'var(--radius-full)',
        padding: '6px 12px',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        boxShadow: 'var(--shadow-xs)',
        flexShrink: 0,
    } as const;
}

function thinkingHintStyle() {
    return {
        padding: '0 16px 16px',
        color: 'var(--text-muted)',
        fontSize: '12px',
        lineHeight: 1.6,
    } as const;
}

type ThinkingBlockProps = {
    content: string | null;
    accentColor: string;
    fontSize: string;
    textColor: string;
};

function ThinkingBlock({
    content,
    accentColor,
    fontSize,
    textColor,
}: ThinkingBlockProps) {
    const [expanded, setExpanded] = useState(false);

    if (!content) {
        return null;
    }

    return (
        <div
            data-thinking-block="true"
            data-thinking-expanded={expanded ? 'true' : 'false'}
            style={thinkingPanelStyle(accentColor)}
        >
            <div style={thinkingHeaderStyle()}>
                <span style={thinkingLabelStyle(accentColor)}>
                    <span aria-hidden="true">{expanded ? '-' : '+'}</span>
                    <span>{THINKING_PANEL_LABEL}</span>
                </span>
                <button
                    type="button"
                    data-thinking-toggle="true"
                    aria-expanded={expanded}
                    aria-label={expanded ? THINKING_PANEL_HIDE_TITLE : THINKING_PANEL_SHOW_TITLE}
                    title={expanded ? THINKING_PANEL_HIDE_TITLE : THINKING_PANEL_SHOW_TITLE}
                    onClick={() => setExpanded((current) => !current)}
                    style={thinkingToggleStyle(expanded)}
                >
                    <span>{expanded ? THINKING_PANEL_HIDE : THINKING_PANEL_SHOW}</span>
                </button>
            </div>
            {expanded ? (
                <div
                    className="markdown-body"
                    data-thinking-content="visible"
                    style={{
                        ...markdownBodyStyle(fontSize, textColor),
                        padding: '0 16px 16px',
                    }}
                >
                    {renderMarkdown(content)}
                </div>
            ) : (
                <div data-thinking-content="collapsed" style={thinkingHintStyle()}>
                    {THINKING_PANEL_HINT}
                </div>
            )}
        </div>
    );
}

function ScoreGrid({
    judgeEntry,
    animated,
}: {
    judgeEntry: NonNullable<MessageRowProps['judgeEntry']>;
    animated: boolean;
}) {
    if (judgeEntry.role !== 'judge' || !judgeEntry.scores || Object.keys(judgeEntry.scores).length === 0) {
        return null;
    }

    const comprehensiveScore = getComprehensiveScore(judgeEntry.scores);
    const moduleCards = SCORE_MODULES.map((module) => ({
        ...module,
        score: getModuleScore(judgeEntry.scores as TurnScore, module.key),
    })).filter((module): module is (typeof SCORE_MODULES)[number] & { score: number } => module.score !== null);

    if (comprehensiveScore === null && moduleCards.length === 0) {
        return null;
    }

    return (
        <motion.div
            {...(animated
                ? { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.2 } }
                : STATIC_MOTION_PROPS)}
            style={{
                marginTop: '20px',
                padding: '20px',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-inner)',
            }}
        >
            <div
                style={{
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    marginBottom: '12px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                }}
            >
                裁判评分表
            </div>
            {comprehensiveScore !== null && (
                <motion.div
                    {...(animated ? { whileHover: { scale: 1.01 } } : STATIC_MOTION_PROPS)}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        background: 'linear-gradient(135deg, rgba(255, 149, 0, 0.14) 0%, rgba(255, 149, 0, 0.04) 100%)',
                        border: '1px solid rgba(255, 149, 0, 0.18)',
                        padding: '16px',
                        borderRadius: 'var(--radius-lg)',
                        boxShadow: 'var(--shadow-xs)',
                        marginBottom: '12px',
                    }}
                >
                    <div
                        style={{
                            fontSize: '12px',
                            color: 'var(--text-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                        }}
                    >
                        <span>综合评分</span>
                        <span
                            style={{
                                padding: '4px 8px',
                                borderRadius: 'var(--radius-full)',
                                background: 'rgba(255, 149, 0, 0.12)',
                                color: 'var(--color-judge)',
                                fontWeight: 600,
                            }}
                        >
                            加权汇总
                        </span>
                    </div>
                    <div
                        style={{
                            fontSize: '30px',
                            fontWeight: 800,
                            color: 'var(--color-judge)',
                            lineHeight: 1,
                        }}
                    >
                        {formatScoreValue(comprehensiveScore)}
                        <span
                            style={{
                                fontSize: '13px',
                                color: 'var(--text-muted)',
                                fontWeight: 500,
                                marginLeft: '4px',
                            }}
                        >
                            /10
                        </span>
                    </div>
                </motion.div>
            )}

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: '10px',
                }}
            >
                {moduleCards.map((module) => (
                    <motion.div
                        key={module.key}
                        {...(animated ? { whileHover: { scale: 1.02 } } : STATIC_MOTION_PROPS)}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            background: 'var(--bg-card)',
                            padding: '14px',
                            borderRadius: 'var(--radius-md)',
                            boxShadow: 'var(--shadow-xs)',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '8px',
                            }}
                        >
                            <div
                                style={{
                                    fontSize: '12px',
                                    color: 'var(--text-secondary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                }}
                            >
                                <span>{module.icon}</span>
                                {module.label}
                            </div>
                            <span
                                style={{
                                    fontSize: '11px',
                                    color: 'var(--text-muted)',
                                    padding: '3px 7px',
                                    borderRadius: 'var(--radius-full)',
                                    background: 'var(--bg-tertiary)',
                                }}
                            >
                                {module.weight}%
                            </span>
                        </div>
                        <div
                            style={{
                                fontSize: '22px',
                                fontWeight: 700,
                                color: 'var(--color-judge)',
                            }}
                        >
                            {formatScoreValue(module.score)}
                            <span
                                style={{
                                    fontSize: '12px',
                                    color: 'var(--text-muted)',
                                    fontWeight: 400,
                                    marginLeft: '2px',
                                }}
                            >
                                /10
                            </span>
                        </div>
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
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
                    {renderAgentMetaPill(agentVisual.label, agentVisual.color, metaBackground)}
                    {agentTurnLabel && renderAgentMetaPill(agentTurnLabel, 'var(--text-secondary)', 'var(--bg-tertiary)')}
                    {renderAgentMetaPill(
                        agentVisual.label === '正方' || agentEntry.role === 'proposer'
                            ? '正方'
                            : agentVisual.label === '反方' || agentEntry.role === 'opposer'
                                ? '反方'
                                : formatRoleLabel(agentEntry.role),
                        agentVisual.color,
                        metaBackground,
                    )}
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
                <div
                    data-agent-content="visible"
                    style={messageContentWrapperStyle('16px')}
                >
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
                            {renderMarkdown(agentContent.response)}
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
                        {renderMarkdown(judgeContent.response)}
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
