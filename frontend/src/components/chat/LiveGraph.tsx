/**
 * LiveGraph - runtime graph view with node activation and edge flow.
 * Syncs with timeline focus and supports replay-aware navigation.
 */

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useDebateStore } from '../../stores/debateStore';
import {
    LIVE_GRAPH_EDGES,
    LIVE_GRAPH_NODES,
    buildNodeHeat,
    edgeId,
    eventToGraphNode,
    findLatestEventIdByNode,
    findPreviousNode,
    getLiveGraphNodeLabel,
    hasEdge,
} from '../../utils/liveGraph';

const NODE_COLOR: Record<string, string> = {
    manage_context: 'var(--accent-indigo)',
    set_speaker: 'var(--accent-indigo)',
    speaker: 'var(--color-proposer)',
    tool_executor: 'var(--accent-cyan)',
    judge: 'var(--color-judge)',
    advance_turn: 'var(--accent-amber)',
    end: 'var(--accent-rose)',
};

type LiveGraphProps = {
    compact?: boolean;
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

export default function LiveGraph({ compact = false }: LiveGraphProps) {
    const {
        visibleRuntimeEvents,
        currentNode,
        focusedRuntimeEventId,
        setFocusedRuntimeEventId,
        replayEnabled,
        exitReplay,
    } = useDebateStore();
    const [collapsed, setCollapsed] = useState(compact);

    const focusedEvent = focusedRuntimeEventId
        ? visibleRuntimeEvents.find((event) => event.event_id === focusedRuntimeEventId) ?? null
        : null;

    const nodeMap = useMemo(
        () =>
            Object.fromEntries(
                LIVE_GRAPH_NODES.map((node) => [node.id, node]),
            ) as Record<string, { id: string; label: string; x: number; y: number }>,
        [],
    );

    const nodeEvents = useMemo(
        () =>
            visibleRuntimeEvents
                .map((event) => ({ event, node: eventToGraphNode(event) }))
                .filter((item): item is { event: typeof visibleRuntimeEvents[number]; node: string } => Boolean(item.node)),
        [visibleRuntimeEvents],
    );

    const latestNode = nodeEvents.length ? nodeEvents[nodeEvents.length - 1].node : null;
    const activeNode = useMemo(() => {
        const focusedNode = eventToGraphNode(focusedEvent);
        if (focusedNode) return focusedNode;

        if (!replayEnabled && currentNode && nodeMap[currentNode]) {
            return currentNode;
        }
        return latestNode;
    }, [focusedEvent, replayEnabled, currentNode, latestNode, nodeMap]);
    const activeNodeLabel = getLiveGraphNodeLabel(activeNode);

    const previousNode = useMemo(() => {
        if (focusedRuntimeEventId) {
            return findPreviousNode(visibleRuntimeEvents, focusedRuntimeEventId);
        }
        return nodeEvents.length > 1 ? nodeEvents[nodeEvents.length - 2].node : null;
    }, [focusedRuntimeEventId, nodeEvents, visibleRuntimeEvents]);

    const activeEdge = useMemo(() => {
        if (!activeNode || !previousNode) return null;
        return hasEdge(previousNode, activeNode) ? edgeId(previousNode, activeNode) : null;
    }, [activeNode, previousNode]);

    const heatMap = useMemo(() => buildNodeHeat(visibleRuntimeEvents), [visibleRuntimeEvents]);
    const maxHeat = useMemo(() => {
        const values = Object.values(heatMap);
        return values.length ? Math.max(...values) : 1;
    }, [heatMap]);

    const latestEventByNode = useMemo(() => {
        const map: Record<string, string | null> = {};
        for (const node of LIVE_GRAPH_NODES) {
            map[node.id] = findLatestEventIdByNode(visibleRuntimeEvents, node.id);
        }
        return map;
    }, [visibleRuntimeEvents]);

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
                    {activeNodeLabel ? `活跃：${activeNodeLabel}` : '空闲'}
                    {replayEnabled ? ' · 回放' : ''}
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
                                padding: '8px 10px 12px',
                            }}
                        >
                            <svg
                                viewBox="0 0 960 260"
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

                                {LIVE_GRAPH_EDGES.map((edge) => {
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

                                {LIVE_GRAPH_NODES.map((node) => {
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
                )}
            </AnimatePresence>
        </div>
    );
}
