import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useDebateStore } from '../../stores/debateStore';
import { getLiveGraphNodeLabel } from '../../utils/liveGraph';
import ExecutionTimeline from './ExecutionTimeline';
import LiveGraph from './LiveGraph';
import MemoryPanel from './MemoryPanel';

type InspectorTab = 'timeline' | 'graph' | 'memory';

const TAB_LABELS: Record<InspectorTab, string> = {
    timeline: '执行时间线',
    graph: '流程图',
    memory: '记忆',
};

const TAB_DESCRIPTIONS: Record<InspectorTab, string> = {
    timeline: '查看执行顺序、回放和事件详情',
    graph: '查看当前节点、热度和执行路径',
    memory: '查看记忆写入、图谱和知识时间线',
};

function tabAccent(tab: InspectorTab): string {
    if (tab === 'timeline') return 'var(--accent-indigo)';
    if (tab === 'graph') return 'var(--accent-cyan)';
    return 'var(--accent-amber)';
}

export default function RuntimeInspector({
    defaultExpanded = false,
    fillHeight = false,
}: {
    defaultExpanded?: boolean;
    fillHeight?: boolean;
}) {
    const { runtimeEvents, visibleRuntimeEvents, replayEnabled, currentNode } = useDebateStore();
    const [expanded, setExpanded] = useState(defaultExpanded);
    const [activeTab, setActiveTab] = useState<InspectorTab>('timeline');

    const memoryCount = useMemo(
        () => visibleRuntimeEvents.filter((event) => event.type === 'memory_write').length,
        [visibleRuntimeEvents],
    );

    const summaryText = useMemo(() => {
        if (activeTab === 'timeline') {
            return `${runtimeEvents.length} 条事件${replayEnabled ? ' · 回放' : ''}`;
        }
        if (activeTab === 'graph') {
            const currentLabel = getLiveGraphNodeLabel(currentNode);
            return currentLabel ? `当前节点：${currentLabel}` : '查看运行节点与路径';
        }
        return `${memoryCount} 条记忆写入`;
    }, [activeTab, currentNode, memoryCount, replayEnabled, runtimeEvents.length]);

    return (
        <div
            style={{
                width: '100%',
                height: fillHeight ? '100%' : 'auto',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
            }}
        >
            <button
                onClick={() => setExpanded((prev) => !prev)}
                style={{
                    flex: '0 0 auto',
                    width: '100%',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-lg)',
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)',
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    cursor: 'pointer',
                    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
                    backdropFilter: 'blur(14px)',
                }}
            >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <span
                        style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            background: tabAccent(activeTab),
                            boxShadow: `0 0 10px ${tabAccent(activeTab)}`,
                            flexShrink: 0,
                        }}
                    />
                    <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.01em' }}>
                        运行观察器
                    </span>
                    <span
                        style={{
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            whiteSpace: 'nowrap',
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: 'var(--bg-tertiary)',
                        }}
                    >
                        {TAB_LABELS[activeTab]}
                    </span>
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {summaryText}
                </span>
            </button>

            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        initial={fillHeight ? { opacity: 0, y: -8 } : { opacity: 0, y: -8, height: 0 }}
                        animate={fillHeight ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, height: 'auto' }}
                        exit={fillHeight ? { opacity: 0, y: -6 } : { opacity: 0, y: -6, height: 0 }}
                        transition={{ duration: 0.22 }}
                        style={{
                            marginTop: '8px',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-lg)',
                            background: 'var(--bg-card)',
                            overflow: 'hidden',
                            boxShadow: '0 14px 34px rgba(15, 23, 42, 0.12)',
                            backdropFilter: 'blur(14px)',
                            display: 'flex',
                            flexDirection: 'column',
                            minHeight: 0,
                            ...(fillHeight ? { flex: 1 } : {}),
                        }}
                    >
                        <div
                            style={{
                                flex: '0 0 auto',
                                padding: '10px',
                                borderBottom: '1px solid var(--border-subtle)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                flexWrap: 'wrap',
                                background: 'rgba(255,255,255,0.72)',
                            }}
                        >
                            {(['timeline', 'graph', 'memory'] as InspectorTab[]).map((tab) => {
                                const active = tab === activeTab;
                                return (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        style={{
                                            border: 'none',
                                            borderRadius: '999px',
                                            padding: '6px 12px',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            background: active ? tabAccent(tab) : 'var(--bg-tertiary)',
                                        }}
                                    >
                                        {TAB_LABELS[tab]}
                                    </button>
                                );
                            })}
                            <span
                                style={{
                                    fontSize: '11px',
                                    color: 'var(--text-muted)',
                                    marginLeft: '4px',
                                }}
                            >
                                {TAB_DESCRIPTIONS[activeTab]}
                            </span>
                            <button
                                onClick={() => setExpanded(false)}
                                style={{
                                    marginLeft: 'auto',
                                    border: 'none',
                                    borderRadius: '999px',
                                    padding: '6px 12px',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                    color: 'var(--text-secondary)',
                                    background: 'var(--bg-tertiary)',
                                }}
                            >
                                收起
                            </button>
                        </div>

                        <div
                            style={{
                                padding: '10px',
                                display: 'flex',
                                flexDirection: 'column',
                                flex: 1,
                                minHeight: 0,
                                overflow: 'hidden',
                                background: 'linear-gradient(180deg, rgba(248, 250, 252, 0.9), rgba(248, 250, 252, 0.7))',
                            }}
                        >
                            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                                {activeTab === 'timeline' && <ExecutionTimeline embedded fillHeight={fillHeight} />}
                                {activeTab === 'graph' && <LiveGraph embedded />}
                                {activeTab === 'memory' && <MemoryPanel embedded />}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
