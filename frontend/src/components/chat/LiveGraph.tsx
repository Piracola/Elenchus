/**
 * LiveGraph - runtime graph view with node activation and edge flow.
 * Syncs with timeline focus and supports replay-aware navigation.
 */

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useDebateStore } from '../../stores/debateStore';
import {
    buildNodeHeat,
    edgeId,
    eventToGraphNode,
    findLatestEventIdByNode,
    findPreviousNode,
    getLiveGraphDefinition,
    getLiveGraphNodeLabel,
    hasEdge,
} from '../../utils/liveGraph';

const NODE_COLOR: Record<string, string> = {
    manage_context: 'var(--accent-indigo)',
    set_speaker: 'var(--accent-indigo)',
    team_discussion: 'var(--accent-cyan)',
    speaker: 'var(--color-proposer)',
    sophistry_speaker: 'var(--mode-sophistry-accent)',
    tool_executor: 'var(--accent-cyan)',
    jury_discussion: 'var(--accent-indigo)',
    judge: 'var(--color-judge)',
    sophistry_observer: 'var(--mode-sophistry-accent)',
    advance_turn: 'var(--accent-amber)',
    consensus: 'var(--accent-cyan)',
    sophistry_postmortem: 'var(--accent-amber)',
    end: 'var(--accent-rose)',
};

type LiveGraphProps = {
    compact?: boolean;
    embedded?: boolean;
};

