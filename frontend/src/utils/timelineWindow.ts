import type { RuntimeEvent } from '../types';

export const TIMELINE_PAGE_SIZE = 200;

function payloadString(event: RuntimeEvent, key: string): string {
    const value = event.payload[key];
    return typeof value === 'string' ? value : '';
}

function payloadNumber(event: RuntimeEvent, key: string): number | null {
    const value = event.payload[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function payloadRecord(event: RuntimeEvent, key: string): Record<string, unknown> | null {
    const value = event.payload[key];
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

export function buildTimelineSearchText(event: RuntimeEvent): string {
    const memory = payloadRecord(event, 'memory');
    const terms = [
        event.type,
        event.source,
        String(event.seq),
        payloadString(event, 'content'),
        payloadString(event, 'role'),
        payloadString(event, 'node'),
        payloadString(event, 'target_role'),
        payloadString(event, 'agent_name'),
        payloadString(event, 'memory_type'),
        memory ? (typeof memory.query === 'string' ? memory.query : '') : '',
        memory ? (typeof memory.content === 'string' ? memory.content : '') : '',
        memory ? (typeof memory.result === 'string' ? memory.result : '') : '',
    ];
    const turn = payloadNumber(event, 'turn');
    if (turn !== null) {
        terms.push(String(turn));
    }

    return terms
        .join(' ')
        .trim()
        .toLowerCase();
}

export function filterTimelineEvents(events: RuntimeEvent[], query: string): RuntimeEvent[] {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
        return events;
    }
    return events.filter((event) => buildTimelineSearchText(event).includes(keyword));
}

export function computeTimelinePageTotal(total: number, pageSize: number): number {
    if (total <= 0) return 1;
    return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
}

export function requiredPageCountForIndex(
    total: number,
    index: number,
    pageSize: number,
): number {
    if (total <= 0 || index < 0) return 1;
    const safeSize = Math.max(1, pageSize);
    const distanceFromEnd = total - index;
    return Math.max(1, Math.ceil(distanceFromEnd / safeSize));
}

export function sliceTimelineTail(
    events: RuntimeEvent[],
    pageSize: number,
    pageCount: number,
): RuntimeEvent[] {
    if (!events.length) return [];

    const safeSize = Math.max(1, pageSize);
    const safePages = Math.max(1, pageCount);
    const visibleCount = Math.min(events.length, safeSize * safePages);
    return events.slice(events.length - visibleCount);
}
