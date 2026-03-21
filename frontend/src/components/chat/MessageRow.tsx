import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SCORE_DIMENSIONS } from '../../types';
import type { DialogueEntry } from '../../types';
import RoundInsights from './RoundInsights';
import type { InsightSection } from './RoundInsights';

interface MessageRowProps {
    agentEntry?: (DialogueEntry & { isStreaming?: boolean; streamingContent?: string }) | null;
    judgeEntry?: (DialogueEntry & { isStreaming?: boolean; streamingContent?: string }) | null;
    systemEntry?: (DialogueEntry & { isStreaming?: boolean; streamingContent?: string }) | null;
    highlightAgent?: boolean;
    highlightJudge?: boolean;
    highlightSystem?: boolean;
    insightSections?: InsightSection[];
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

function ScoreGrid({ judgeEntry }: { judgeEntry: NonNullable<MessageRowProps['judgeEntry']> }) {
    if (judgeEntry.role !== 'judge' || !judgeEntry.scores || Object.keys(judgeEntry.scores).length === 0) {
        return null;
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
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
                Multi-dimensional score
            </div>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
                    gap: '10px',
                }}
            >
                {SCORE_DIMENSIONS.map((dim) => {
                    const dimData = judgeEntry.scores?.[dim.key];
                    if (!dimData) return null;
                    return (
                        <motion.div
                            key={dim.key}
                            whileHover={{ scale: 1.02 }}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                background: 'var(--bg-card)',
                                padding: '12px',
                                borderRadius: 'var(--radius-md)',
                                boxShadow: 'var(--shadow-xs)',
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
                                <span>{dim.icon}</span>
                                {dim.label}
                            </div>
                            <div
                                style={{
                                    fontSize: '20px',
                                    fontWeight: 700,
                                    color: 'var(--color-judge)',
                                    marginTop: '6px',
                                }}
                            >
                                {dimData.score}
                                <span
                                    style={{
                                        fontSize: '12px',
                                        color: 'var(--text-muted)',
                                        fontWeight: 400,
                                    }}
                                >
                                    /10
                                </span>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </motion.div>
    );
}

function renderMarkdown(text: string) {
    return (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {text}
        </ReactMarkdown>
    );
}

export default function MessageRow({
    agentEntry,
    judgeEntry,
    systemEntry,
    highlightAgent = false,
    highlightJudge = false,
    highlightSystem = false,
    insightSections = [],
}: MessageRowProps) {
    const neutralColor = 'var(--color-neutral, #6b7280)';
    const rowFocused = highlightAgent || highlightJudge || highlightSystem;
    const agentText = agentEntry?.isStreaming
        ? agentEntry.streamingContent || ''
        : agentEntry?.content || '';

    if (systemEntry) {
        if (systemEntry.role === 'audience') {
            return (
                <div
                    data-row-focused={rowFocused ? 'true' : 'false'}
                    style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}
                >
                    <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
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
                        <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
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
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                        padding: '10px 20px',
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '13px',
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

    const agentVisual = getAgentVisual(agentEntry);
    const judgeVisual = getJudgeVisual(judgeEntry);
    const judgeOnly = Boolean(judgeEntry && !agentEntry);
    const agentOnly = Boolean(agentEntry && !judgeEntry);
    const agentTextStyle = {
        color: 'var(--text-primary)',
        fontSize: '15px',
        lineHeight: 1.7,
        marginTop: '16px',
    } as const;

    const agentCard = agentEntry ? (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
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
                    whileHover={{ scale: 1.05 }}
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

            <div
                className="markdown-body"
                data-agent-content="visible"
                style={agentTextStyle}
            >
                {renderMarkdown(agentText)}
            </div>
        </motion.div>
    ) : null;

    const judgeCard = judgeEntry ? (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: agentEntry ? 0.1 : 0 }}
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
                    whileHover={{ scale: 1.05 }}
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

            <div
                className="markdown-body"
                style={{
                    color: 'var(--text-secondary)',
                    fontSize: judgeOnly ? '15px' : '14px',
                    lineHeight: 1.7,
                    marginTop: '12px',
                }}
            >
                {renderMarkdown(judgeEntry.isStreaming ? judgeEntry.streamingContent || '' : judgeEntry.content || '')}
            </div>

            <ScoreGrid judgeEntry={judgeEntry} />
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
                opacity: judgeOnly ? 1 : 1,
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
