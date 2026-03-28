/**
 * MemoryPanel - cognitive memory stream, graph, and growth timeline.
 * Replay-aware: panel renders from the visible runtime event window.
 */

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRuntimeActions, useRuntimeViewState } from '../../hooks/useDebateViewState';
import { buildMemoryGraph } from '../../utils/memoryGraph';
import {
    buildMemoryWriteViews,
    summarizeMemoryTypes,
} from '../../utils/memoryView';
import { MemoryGraphSection } from './memoryPanel/MemoryGraphSection';
import { MemoryTimelineSection } from './memoryPanel/MemoryTimelineSection';
import { MemoryWriteList } from './memoryPanel/MemoryWriteList';

type MemoryPanelProps = {
    compact?: boolean;
    embedded?: boolean;
};

export default function MemoryPanel({ compact = false, embedded = false }: MemoryPanelProps) {
    const { visibleRuntimeEvents, replayEnabled, focusedRuntimeEventId } = useRuntimeViewState();
    const { setFocusedRuntimeEventId } = useRuntimeActions();
    const [collapsed, setCollapsed] = useState(embedded ? false : true);
    const activePanel = embedded || !collapsed;

    const memoryWriteCount = useMemo(
        () => visibleRuntimeEvents.reduce((count, event) => count + (event.type === 'memory_write' ? 1 : 0), 0),
        [visibleRuntimeEvents],
    );
    const writes = useMemo(
        () => (activePanel ? buildMemoryWriteViews(visibleRuntimeEvents) : []),
        [activePanel, visibleRuntimeEvents],
    );
    const summary = useMemo(() => summarizeMemoryTypes(writes), [writes]);
    const latestWrites = useMemo(() => writes.slice(-4).reverse(), [writes]);
    const graph = useMemo(() => buildMemoryGraph(writes), [writes]);

    const memoryContent = (
        <motion.div
            initial={embedded ? false : compact ? { opacity: 0, y: -8, height: 0 } : undefined}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={embedded ? undefined : compact ? { opacity: 0, y: -6, height: 0 } : undefined}
            transition={{ duration: 0.22 }}
            style={{
                marginTop: embedded ? 0 : '8px',
                border: embedded ? 'none' : '1px solid var(--border-subtle)',
                borderRadius: embedded ? 0 : 'var(--radius-lg)',
                background: embedded ? 'transparent' : 'var(--bg-card)',
                overflow: 'hidden',
                boxShadow: embedded ? 'none' : '0 14px 34px rgba(15, 23, 42, 0.12)',
                backdropFilter: embedded ? undefined : 'blur(14px)',
            }}
        >
            <div
                style={{
                    borderTop: compact && !embedded ? 'none' : embedded ? 'none' : '1px solid var(--border-subtle)',
                    padding: '10px',
                    display: 'grid',
                    gap: '10px',
                }}
            >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '11px' }}>
                    <span style={{ padding: '3px 8px', borderRadius: '999px', background: 'var(--bg-tertiary)' }}>
                        事实 {summary.fact}
                    </span>
                    <span style={{ padding: '3px 8px', borderRadius: '999px', background: 'var(--bg-tertiary)' }}>
                        备忘 {summary.memo}
                    </span>
                    <span style={{ padding: '3px 8px', borderRadius: '999px', background: 'var(--bg-tertiary)' }}>
                        上下文 {summary.context}
                    </span>
                    <span style={{ padding: '3px 8px', borderRadius: '999px', background: 'var(--bg-tertiary)' }}>
                        图谱节点 {graph.memoryNodes.length}
                    </span>
                </div>

                {!latestWrites.length && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        暂无记忆写入，运行过程中会在这里显示。
                    </div>
                )}

                {graph.memoryNodes.length > 0 && (
                    <MemoryGraphSection
                        graph={graph}
                        compact={compact}
                        activePanel={activePanel}
                        focusedRuntimeEventId={focusedRuntimeEventId}
                        onSelectEvent={setFocusedRuntimeEventId}
                    />
                )}

                {graph.timeline.length > 0 && (
                    <MemoryTimelineSection
                        graph={graph}
                        compact={compact}
                        activePanel={activePanel}
                        onSelectEvent={setFocusedRuntimeEventId}
                    />
                )}

                {latestWrites.length > 0 && (
                    <MemoryWriteList
                        latestWrites={latestWrites}
                        activePanel={activePanel}
                        focusedRuntimeEventId={focusedRuntimeEventId}
                        onSelectEvent={setFocusedRuntimeEventId}
                    />
                )}
            </div>
        </motion.div>
    );

    return (
        <div
            style={{
                flex: compact && collapsed && !embedded ? '0 0 auto' : '1 1 100%',
                minWidth: compact && collapsed && !embedded ? 'auto' : 0,
                maxWidth: '100%',
            }}
        >
            {!embedded && (
                <button
                    onClick={() => setCollapsed((prev) => !prev)}
                    style={{
                        width: compact && collapsed ? 'auto' : '100%',
                        minWidth: compact && collapsed ? 'auto' : 0,
                        border: '1px solid var(--border-subtle)',
                        borderRadius: compact && collapsed ? '999px' : 'var(--radius-lg)',
                        background: 'var(--bg-card)',
                        color: 'var(--text-primary)',
                        padding: compact && collapsed ? '7px 11px' : '10px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                        cursor: 'pointer',
                        boxShadow: compact ? '0 10px 30px rgba(15, 23, 42, 0.08)' : 'var(--shadow-xs)',
                        backdropFilter: compact ? 'blur(14px)' : undefined,
                        overflow: 'hidden',
                    }}
                >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <span
                            style={{
                                width: '7px',
                                height: '7px',
                                borderRadius: '50%',
                                background: 'var(--accent-amber)',
                                boxShadow: '0 0 10px rgba(245, 158, 11, 0.38)',
                                flexShrink: 0,
                            }}
                        />
                        <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.01em' }}>
                            记忆流
                        </span>
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {memoryWriteCount} 条{replayEnabled ? ' · 回放' : ''}
                    </span>
                </button>
            )}

            {embedded ? memoryContent : (
                <AnimatePresence initial={false}>
                    {!collapsed && memoryContent}
                </AnimatePresence>
            )}
        </div>
    );
}
