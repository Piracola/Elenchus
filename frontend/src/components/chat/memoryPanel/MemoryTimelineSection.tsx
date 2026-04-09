import { motion } from 'framer-motion';
import type { MemoryGraphModel } from '../../../utils/inspector/memoryGraph';
import { MEMORY_TYPE_LABELS } from '../../../utils/inspector/memoryView';
import {
    GRAPH_WIDTH,
    PANEL_SECTION_STYLE,
    TIMELINE_HEIGHT,
    TIMELINE_SEGMENT_ORDER,
    typeColor,
    TYPE_ORDER,
} from './shared';

type MemoryTimelineSectionProps = {
    graph: MemoryGraphModel;
    compact: boolean;
    activePanel: boolean;
    onSelectEvent: (eventId: string) => void;
};

export function MemoryTimelineSection({
    graph,
    compact,
    activePanel,
    onSelectEvent,
}: MemoryTimelineSectionProps) {
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

                    return (
                        <g key={point.id}>
                            {TIMELINE_SEGMENT_ORDER.map((type) => {
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
                                        onClick={() => onSelectEvent(point.eventId)}
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
    );
}
