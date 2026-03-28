import { motion } from 'framer-motion';
import type { MemoryWriteView } from '../../../utils/memoryView';
import { typeColor } from './shared';

type MemoryWriteListProps = {
    latestWrites: MemoryWriteView[];
    activePanel: boolean;
    focusedRuntimeEventId: string | null;
    onSelectEvent: (eventId: string) => void;
};

export function MemoryWriteList({
    latestWrites,
    activePanel,
    focusedRuntimeEventId,
    onSelectEvent,
}: MemoryWriteListProps) {
    return (
        <div style={{ display: 'grid', gap: '8px' }}>
            {latestWrites.map((item) => (
                <motion.button
                    key={item.eventId}
                    whileHover={{ scale: 1.01 }}
                    onClick={() => onSelectEvent(item.eventId)}
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
    );
}
