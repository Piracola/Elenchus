import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
    getMemoryLaneY,
    type MemoryGraphModel,
    type MemoryGraphNode,
    type MemoryGraphSourceNode,
} from '../../../utils/inspector/memoryGraph';
import { MEMORY_TYPE_LABELS } from '../../../utils/inspector/memoryView';
import {
    GRAPH_HEIGHT,
    GRAPH_WIDTH,
    PANEL_SECTION_STYLE,
    pathBetween,
    sourceColor,
    typeColor,
    TYPE_ORDER,
} from './shared';

type MemoryGraphSectionProps = {
    graph: MemoryGraphModel;
    compact: boolean;
    activePanel: boolean;
    focusedRuntimeEventId: string | null;
    onSelectEvent: (eventId: string) => void;
};

export function MemoryGraphSection({
    graph,
    compact,
    activePanel,
    focusedRuntimeEventId,
    onSelectEvent,
}: MemoryGraphSectionProps) {
    const { sourceNodeMap, memoryNodeMap } = useMemo(() => ({
        sourceNodeMap: Object.fromEntries(
            graph.sourceNodes.map((node) => [node.id, node]),
        ) as Record<string, MemoryGraphSourceNode>,
        memoryNodeMap: Object.fromEntries(
            graph.memoryNodes.map((node) => [node.id, node]),
        ) as Record<string, MemoryGraphNode>,
    }), [graph]);

    return (
        <div style={PANEL_SECTION_STYLE}>
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
                                onClick={() => onSelectEvent(node.eventId)}
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
    );
}
