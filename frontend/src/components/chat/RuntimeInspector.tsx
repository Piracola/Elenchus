import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    Activity,
    ChevronDown,
    ChevronUp,
    GitBranch,
    History,
    Radio,
    X,
} from 'lucide-react';
import { useRuntimeViewState, useRuntimeActions } from '../../hooks/useDebateViewState';
import { getLiveGraphNodeLabel } from '../../utils/viz/liveGraph';
import ExecutionTimeline from './ExecutionTimeline';
import LiveGraph from './LiveGraph';
import MemoryPanel from './MemoryPanel';

type InspectorTab = 'timeline' | 'graph' | 'memory';

type RuntimeInspectorProps = {
    defaultExpanded?: boolean;
    expanded?: boolean;
    fillHeight?: boolean;
    mode?: 'inline' | 'floating';
    onExpandedChange?: (expanded: boolean) => void;
};

const TAB_LABELS: Record<InspectorTab, string> = {
    timeline: '执行时间线',
    graph: '流程图',
    memory: '记忆',
};

const TAB_DESCRIPTIONS: Record<InspectorTab, string> = {
    timeline: '查看执行顺序、事件状态与回放细节',
    graph: '查看当前节点、路径切换与流程热度',
    memory: '查看记忆写入、图谱关系与时间推进',
};

const TAB_ICONS: Record<InspectorTab, typeof History> = {
    timeline: History,
    graph: GitBranch,
    memory: Activity,
};

function tabAccent(tab: InspectorTab): string {
    if (tab === 'timeline') return 'var(--accent-indigo)';
    if (tab === 'graph') return 'var(--accent-cyan)';
    return 'var(--accent-amber)';
}