function edgePath(from: { x: number; y: number }, to: { x: number; y: number }, curve = 0): string {
    if (!curve) {
        return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    }

    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / len;
    const ny = dx / len;
    const cx = mx + nx * curve;
    const cy = my + ny * curve;
    return `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;
}

export default function LiveGraph({ compact = false, embedded = false }: LiveGraphProps) {
    const debateMode = useDebateStore((state) => state.currentSession?.debate_mode ?? 'standard');
    const visibleRuntimeEvents = useDebateStore((state) => state.visibleRuntimeEvents);
    const currentNode = useDebateStore((state) => state.currentNode);
    const focusedRuntimeEventId = useDebateStore((state) => state.focusedRuntimeEventId);
    const setFocusedRuntimeEventId = useDebateStore((state) => state.setFocusedRuntimeEventId);
    const replayEnabled = useDebateStore((state) => state.replayEnabled);
    const exitReplay = useDebateStore((state) => state.exitReplay);
    const [collapsed, setCollapsed] = useState(embedded ? false : compact);
    const graphDefinition = useMemo(
        () => getLiveGraphDefinition(debateMode),
        [debateMode],
    );

    const focusedEvent = focusedRuntimeEventId
        ? visibleRuntimeEvents.find((event) => event.event_id === focusedRuntimeEventId) ?? null
        : null;

    const activeGraph = embedded || !collapsed;

    const nodeMap = useMemo(
        () =>
            Object.fromEntries(
                graphDefinition.nodes.map((node) => [node.id, node]),
            ) as Record<string, { id: string; label: string; x: number; y: number }>,
        [graphDefinition.nodes],
    );

    const nodeEvents = useMemo(() => {
        if (!activeGraph) return [];
        return visibleRuntimeEvents
            .map((event) => ({ event, node: eventToGraphNode(event, debateMode) }))
            .filter((item): item is { event: typeof visibleRuntimeEvents[number]; node: string } => Boolean(item.node));
    }, [activeGraph, debateMode, visibleRuntimeEvents]);

    const latestNode = nodeEvents.length ? nodeEvents[nodeEvents.length - 1].node : null;
    const activeNode = useMemo(() => {
        const focusedNode = eventToGraphNode(focusedEvent, debateMode);
        if (focusedNode) return focusedNode;

        if (!replayEnabled && currentNode && nodeMap[currentNode]) {
            return currentNode;
        }
        return latestNode;
    }, [focusedEvent, replayEnabled, currentNode, latestNode, nodeMap, debateMode]);
    const activeNodeLabel = getLiveGraphNodeLabel(activeNode, debateMode);

    const previousNode = useMemo(() => {
        if (!activeGraph) return null;
        if (focusedRuntimeEventId) {
            return findPreviousNode(visibleRuntimeEvents, focusedRuntimeEventId, debateMode);
        }
        return nodeEvents.length > 1 ? nodeEvents[nodeEvents.length - 2].node : null;
    }, [activeGraph, debateMode, focusedRuntimeEventId, nodeEvents, visibleRuntimeEvents]);

    const activeEdge = useMemo(() => {
        if (!activeNode || !previousNode) return null;
        return hasEdge(previousNode, activeNode, debateMode) ? edgeId(previousNode, activeNode) : null;
    }, [activeNode, debateMode, previousNode]);

    const heatMap = useMemo(
        () => (activeGraph ? buildNodeHeat(visibleRuntimeEvents, debateMode) : {}),
        [activeGraph, debateMode, visibleRuntimeEvents],
    );
    const maxHeat = useMemo(() => {
        const values = Object.values(heatMap);
        return values.length ? Math.max(...values) : 1;
    }, [heatMap]);

    const latestEventByNode = useMemo(() => {
        if (!activeGraph) {
            return Object.fromEntries(graphDefinition.nodes.map((node) => [node.id, null]));
        }
        const map: Record<string, string | null> = {};
        for (const node of graphDefinition.nodes) {
            map[node.id] = findLatestEventIdByNode(visibleRuntimeEvents, node.id, debateMode);
        }
        return map;
    }, [activeGraph, debateMode, graphDefinition.nodes, visibleRuntimeEvents]);

    const viewBoxWidth = useMemo(
        () => Math.max(...graphDefinition.nodes.map((node) => node.x)) + 80,
        [graphDefinition.nodes],
    );
    const viewBoxHeight = useMemo(
        () => Math.max(...graphDefinition.nodes.map((node) => node.y)) + 80,
        [graphDefinition.nodes],
    );

    const graphContent = (
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
                    padding: '8px 10px 12px',
                }}
            >
                <svg
                    viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
                    width="100%"
                    height={220}
                    role="img"
                    aria-label="实时运行图"
                >
                    <defs>
                        <marker
                            id="graph-arrow"
                            markerWidth="7"
                            markerHeight="7"
                            refX="6.2"
                            refY="3.5"
                            orient="auto"
                        >
                            <polygon points="0 0, 7 3.5, 0 7" fill="var(--text-muted)" />
                        </marker>
                    </defs>

                    {graphDefinition.edges.map((edge) => {
                        const from = nodeMap[edge.from];
                        const to = nodeMap[edge.to];
                        if (!from || !to) return null;

                        const path = edgePath(from, to, edge.curve);
                        const isActive = activeEdge === edge.id;
                        return (
                            <g key={edge.id}>
                                <path
                                    d={path}
                                    fill="none"
                                    stroke="var(--border-subtle)"
                                    strokeWidth={1.6}
                                    markerEnd="url(#graph-arrow)"
                                />
                                {isActive && (
                                    <motion.path
                                        d={path}
                                        fill="none"
                                        stroke="var(--accent-cyan)"
                                        strokeWidth={3}
                                        strokeDasharray="8 8"
                                        animate={{ strokeDashoffset: [0, -32] }}
                                        transition={{ repeat: Infinity, duration: 1.3, ease: 'linear' }}
                                    />
                                )}
                            </g>
                        );
                    })}

                    {graphDefinition.nodes.map((node) => {
                        const heat = heatMap[node.id] ?? 0;
                        const heatRatio = Math.min(1, heat / Math.max(4, maxHeat));
                        const isActive = activeNode === node.id;
                        const stroke = NODE_COLOR[node.id] ?? 'var(--accent-indigo)';
                        const latestEventId = latestEventByNode[node.id];

                        return (
                            <g key={node.id}>
                                <motion.circle
                                    cx={node.x}
                                    cy={node.y}
                                    r={26 + heatRatio * 10}
                                    fill={stroke}
                                    opacity={0.08 + heatRatio * 0.12}
                                    animate={isActive ? { opacity: [0.12, 0.28, 0.12] } : { opacity: 0.08 + heatRatio * 0.12 }}
                                    transition={isActive ? { repeat: Infinity, duration: 1.4 } : undefined}
                                />
                                <motion.circle
                                    cx={node.x}
                                    cy={node.y}
                                    r={18}
                                    fill="var(--bg-primary)"
                                    stroke={stroke}
                                    strokeWidth={isActive ? 3 : 2}
                                    style={{ cursor: latestEventId ? 'pointer' : 'default' }}
                                    whileHover={latestEventId ? { scale: 1.04 } : undefined}
                                    onClick={() => {
                                        if (!latestEventId) return;
                                        setFocusedRuntimeEventId(latestEventId);
                                    }}
                                    animate={isActive ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                                    transition={isActive ? { repeat: Infinity, duration: 1.2 } : undefined}
                                />
                                <text
                                    x={node.x}
                                    y={node.y + 4}
                                    textAnchor="middle"
                                    fontSize={10}
                                    fontWeight={700}
                                    fill="var(--text-primary)"
                                >
                                    {Math.max(1, heat)}
                                </text>
                                <text
                                    x={node.x}
                                    y={node.y + 34}
                                    textAnchor="middle"
                                    fontSize={11}
                                    fontWeight={isActive ? 700 : 500}
                                    fill={isActive ? 'var(--text-primary)' : 'var(--text-secondary)'}
                                >
                                    {node.label}
                                </text>
                            </g>
                        );
                    })}
                </svg>

                <div
                    style={{
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        padding: '2px 2px 0',
                        color: 'var(--text-muted)',
                        fontSize: '11px',
                    }}
                >
                    <span>节点中心数字表示该节点被触发的次数</span>
                    <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>
                        流动虚线表示当前执行路径
                    </span>
                    <button
                        onClick={() => {
                            if (replayEnabled) {
                                exitReplay();
                            }
                            setFocusedRuntimeEventId(null);
                        }}
                        style={{
                            marginLeft: 'auto',
                            border: 'none',
                            borderRadius: '999px',
                            padding: '4px 10px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            color: 'var(--text-secondary)',
                            background: 'var(--bg-tertiary)',
                        }}
                    >
                        回到实时
                    </button>
                </div>
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
                                background: 'var(--accent-cyan)',
                                boxShadow: '0 0 10px rgba(34, 211, 238, 0.45)',
                                flexShrink: 0,
                            }}
                        />
                        <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.01em' }}>
                            实时流程图
                        </span>
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {activeNodeLabel ? `活跃: ${activeNodeLabel}` : '空闲'}
                        {replayEnabled ? ' · 回放' : ''}
                    </span>
                </button>
            )}

            {embedded ? graphContent : (
                <AnimatePresence initial={false}>
                    {!collapsed && graphContent}
                </AnimatePresence>
            )}
        </div>
    );
}
