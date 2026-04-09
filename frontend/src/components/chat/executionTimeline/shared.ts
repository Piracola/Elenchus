import { getLiveGraphNodeLabel } from '../../../utils/viz/liveGraph';
import { getRuntimeEventGroup } from '../../../utils/runtime/runtimeEventDictionary';
import type { RuntimeEvent } from '../../../types';

export type TimelineFilter = 'all' | 'status' | 'speech' | 'judge' | 'tool' | 'memory' | 'system' | 'error';

export type ExecutionTimelineProps = {
    compact?: boolean;
    embedded?: boolean;
    fillHeight?: boolean;
};

export const FILTERS: TimelineFilter[] = ['all', 'status', 'speech', 'judge', 'tool', 'memory', 'system', 'error'];

export const FILTER_LABELS: Record<TimelineFilter, string> = {
    all: '全部',
    status: '状态',
    speech: '发言',
    judge: '裁判',
    tool: '工具',
    memory: '记忆',
    system: '系统',
    error: '错误',
};

export const pillStyle = {
    border: 'none',
    borderRadius: '999px',
    padding: '4px 10px',
    fontSize: '11px',
    cursor: 'pointer',
} as const;

export function eventColor(type: string): string {
    const group = getRuntimeEventGroup(type);
    if (group === 'speech') return 'var(--color-proposer)';
    if (group === 'judge') return 'var(--color-judge)';
    if (group === 'tool') return 'var(--accent-cyan)';
    if (group === 'memory') return 'var(--accent-amber)';
    if (group === 'error') return 'var(--accent-rose)';
    if (group === 'system') return 'var(--text-muted)';
    return 'var(--accent-indigo)';
}

export function formatTime(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? '--:--:--'
        : date.toLocaleTimeString('zh-CN', { hour12: false });
}

export function formatJson(value: unknown): string {
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

export function summarizeEvent(
    event: RuntimeEvent,
    debateMode: 'standard' | 'sophistry_experiment' = 'standard',
): string {
    const content = event.payload.content;
    if (typeof content === 'string' && content.trim()) {
        return content.length > 72 ? `${content.slice(0, 72)}...` : content;
    }

    const role = event.payload.role;
    if (typeof role === 'string' && role) return role;

    const node = event.payload.node;
    if (typeof node === 'string' && node) return getLiveGraphNodeLabel(node, debateMode);

    return event.type;
}
