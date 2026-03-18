/**
 * MemoryPanel - lightweight cognitive memory stream visualization.
 * Replay-aware: panel renders from visible runtime event window.
 */

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useDebateStore } from '../../stores/debateStore';
import { buildMemoryWriteViews, summarizeMemoryTypes } from '../../utils/memoryView';

type MemoryPanelProps = {
    compact?: boolean;
};

function typeColor(type: string): string {
    if (type === 'fact') return 'var(--accent-cyan)';
    if (type === 'memo') return 'var(--accent-amber)';
    if (type === 'context') return 'var(--accent-indigo)';
    return 'var(--text-muted)';
}

export default function MemoryPanel({ compact = false }: MemoryPanelProps) {
    const { visibleRuntimeEvents, replayEnabled, setFocusedRuntimeEventId } = useDebateStore();
    const [collapsed, setCollapsed] = useState(true);

    const writes = useMemo(
        () => buildMemoryWriteViews(visibleRuntimeEvents),
        [visibleRuntimeEvents],
    );
    const summary = useMemo(() => summarizeMemoryTypes(writes), [writes]);
    const latestWrites = writes.slice(-6).reverse();

    return (
        <div
            style={{
                flex: compact && collapsed ? '0 0 auto' : '1 1 100%',
                minWidth: compact && collapsed ? 'auto' : 0,
                maxWidth: '100%',
            }}
        >
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
                    {writes.length} 条{replayEnabled ? ' · 回放' : ''}
                </span>
            </button>

            <AnimatePresence initial={false}>
                {!collapsed && (
                    <motion.div
                        initial={compact ? { opacity: 0, y: -8, height: 0 } : undefined}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={compact ? { opacity: 0, y: -6, height: 0 } : undefined}
                        transition={{ duration: 0.22 }}
                        style={{
                            marginTop: '8px',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-lg)',
                            background: 'var(--bg-card)',
                            overflow: 'hidden',
                            boxShadow: '0 14px 34px rgba(15, 23, 42, 0.12)',
                            backdropFilter: 'blur(14px)',
                        }}
                    >
                        <div
                            style={{
                                borderTop: compact ? 'none' : '1px solid var(--border-subtle)',
                                padding: '10px',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: '6px',
                                    marginBottom: '10px',
                                    fontSize: '11px',
                                }}
                            >
                                <span style={{ padding: '3px 8px', borderRadius: '999px', background: 'var(--bg-tertiary)' }}>
                                    事实 {summary.fact}
                                </span>
                                <span style={{ padding: '3px 8px', borderRadius: '999px', background: 'var(--bg-tertiary)' }}>
                                    备忘 {summary.memo}
                                </span>
                                <span style={{ padding: '3px 8px', borderRadius: '999px', background: 'var(--bg-tertiary)' }}>
                                    上下文 {summary.context}
                                </span>
                            </div>

                            {!latestWrites.length && (
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                    暂无记忆写入，运行过程中会在这里显示。
                                </div>
                            )}

                            <div style={{ display: 'grid', gap: '8px' }}>
                                {latestWrites.map((item) => (
                                    <motion.button
                                        key={item.eventId}
                                        whileHover={{ scale: 1.01 }}
                                        onClick={() => setFocusedRuntimeEventId(item.eventId)}
                                        style={{
                                            border: 'none',
                                            borderRadius: 'var(--radius-md)',
                                            padding: '9px 10px',
                                            background: 'linear-gradient(135deg, rgba(255,255,255,0.02), rgba(255,255,255,0.0)), var(--bg-secondary)',
                                            color: 'var(--text-primary)',
                                            textAlign: 'left',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                marginBottom: '6px',
                                            }}
                                        >
                                            <span
                                                style={{
                                                    width: '7px',
                                                    height: '7px',
                                                    borderRadius: '50%',
                                                    background: typeColor(item.type),
                                                    flexShrink: 0,
                                                }}
                                            />
                                            <span style={{ fontSize: '11px', fontWeight: 600, minWidth: 0 }}>
                                                {item.title}
                                            </span>
                                            <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-muted)' }}>
                                                #{item.seq}
                                            </span>
                                        </div>

                                        <div
                                            style={{
                                                fontSize: '11px',
                                                color: 'var(--text-secondary)',
                                                marginBottom: '6px',
                                                display: '-webkit-box',
                                                WebkitLineClamp: 2,
                                                WebkitBoxOrient: 'vertical',
                                                overflow: 'hidden',
                                            }}
                                        >
                                            {item.content || '暂无内容'}
                                        </div>

                                        <div
                                            style={{
                                                display: 'grid',
                                                gap: '4px',
                                            }}
                                        >
                                            <div
                                                style={{
                                                    height: '4px',
                                                    borderRadius: '999px',
                                                    background: 'var(--bg-tertiary)',
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${item.importance}%` }}
                                                    transition={{ duration: 0.35 }}
                                                    style={{
                                                        height: '100%',
                                                        borderRadius: '999px',
                                                        background: typeColor(item.type),
                                                    }}
                                                />
                                            </div>
                                            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                                重要度 {item.importance} · 衰减 {(item.decay * 100).toFixed(0)}%
                                            </div>
                                        </div>
                                    </motion.button>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
