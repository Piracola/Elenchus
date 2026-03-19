import { useMemo } from 'react';
import type { DialogueEntry } from '../../types';

type TeamDiscussionPanelProps = {
    entries: DialogueEntry[];
};

type TeamDiscussionGroup = {
    key: string;
    side: string;
    turn: number;
    entries: DialogueEntry[];
};

function sideLabel(side: string | undefined): string {
    if (side === 'proposer') return '正方';
    if (side === 'opposer') return '反方';
    return side || '队内';
}

function buildGroups(entries: DialogueEntry[]): TeamDiscussionGroup[] {
    const groups = new Map<string, TeamDiscussionGroup>();

    for (const entry of entries) {
        const side = entry.team_side || entry.source_role || 'unknown';
        const turn = entry.turn ?? entry.team_round ?? 0;
        const key = `${side}-${turn}`;
        const existing = groups.get(key);
        if (existing) {
            existing.entries.push(entry);
            continue;
        }
        groups.set(key, { key, side, turn, entries: [entry] });
    }

    return [...groups.values()].sort((a, b) => {
        if (a.turn !== b.turn) return a.turn - b.turn;
        return a.side.localeCompare(b.side);
    });
}

export default function TeamDiscussionPanel({ entries }: TeamDiscussionPanelProps) {
    const groups = useMemo(() => buildGroups(entries), [entries]);

    if (!groups.length) return null;

    return (
        <section
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                marginBottom: '12px',
            }}
        >
            <div
                style={{
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-lg)',
                    background: 'rgba(34, 211, 238, 0.08)',
                    border: '1px solid rgba(34, 211, 238, 0.18)',
                    color: 'var(--text-secondary)',
                    fontSize: '13px',
                    lineHeight: 1.6,
                }}
            >
                组内讨论记录会按阵营折叠展示。正式辩论输出仍以正反方主辩发言和裁判评分为主。
            </div>

            {groups.map((group) => (
                <details
                    key={group.key}
                    style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-lg)',
                        padding: '12px 14px',
                        boxShadow: 'var(--shadow-xs)',
                    }}
                >
                    <summary
                        style={{
                            cursor: 'pointer',
                            color: 'var(--text-primary)',
                            fontWeight: 600,
                            fontSize: '14px',
                        }}
                    >
                        {sideLabel(group.side)}队内讨论 · 片段 {group.turn + 1} · {group.entries.length} 条
                    </summary>

                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                            marginTop: '12px',
                        }}
                    >
                        {group.entries.map((entry, index) => {
                            const isSummary = entry.role === 'team_summary';
                            return (
                                <div
                                    key={entry.event_id ?? `${group.key}-${index}`}
                                    style={{
                                        padding: '12px 14px',
                                        borderRadius: 'var(--radius-md)',
                                        background: isSummary
                                            ? 'rgba(99, 102, 241, 0.08)'
                                            : 'var(--bg-secondary)',
                                        border: isSummary
                                            ? '1px solid rgba(99, 102, 241, 0.16)'
                                            : '1px solid var(--border-subtle)',
                                    }}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            flexWrap: 'wrap',
                                            marginBottom: '8px',
                                        }}
                                    >
                                        <span
                                            style={{
                                                fontSize: '12px',
                                                fontWeight: 700,
                                                color: isSummary ? 'var(--accent-indigo)' : 'var(--accent-cyan)',
                                            }}
                                        >
                                            {entry.agent_name || (isSummary ? '总结员' : '组员')}
                                        </span>
                                        {typeof entry.team_round === 'number' && !isSummary && (
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                第 {entry.team_round + 1} 轮
                                            </span>
                                        )}
                                        {entry.team_specialty && !isSummary && (
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                {entry.team_specialty}
                                            </span>
                                        )}
                                    </div>
                                    <div
                                        style={{
                                            color: 'var(--text-secondary)',
                                            fontSize: '13px',
                                            lineHeight: 1.7,
                                            whiteSpace: 'pre-wrap',
                                        }}
                                    >
                                        {entry.content}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </details>
            ))}
        </section>
    );
}
