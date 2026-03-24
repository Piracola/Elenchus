/**
 * MemoryPanel - cognitive memory stream, graph, and growth timeline.
 * Replay-aware: panel renders from the visible runtime event window.
 */

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRuntimeActions, useRuntimeViewState } from '../../hooks/useDebateViewState';
import { buildMemoryGraph, getMemoryLaneY } from '../../utils/memoryGraph';
import {
    buildMemoryWriteViews,
    MEMORY_TYPE_LABELS,
    type MemoryType,
    summarizeMemoryTypes,
} from '../../utils/memoryView';

type MemoryPanelProps = {
    compact?: boolean;
    embedded?: boolean;
};

const GRAPH_WIDTH = 960;
const GRAPH_HEIGHT = 278;
const TIMELINE_HEIGHT = 112;
const TYPE_ORDER: MemoryType[] = ['fact', 'memo', 'context'];

function typeColor(type: MemoryType): string {
    if (type === 'fact') return 'var(--accent-cyan)';
    if (type === 'memo') return 'var(--accent-amber)';
    if (type === 'context') return 'var(--accent-indigo)';
    return 'var(--text-muted)';
}

function sourceColor(sourceKey: 'tool' | 'context' | 'runtime'): string {
    if (sourceKey === 'tool') return 'var(--accent-cyan)';
    if (sourceKey === 'context') return 'var(--accent-indigo)';
    return 'var(--accent-amber)';
}

