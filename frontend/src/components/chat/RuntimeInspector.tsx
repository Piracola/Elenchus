import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRuntimeViewState, useRuntimeActions } from '../../hooks/useDebateViewState';
import { getLiveGraphNodeLabel } from '../../utils/liveGraph';
import ExecutionTimeline from './ExecutionTimeline';
import LiveGraph from './LiveGraph';
import MemoryPanel from './MemoryPanel';

type InspectorTab = 'timeline' | 'graph' | 'memory';

type RuntimeInspectorProps = {
    defaultExpanded?: boolean;
    fillHeight?: boolean;
    onExpandedChange?: (expanded: boolean) => void;
};

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
    onExpandedChange,
}: RuntimeInspectorProps) {
    const {
        runtimeEventCount,
        currentNode,
        debateMode,
        replayEnabled,
        isDocumentVisible,
    } = useRuntimeViewState();
    const { exitReplay } = useRuntimeActions();
    const [expanded, setExpanded] = useState(defaultExpanded);
    const [activeTab, setActiveTab] = useState<InspectorTab>('timeline');
    const isCollapsed = !expanded && !fillHeight;
    const shouldMountActiveTab = expanded && isDocumentVisible;

    const setExpandedState = (value: boolean | ((previous: boolean) => boolean)) => {
        setExpanded((previous) => {
            const next = typeof value === 'function' ? value(previous) : value;
            onExpandedChange?.(next);
            return next;
        });
    };

    const summaryText = useMemo(() => {
        if (activeTab === 'timeline') {
            return `${runtimeEventCount} 条事件${replayEnabled ? ' · 回放' : ''}`;
        }
        if (activeTab === 'graph') {
            const currentLabel = getLiveGraphNodeLabel(currentNode, debateMode);
            return currentLabel ? `当前节点: ${currentLabel}` : '查看运行节点与路径';
        }
        return '查看记忆写入与知识图谱';
    }, [activeTab, currentNode, debateMode, replayEnabled, runtimeEventCount]);

    const headerIndicator = useMemo(() => {
        if (!replayEnabled) return null;
        return (
            <span
                style={{
                    fontSize: '11px',
                    color: '#fff',
                    background: 'var(--accent-rose)',
                    borderRadius: '999px',
                    padding: '2px 8px',
                    fontWeight: 700,
                }}
            >
                回放中
            </span>
        );
    }, [replayEnabled]);

    return (
        <div
            style={{
                width: isCollapsed ? 'auto' : '100%',
                height: fillHeight ? '100%' : 'auto',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                flex: isCollapsed ? '0 0 auto' : undefined,
                alignSelf: isCollapsed ? 'flex-start' : 'stretch',
            }}
        >
            <button
                onClick={() => setExpandedState((prev) => !prev)}
                style={{
                    flex: '0 0 auto',
                    width: isCollapsed ? 'auto' : '100%',
                    minWidth: isCollapsed ? 'auto' : 0,
                    border: '1px solid var(--border-subtle)',
                    borderRadius: isCollapsed ? '999px' : 'var(--radius-lg)',
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)',
                    padding: isCollapsed ? '7px 11px' : '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    cursor: 'pointer',
                    boxShadow: isCollapsed ? 'var(--shadow-xs)' : '0 10px 30px rgba(15, 23, 42, 0.08)',
                    backdropFilter: isCollapsed ? undefined : 'blur(14px)',
                    overflow: 'hidden',
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
                    {!isCollapsed && (
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
                    )}
                    {!isCollapsed && headerIndicator}
                </span>
                {!isCollapsed && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {summaryText}
                    </span>
                )}
            </button>

            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        initial={fillHeight ? { opacity: 0 } : { opacity: 0, y: -8, height: 0 }}
                        animate={fillHeight ? { opacity: 1 } : { opacity: 1, y: 0, height: 'auto' }}
                        exit={fillHeight ? { opacity: 0 } : { opacity: 0, y: -6, height: 0 }}
                        transition={{ duration: fillHeight ? 0.16 : 0.22 }}
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
                            willChange: 'opacity',
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

                            {replayEnabled && (
                                <button
                                    onClick={() => {
                                        exitReplay();
                                    }}
                                    style={{
                                        border: 'none',
                                        borderRadius: '999px',
                                        padding: '6px 14px',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        color: '#fff',
                                        background: 'var(--accent-emerald)',
                                        boxShadow: '0 0 8px rgba(16, 185, 129, 0.35)',
                                    }}
                                >
                                    回到实时
                                </button>
                            )}

                            <button
                                onClick={() => setExpandedState(false)}
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
                                {!shouldMountActiveTab && (
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px' }}>
                                        标签页恢复后会同步观察器视图。
                                    </div>
                                )}
                                {shouldMountActiveTab && activeTab === 'timeline' && <ExecutionTimeline embedded fillHeight={fillHeight} />}
                                {shouldMountActiveTab && activeTab === 'graph' && <LiveGraph embedded />}
                                {shouldMountActiveTab && activeTab === 'memory' && <MemoryPanel embedded />}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
