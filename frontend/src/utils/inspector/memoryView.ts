import type { RuntimeEvent } from '../../types';
import { isRecord } from '../type/typeGuards';

export type MemoryType = 'fact' | 'memo' | 'context' | 'unknown';
export type MemorySourceKey = 'tool' | 'context' | 'runtime';

export const MEMORY_TYPE_LABELS: Record<MemoryType, string> = {
    fact: '事实',
    memo: '备忘',
    context: '上下文',
    unknown: '其他',
};

export const MEMORY_SOURCE_LABELS: Record<MemorySourceKey, string> = {
    tool: '工具检索',
    context: '上下文整理',
    runtime: '运行时写入',
};

export interface MemoryWriteView {
    eventId: string;
    seq: number;
    timestamp: string;
    type: MemoryType;
    source: string;
    sourceKey: MemorySourceKey;
    sourceLabel: string;
    title: string;
    content: string;
    importance: number;
    decay: number;
    agentName: string;
    memoryIndex: number;
    totalMemories: number;
    sourceKind: string;
    sourceTimestamp: string;
    sourceRole: string;
    sourceAgentName: string;
    sourceExcerpt: string;
    sourceSummary: string;
}

function asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function buildSourceSummary(
    sourceLabel: string,
    sourceKind: string,
    sourceAgentName: string,
    sourceRole: string,
): string {
    if (sourceKind === 'dialogue') {
        return sourceAgentName || sourceRole ? `来源发言：${sourceAgentName || sourceRole}` : '来源发言';
    }
    if (sourceKind === 'tool_call') {
        return sourceAgentName || sourceRole ? `来源检索：${sourceAgentName || sourceRole}` : '来源检索';
    }
    return sourceLabel;
}

function normalizeMemoryType(value: unknown): MemoryType {
    const raw = asString(value).toLowerCase();
    if (raw === 'fact') return 'fact';
    if (raw === 'memo') return 'memo';
    if (raw === 'context') return 'context';
    return 'unknown';
}

function typeBaseImportance(type: MemoryType): number {
    if (type === 'fact') return 0.9;
    if (type === 'memo') return 0.72;
    if (type === 'context') return 0.6;
    return 0.55;
}

function normalizeMemorySourceKey(source: string): MemorySourceKey {
    const raw = source.toLowerCase();
    if (raw.includes('tool_executor')) return 'tool';
    if (raw.includes('manage_context')) return 'context';
    return 'runtime';
}

function buildMemoryTitle(type: MemoryType, memory: Record<string, unknown>): string {
    if (type === 'fact') {
        const query = asString(memory.query);
        return query ? `事实：${query}` : '事实记忆';
    }
    if (type === 'memo') {
        const agent = asString(memory.agent_name) || asString(memory.role);
        return agent ? `备忘：${agent}` : '历史备忘';
    }
    if (type === 'context') return '上下文快照';
    return '记忆条目';
}

function buildMemoryContent(type: MemoryType, memory: Record<string, unknown>): string {
    if (type === 'fact') {
        return asString(memory.result) || asString(memory.content);
    }
    return asString(memory.content) || asString(memory.result);
}

export function buildMemoryWriteViews(events: RuntimeEvent[]): MemoryWriteView[] {
    const writes = events.filter((event) => event.type === 'memory_write');
    const total = writes.length;
    if (!total) return [];

    return writes.map((event, index) => {
        const payload = isRecord(event.payload) ? event.payload : {};
        const memory = isRecord(payload.memory) ? payload.memory : {};
        const type = normalizeMemoryType(payload.memory_type ?? memory.type);
        const sourceKey = normalizeMemorySourceKey(event.source);
        const recency = total > 1 ? index / (total - 1) : 1;
        const importance = Math.round((typeBaseImportance(type) * 0.65 + recency * 0.35) * 100);
        const decay = Math.max(0, 1 - recency * 0.9);
        const memoryIndex = asNumber(payload.memory_index) ?? index;
        const totalMemories = asNumber(payload.total_memories) ?? total;
        const agentName = asString(memory.agent_name) || asString(memory.role);
        const sourceKind = asString(payload.source_kind) || 'runtime';
        const sourceTimestamp = asString(payload.source_timestamp);
        const sourceRole = asString(payload.source_role);
        const sourceAgentName = asString(payload.source_agent_name);
        const sourceExcerpt = asString(payload.source_excerpt);
        const sourceLabel = MEMORY_SOURCE_LABELS[sourceKey];

        return {
            eventId: event.event_id,
            seq: event.seq,
            timestamp: event.timestamp,
            type,
            source: event.source,
            sourceKey,
            sourceLabel,
            title: buildMemoryTitle(type, memory),
            content: buildMemoryContent(type, memory),
            importance,
            decay,
            agentName,
            memoryIndex,
            totalMemories,
            sourceKind,
            sourceTimestamp,
            sourceRole,
            sourceAgentName,
            sourceExcerpt,
            sourceSummary: buildSourceSummary(
                sourceLabel,
                sourceKind,
                sourceAgentName,
                sourceRole,
            ),
        };
    });
}

export function summarizeMemoryTypes(items: MemoryWriteView[]): Record<MemoryType, number> {
    const summary: Record<MemoryType, number> = {
        fact: 0,
        memo: 0,
        context: 0,
        unknown: 0,
    };

    for (const item of items) {
        summary[item.type] += 1;
    }
    return summary;
}