export default function RuntimeInspector({
    defaultExpanded = false,
    expanded,
    fillHeight = false,
    mode = 'inline',
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
    const controlled = expanded !== undefined;
    const [internalExpanded, setInternalExpanded] = useState(() => (
        controlled ? false : defaultExpanded
    ));
    const [activeTab, setActiveTab] = useState<InspectorTab>('timeline');
    const isExpanded = controlled ? expanded : internalExpanded;
    const isCollapsed = !isExpanded && !fillHeight;
    const shouldMountActiveTab = isExpanded && isDocumentVisible;
    const isFloating = mode === 'floating';

    const setExpandedState = (value: boolean | ((previous: boolean) => boolean)) => {
        const previous = isExpanded;
        const next = typeof value === 'function' ? value(previous) : value;
        if (!controlled) {
            setInternalExpanded(next);
        }
        onExpandedChange?.(next);
    };

    const summaryText = useMemo(() => {
        if (activeTab === 'timeline') {
            return replayEnabled ? `回放中 · ${runtimeEventCount} 条事件` : `${runtimeEventCount} 条事件`;
        }
        if (activeTab === 'graph') {
            const currentLabel = getLiveGraphNodeLabel(currentNode, debateMode);
            return currentLabel ? `当前节点：${currentLabel}` : '查看运行节点与路径';
        }
        return '查看记忆写入、图谱和知识时间线';
    }, [activeTab, currentNode, debateMode, replayEnabled, runtimeEventCount]);

    const headerTone = tabAccent(activeTab);
    const ActiveTabIcon = TAB_ICONS[activeTab];

    const headerButtonStyle = {
        border: '1px solid var(--border-subtle)',
        borderRadius: '999px',
        padding: '6px 10px',
        fontSize: '11px',
        fontWeight: 600,
        cursor: 'pointer',
        background: 'var(--bg-secondary)',
        color: 'var(--text-secondary)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        whiteSpace: 'nowrap' as const,
    };

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
                title={isExpanded ? '收起运行观察器' : '展开运行观察器'}
                style={{
                    flex: '0 0 auto',
                    width: isCollapsed ? 'auto' : '100%',
                    minWidth: isCollapsed ? 'auto' : 0,
                    border: '1px solid var(--border-subtle)',
                    borderRadius: isCollapsed ? '999px' : 'var(--radius-lg)',
                    background: isFloating && !isCollapsed
                        ? 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.94))'
                        : 'var(--bg-card)',
                    color: 'var(--text-primary)',
                    padding: isCollapsed ? '8px 12px' : '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    cursor: 'pointer',
                    boxShadow: isCollapsed
                        ? 'var(--shadow-xs)'
                        : '0 10px 30px rgba(15, 23, 42, 0.08)',
                    backdropFilter: isCollapsed ? undefined : 'blur(14px)',
                    overflow: 'hidden',
                }}
            >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <span
                        style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: headerTone,
                            boxShadow: `0 0 10px ${headerTone}`,
                            flexShrink: 0,
                        }}
                    />
                    <span
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            minWidth: 0,
                        }}
                    >
                        <ActiveTabIcon size={14} />
                        <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.01em' }}>
                            运行观察器
                        </span>
                    </span>
                    {!isCollapsed && (
                        <span
                            style={{
                                fontSize: '11px',
                                color: headerTone,
                                whiteSpace: 'nowrap',
                                padding: '3px 8px',
                                borderRadius: '999px',
                                background: `${headerTone}14`,
                                border: `1px solid ${headerTone}26`,
                            }}
                        >
                            {TAB_LABELS[activeTab]}
                        </span>
                    )}
                    {!isCollapsed && replayEnabled && (
                        <span
                            style={{
                                fontSize: '11px',
                                color: '#fff',
                                background: 'var(--accent-rose)',
                                borderRadius: '999px',
                                padding: '3px 8px',
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                            }}
                        >
                            <Radio size={11} />
                            回放中
                        </span>
                    )}
                </span>

                <span
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '10px',
                        minWidth: 0,
                        flexShrink: 0,
                    }}
                >
                    {!isCollapsed && (
                        <span
                            style={{
                                fontSize: '11px',
                                color: 'var(--text-muted)',
                                whiteSpace: 'nowrap',
                                maxWidth: isFloating ? '280px' : '220px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}
                        >
                            {summaryText}
                        </span>
                    )}
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
            </button>

            <AnimatePresence initial={false}>
                {isExpanded && (
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
                                padding: '10px 12px',
                                borderBottom: '1px solid var(--border-subtle)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px',
                                background: 'linear-gradient(180deg, rgba(255,255,255,0.94), rgba(248,250,252,0.88))',
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
                                <div style={{ minWidth: 0 }}>
                                    <div
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            fontSize: '13px',
                                            fontWeight: 700,
                                            color: 'var(--text-primary)',
                                        }}
                                    >
                                        <ActiveTabIcon size={15} color={headerTone} />
                                        {TAB_LABELS[activeTab]}
                                    </div>
                                    <div
                                        style={{
                                            marginTop: '4px',
                                            fontSize: '11px',
                                            color: 'var(--text-muted)',
                                        }}
                                    >
                                        {TAB_DESCRIPTIONS[activeTab]}
                                    </div>
                                </div>

                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        flexWrap: 'wrap',
                                        justifyContent: 'flex-end',
                                    }}
                                >
                                    {replayEnabled && (
                                        <button
                                            onClick={() => {
                                                exitReplay();
                                            }}
                                            style={{
                                                ...headerButtonStyle,
                                                background: 'rgba(16, 185, 129, 0.10)',
                                                color: 'var(--accent-emerald)',
                                                border: '1px solid rgba(16, 185, 129, 0.24)',
                                            }}
                                        >
                                            <Radio size={12} />
                                            回到实时
                                        </button>
                                    )}

                                    <button
                                        onClick={() => setExpandedState(false)}
                                        style={headerButtonStyle}
                                    >
                                        <X size={12} />
                                        收起
                                    </button>
                                </div>
                            </div>

                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    flexWrap: 'wrap',
                                }}
                            >
                                {(['timeline', 'graph', 'memory'] as InspectorTab[]).map((tab) => {
                                    const active = tab === activeTab;
                                    const accent = tabAccent(tab);
                                    const TabIcon = TAB_ICONS[tab];
                                    return (
                                        <button
                                            key={tab}
                                            onClick={() => setActiveTab(tab)}
                                            style={{
                                                border: active
                                                    ? `1px solid ${accent}33`
                                                    : '1px solid var(--border-subtle)',
                                                borderRadius: '999px',
                                                padding: '7px 12px',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                color: active ? accent : 'var(--text-secondary)',
                                                background: active ? `${accent}14` : 'var(--bg-secondary)',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '7px',
                                            }}
                                        >
                                            <TabIcon size={13} />
                                            {TAB_LABELS[tab]}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div
                            style={{
                                padding: '10px',
                                display: 'flex',
                                flexDirection: 'column',
                                flex: 1,
                                minHeight: 0,
                                overflow: 'hidden',
                                background: 'linear-gradient(180deg, rgba(248, 250, 252, 0.94), rgba(248, 250, 252, 0.78))',
                            }}
                        >
                            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                                {!shouldMountActiveTab && (
                                    <div
                                        style={{
                                            fontSize: '12px',
                                            color: 'var(--text-muted)',
                                            padding: '8px',
                                        }}
                                    >
                                        页面恢复可见后会继续同步运行观察器内容。
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
