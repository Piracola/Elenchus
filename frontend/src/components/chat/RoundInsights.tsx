import { memo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { DialogueEntry } from '../../types';
import { MarkdownRenderer } from './messageRow/MarkdownRenderer';
import { COLLAPSE_MOTION, PRESSABLE_TEXT } from '../../config/motion';

export type InsightSection = {
    key: string;
    title: string;
    accent: string;
    entries: DialogueEntry[];
    defaultCollapsed?: boolean;
    loadingLabel?: string;
};

type RoundInsightsProps = {
    sections: InsightSection[];
};

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
            || previousSection.defaultCollapsed !== nextSection.defaultCollapsed
            || previousSection.loadingLabel !== nextSection.loadingLabel
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
    const reducedMotion = useReducedMotion();

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
                const collapsed = collapsedSections[section.key] ?? (section.defaultCollapsed ?? true);
                const toggleCollapsed = () => {
                    setCollapsedSections((prev) => ({
                        ...prev,
                        [section.key]: !collapsed,
                    }));
                };

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
                        <motion.button
                            type="button"
                            aria-expanded={!collapsed}
                            onClick={toggleCollapsed}
                            {...PRESSABLE_TEXT}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '12px',
                                width: '100%',
                                border: 0,
                                padding: 0,
                                background: 'transparent',
                                color: 'inherit',
                                textAlign: 'left',
                                cursor: 'pointer',
                                flexWrap: 'wrap',
                            }}
                        >
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <strong
                                    style={{
                                        color: 'var(--text-primary)',
                                        fontSize: '13px',
                                        letterSpacing: '0.01em',
                                    }}
                                >
                                    {section.title}
                                </strong>
                                {section.loadingLabel && (
                                    <span
                                        aria-live="polite"
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            color: 'var(--accent-emerald)',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                        }}
                                    >
                                        <span
                                            aria-hidden="true"
                                            style={{
                                                width: '6px',
                                                height: '6px',
                                                borderRadius: '50%',
                                                background: 'var(--accent-emerald)',
                                                animation: reducedMotion ? 'none' : 'pulse 1s ease-in-out infinite',
                                            }}
                                        />
                                        {section.loadingLabel}
                                    </span>
                                )}
                            </div>
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
                                <span
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
                                    }}
                                >
                                    {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                                    {collapsed ? '展开' : '收起'}
                                </span>
                            </div>
                        </motion.button>

                        <AnimatePresence initial={false}>
                        {!collapsed && (
                            <motion.div
                                key="insight-entries"
                                {...COLLAPSE_MOTION}
                                style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px', overflow: 'hidden' }}
                            >
                                {section.entries.map((entry, index) => {
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
                                            </div>
                                            <div
                                                className="markdown-body"
                                                style={{
                                                    color: 'var(--text-secondary)',
                                                    fontSize: '13px',
                                                    lineHeight: 1.7,
                                                }}
                                            >
                                                <MarkdownRenderer text={entry.content || ''} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </motion.div>
                        )}
                        </AnimatePresence>
                    </section>
                );
            })}
        </div>
    );
}

export default memo(RoundInsights, (previous, next) => areSectionsEqual(previous.sections, next.sections));
