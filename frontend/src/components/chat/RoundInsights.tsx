import { memo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { DialogueEntry } from '../../types';

export type InsightSection = {
    key: string;
    title: string;
    accent: string;
    entries: DialogueEntry[];
};

type RoundInsightsProps = {
    sections: InsightSection[];
};

function renderMeta(entry: DialogueEntry): string | null {
    if (entry.role === 'team_member') {
        return entry.team_specialty || null;
    }
    if (entry.role === 'jury_member') {
        return entry.jury_perspective || null;
    }
    return null;
}

function areSectionsEqual(previous: InsightSection[], next: InsightSection[]): boolean {
    if (previous === next) return true;
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

function RoundInsights({ sections }: RoundInsightsProps) {
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

    if (!sections.length) return null;

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                marginBottom: '14px',
            }}
        >
            {sections.map((section) => {
                const collapsed = collapsedSections[section.key] ?? true;

                return (
                    <section
                        key={section.key}
                        style={{
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-subtle)',
                            borderLeft: `4px solid ${section.accent}`,
                            borderRadius: 'var(--radius-xl)',
                            padding: '14px 16px',
                            boxShadow: 'var(--shadow-xs)',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '12px',
                                flexWrap: 'wrap',
                            }}
                        >
                            <strong
                                style={{
                                    color: 'var(--text-primary)',
                                    fontSize: '13px',
                                    letterSpacing: '0.01em',
                                }}
                            >
                                {section.title}
                            </strong>
                            <div
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                }}
                            >
                                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                                    {section.entries.length} 条
                                </span>
                                <button
                                    onClick={() => {
                                        setCollapsedSections((prev) => ({
                                            ...prev,
                                            [section.key]: !collapsed,
                                        }));
                                    }}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        border: '1px solid var(--border-subtle)',
                                        borderRadius: '999px',
                                        padding: '5px 10px',
                                        background: 'var(--bg-tertiary)',
                                        color: 'var(--text-secondary)',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                >
                                    {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                                    {collapsed ? '展开' : '收起'}
                                </button>
                            </div>
                        </div>

                        {!collapsed && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                                {section.entries.map((entry, index) => {
                                    const meta = renderMeta(entry);
                                    return (
                                        <div
                                            key={entry.event_id ?? `${section.key}-${index}`}
                                            style={{
                                                padding: '12px 14px',
                                                borderRadius: 'var(--radius-lg)',
                                                background: 'var(--bg-secondary)',
                                                border: '1px solid var(--border-subtle)',
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
                                                        color: section.accent,
                                                    }}
                                                >
                                                    {entry.agent_name || entry.role}
                                                </span>
                                                {meta && (
                                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                        {meta}
                                                    </span>
                                                )}
                                            </div>
                                            <div
                                                className="markdown-body"
                                                style={{
                                                    color: 'var(--text-secondary)',
                                                    fontSize: '13px',
                                                    lineHeight: 1.7,
                                                }}
                                            >
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                    {entry.content || ''}
                                                </ReactMarkdown>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                );
            })}
        </div>
    );
}

export default memo(RoundInsights, (previous, next) => areSectionsEqual(previous.sections, next.sections));
