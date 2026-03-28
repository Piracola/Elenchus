import type { MemoryType } from '../../../utils/memoryView';

export const GRAPH_WIDTH = 960;
export const GRAPH_HEIGHT = 278;
export const TIMELINE_HEIGHT = 112;
export const TYPE_ORDER: MemoryType[] = ['fact', 'memo', 'context'];
export const TIMELINE_SEGMENT_ORDER: MemoryType[] = ['context', 'memo', 'fact', 'unknown'];

export const PANEL_SECTION_STYLE = {
    border: '1px solid rgba(148, 163, 184, 0.16)',
    borderRadius: 'var(--radius-lg)',
    padding: '10px',
    background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.02), rgba(15, 23, 42, 0.0))',
} as const;

export function typeColor(type: MemoryType): string {
    if (type === 'fact') return 'var(--accent-cyan)';
    if (type === 'memo') return 'var(--accent-amber)';
    if (type === 'context') return 'var(--accent-indigo)';
    return 'var(--text-muted)';
}

export function sourceColor(sourceKey: 'tool' | 'context' | 'runtime'): string {
    if (sourceKey === 'tool') return 'var(--accent-cyan)';
    if (sourceKey === 'context') return 'var(--accent-indigo)';
    return 'var(--accent-amber)';
}

export function pathBetween(
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