function pathBetween(
    from: { x: number; y: number },
    to: { x: number; y: number },
    curve = 0,
): string {
    if (!curve) {
        return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    }

    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const normalX = -dy / length;
    const normalY = dx / length;
    const controlX = midX + normalX * curve;
    const controlY = midY + normalY * curve;

    return `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`;
}

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

    const { sourceNodeMap, memoryNodeMap } = useMemo(() => ({
        sourceNodeMap: Object.fromEntries(
            graph.sourceNodes.map((node) => [node.id, node]),
        ) as Record<string, (typeof graph.sourceNodes)[number]>,
        memoryNodeMap: Object.fromEntries(
            graph.memoryNodes.map((node) => [node.id, node]),
        ) as Record<string, (typeof graph.memoryNodes)[number]>,
    }), [graph]);

    const sectionStyle = {
        border: '1px solid rgba(148, 163, 184, 0.16)',
        borderRadius: 'var(--radius-lg)',
        padding: '10px',
        background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.02), rgba(15, 23, 42, 0.0))',
    } as const;

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
                    <div style={sectionStyle}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '12px',
                                marginBottom: '8px',
                                flexWrap: 'wrap',
                            }}
                        >
                            <div>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    记忆图谱
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                    展示来源、时间推进和同类记忆延续关系
                                </div>
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                近 {graph.memoryNodes.length} 条写入
                            </div>
                        </div>

                        <svg
                            viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
                            width="100%"
                            height={compact ? 238 : 250}
                            role="img"
                            aria-label="记忆图谱"
                        >
                            {TYPE_ORDER.map((type) => {
                                const laneY = getMemoryLaneY(type);
                                return (
                                    <g key={`lane:${type}`}>
                                        <line
                                            x1={156}
                                            y1={laneY}
                                            x2={920}
                                            y2={laneY}
                                            stroke="rgba(148, 163, 184, 0.16)"
                                            strokeDasharray="5 7"
                                        />
                                        <text
                                            x={170}
                                            y={laneY - 10}
                                            fontSize={11}
                                            fontWeight={600}
                                            fill="var(--text-muted)"
                                        >
                                            {MEMORY_TYPE_LABELS[type]}
                                        </text>
                                    </g>
                                );
                            })}

                            {graph.edges.map((edge) => {
                                const sourceNode = sourceNodeMap[edge.from] ?? memoryNodeMap[edge.from];
                                const targetNode = sourceNodeMap[edge.to] ?? memoryNodeMap[edge.to];
                                if (!sourceNode || !targetNode) return null;

                                const targetMemoryNode = edge.to.startsWith('memory:')
                                    ? memoryNodeMap[edge.to]
                                    : null;

                                let path = pathBetween(sourceNode, targetNode);
                                let stroke = 'rgba(148, 163, 184, 0.32)';
                                let strokeWidth = 1.6;
                                let strokeDasharray: string | undefined;

                                if (edge.kind === 'timeline') {
                                    path = pathBetween(sourceNode, targetNode, -18);
                                    stroke = 'rgba(71, 85, 105, 0.44)';
                                    strokeDasharray = '7 7';
                                } else if (edge.kind === 'continuity') {
                                    path = pathBetween(
                                        sourceNode,
                                        targetNode,
                                        sourceNode.y === targetNode.y ? -32 : -22,
                                    );
                                    if (targetMemoryNode) {
                                        stroke = typeColor(targetMemoryNode.type);
                                        strokeWidth = 2;
                                    }
                                } else if ('key' in sourceNode) {
                                    stroke = sourceColor(sourceNode.key);
                                }

                                return (
                                    <path
                                        key={edge.id}
                                        d={path}
                                        fill="none"
                                        stroke={stroke}
                                        strokeWidth={strokeWidth}
                                        strokeDasharray={strokeDasharray}
                                        opacity={edge.kind === 'source' ? 0.48 : 0.86}
                                    />
                                );
                            })}

                            {graph.sourceNodes.map((node) => (
                                <g key={node.id}>
                                    <circle
                                        cx={node.x}
                                        cy={node.y}
                                        r={node.active ? 18 : 15}
                                        fill="var(--bg-primary)"
                                        stroke={sourceColor(node.key)}
                                        strokeWidth={node.active ? 2.8 : 1.8}
                                        opacity={node.active ? 1 : 0.45}
                                    />
                                    <text
                                        x={node.x + 28}
                                        y={node.y + 4}
                                        fontSize={11}
                                        fontWeight={node.active ? 700 : 500}
                                        fill={node.active ? 'var(--text-primary)' : 'var(--text-muted)'}
                                    >
                                        {node.label}
                                    </text>
                                </g>
                            ))}

                            {graph.memoryNodes.map((node) => {
                                const isFocused = focusedRuntimeEventId === node.eventId;
                                return (
                                    <g key={node.id}>
                                        <motion.circle
                                            cx={node.x}
                                            cy={node.y}
                                            r={node.radius + 5}
                                            fill={typeColor(node.type)}
                                            opacity={isFocused ? 0.16 : 0.08}
                                            animate={activePanel && isFocused ? { opacity: [0.12, 0.22, 0.12] } : { opacity: 0.08 }}
                                            transition={activePanel && isFocused ? { repeat: Infinity, duration: 1.3 } : undefined}
                                        />
                                        <motion.circle
                                            cx={node.x}
                                            cy={node.y}
                                            r={node.radius}
                                            fill="var(--bg-primary)"
                                            stroke={typeColor(node.type)}
                                            strokeWidth={isFocused ? 3 : 2}
                                            style={{ cursor: 'pointer' }}
                                            whileHover={{ scale: 1.04 }}
                                            onClick={() => setFocusedRuntimeEventId(node.eventId)}
                                        />
                                        <text
                                            x={node.x}
                                            y={node.y + 4}
                                            textAnchor="middle"
                                            fontSize={10}
                                            fontWeight={700}
                                            fill="var(--text-primary)"
                                        >
                                            {node.memoryIndex + 1}
                                        </text>
                                        <text
                                            x={node.x}
                                            y={node.y - node.radius - 9}
                                            textAnchor="middle"
                                            fontSize={10}
                                            fontWeight={600}
                                            fill="var(--text-muted)"
                                        >
                                            #{node.seq}
                                        </text>
                                        <text
                                            x={node.x}
                                            y={node.y + node.radius + 17}
                                            textAnchor="middle"
                                            fontSize={11}
                                            fontWeight={isFocused ? 700 : 600}
                                            fill={isFocused ? 'var(--text-primary)' : 'var(--text-secondary)'}
                                        >
                                            {node.shortLabel}
                                        </text>
                                        <text
                                            x={node.x}
                                            y={node.y + node.radius + 31}
                                            textAnchor="middle"
                                            fontSize={10}
                                            fill="var(--text-muted)"
                                        >
                                            {node.sourceLabel}
                                        </text>
                                    </g>
                                );
                            })}
                        </svg>

                        <div
                            style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '10px',
                                fontSize: '11px',
                                color: 'var(--text-muted)',
                            }}
                        >
                            <span>实线表示写入来源</span>
                            <span>虚线表示时间推进</span>
                            <span style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>
                                彩色弧线表示同类记忆延续
                            </span>
                            <span>点击节点会回跳并高亮对应来源发言</span>
                        </div>
                    </div>
                )}

                {graph.timeline.length > 0 && (
                    <div style={sectionStyle}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '12px',
                                marginBottom: '8px',
                                flexWrap: 'wrap',
                            }}
                        >
                            <div>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    知识时间线
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                    每次记忆写入后的累计知识量
                                </div>
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                当前累计 {graph.maxTimelineTotal}
                            </div>
                        </div>

                        <svg
                            viewBox={`0 0 ${GRAPH_WIDTH} ${TIMELINE_HEIGHT}`}
                            width="100%"
                            height={compact ? 92 : 100}
                            role="img"
                            aria-label="知识时间线"
                        >
                            <line
                                x1={170}
                                y1={84}
                                x2={900}
                                y2={84}
                                stroke="rgba(148, 163, 184, 0.22)"
                            />

                            {graph.timeline.map((point) => {
                                const totalHeight = graph.maxTimelineTotal
                                    ? (point.total / graph.maxTimelineTotal) * 44
                                    : 0;
                                let cursorY = 84;
                                const segmentOrder: MemoryType[] = ['context', 'memo', 'fact', 'unknown'];

                                return (
                                    <g key={point.id}>
                                        {segmentOrder.map((type) => {
                                            const count = point.counts[type];
                                            if (!count || point.total <= 0) return null;

                                            const segmentHeight = (count / point.total) * totalHeight;
                                            cursorY -= segmentHeight;

                                            return (
                                                <motion.rect
                                                    key={`${point.id}:${type}`}
                                                    x={point.x - 11}
                                                    y={cursorY}
                                                    width={22}
                                                    height={Math.max(3, segmentHeight)}
                                                    rx={type === 'context' ? 6 : 0}
                                                    fill={typeColor(type)}
                                                    opacity={type === point.type ? 1 : 0.78}
                                                    style={{ cursor: 'pointer' }}
                                                    whileHover={activePanel ? { scaleY: 1.04 } : undefined}
                                                    onClick={() => setFocusedRuntimeEventId(point.eventId)}
                                                />
                                            );
                                        })}
                                        <circle
                                            cx={point.x}
                                            cy={84 - totalHeight}
                                            r={4}
                                            fill={typeColor(point.type)}
                                        />
                                        <text
                                            x={point.x}
                                            y={102}
                                            textAnchor="middle"
                                            fontSize={10}
                                            fill="var(--text-muted)"
                                        >
                                            #{point.seq}
                                        </text>
                                    </g>
                                );
                            })}
                        </svg>

                        <div
                            style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '10px',
                                fontSize: '11px',
                                color: 'var(--text-muted)',
                            }}
                        >
                            {TYPE_ORDER.map((type) => (
                                <span key={`legend:${type}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                    <span
                                        style={{
                                            width: '8px',
                                            height: '8px',
                                            borderRadius: '999px',
                                            background: typeColor(type),
                                        }}
                                    />
                                    {MEMORY_TYPE_LABELS[type]}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                <div style={{ display: 'grid', gap: '8px' }}>
                    {latestWrites.map((item) => (
                        <motion.button
                            key={item.eventId}
                            whileHover={{ scale: 1.01 }}
                            onClick={() => setFocusedRuntimeEventId(item.eventId)}
                            style={{
                                border: focusedRuntimeEventId === item.eventId
                                    ? `1px solid ${typeColor(item.type)}`
                                    : '1px solid transparent',
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
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: '6px',
                                    marginBottom: '6px',
                                    fontSize: '10px',
                                    color: 'var(--text-muted)',
                                }}
                            >
                                <span>{item.sourceSummary}</span>
                                {item.agentName && <span>{item.agentName}</span>}
                                <span>记忆 {item.memoryIndex + 1}/{item.totalMemories}</span>
                            </div>

                            {item.sourceExcerpt && (
                                <div
                                    style={{
                                        marginBottom: '6px',
                                        padding: '7px 8px',
                                        borderRadius: 'var(--radius-sm)',
                                        background: 'rgba(148, 163, 184, 0.08)',
                                        fontSize: '10px',
                                        color: 'var(--text-muted)',
                                        display: '-webkit-box',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                    }}
                                >
                                    来源片段：{item.sourceExcerpt}
                                </div>
                            )}

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

                            <div style={{ display: 'grid', gap: '4px' }}>
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
                                        animate={activePanel ? { width: `${item.importance}%` } : { width: `${item.importance}%` }}
                                        transition={activePanel ? { duration: 0.35 } : undefined}
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
