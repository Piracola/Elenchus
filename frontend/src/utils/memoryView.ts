import type { RuntimeEvent } from '../types';

export type MemoryType = 'fact' | 'memo' | 'context' | 'unknown';

export interface MemoryWriteView {
    eventId: string;
    seq: number;
    timestamp: string;
    type: MemoryType;
    source: string;
    title: string;
    content: string;
    importance: number;
    decay: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
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
        const recency = total > 1 ? index / (total - 1) : 1;
        const importance = Math.round((typeBaseImportance(type) * 0.65 + recency * 0.35) * 100);
        const decay = Math.max(0, 1 - recency * 0.9);

        return {
            eventId: event.event_id,
            seq: event.seq,
            timestamp: event.timestamp,
            type,
            source: event.source,
            title: buildMemoryTitle(type, memory),
            content: buildMemoryContent(type, memory),
            importance,
            decay,
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
