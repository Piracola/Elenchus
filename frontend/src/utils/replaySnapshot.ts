import type { RuntimeEvent } from '../types';
import { normalizeRuntimeEvent } from './runtimeEvents';
import { isRecord } from './typeGuards';

const SNAPSHOT_VERSION = 'runtime-events.v1';

interface RuntimeEventSnapshot {
    version: string;
    exported_at: string;
    event_count: number;
    trajectory_checksum: string;
    events: RuntimeEvent[];
}

function eventSort(a: RuntimeEvent, b: RuntimeEvent): number {
    const aSeq = a.seq >= 0 ? a.seq : Number.MAX_SAFE_INTEGER;
    const bSeq = b.seq >= 0 ? b.seq : Number.MAX_SAFE_INTEGER;
    if (aSeq !== bSeq) {
        return aSeq - bSeq;
    }

    const aTime = Date.parse(a.timestamp);
    const bTime = Date.parse(b.timestamp);
    const safeATime = Number.isFinite(aTime) ? aTime : 0;
    const safeBTime = Number.isFinite(bTime) ? bTime : 0;
    if (safeATime !== safeBTime) {
        return safeATime - safeBTime;
    }

    return a.event_id.localeCompare(b.event_id);
}

function stableSerialize(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);

    if (Array.isArray(value)) {
        return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
    }

    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`);
        return `{${entries.join(',')}}`;
    }

    return JSON.stringify(String(value));
}

function fnv1a32(input: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

export function computeRuntimeEventsChecksum(events: RuntimeEvent[]): string {
    const canonical = events
        .map((event) => stableSerialize([
            event.schema_version,
            event.event_id,
            event.session_id,
            event.seq,
            event.timestamp,
            event.source,
            event.type,
            event.phase ?? null,
            event.payload,
        ]))
        .join('|');

    return `fnv1a32-${fnv1a32(canonical)}-${events.length}`;
}

export function normalizeSnapshotEvents(rawEvents: unknown[]): RuntimeEvent[] {
    const parsed: RuntimeEvent[] = [];
    const seenIds = new Set<string>();

    for (const item of rawEvents) {
        const event = normalizeRuntimeEvent(item);
        if (!event) continue;
        if (seenIds.has(event.event_id)) continue;
        seenIds.add(event.event_id);
        parsed.push(event);
    }

    return parsed.sort(eventSort);
}

export function serializeRuntimeEventsSnapshot(events: RuntimeEvent[]): string {
    const sortedEvents = [...events].sort(eventSort);
    const snapshot: RuntimeEventSnapshot = {
        version: SNAPSHOT_VERSION,
        exported_at: new Date().toISOString(),
        event_count: sortedEvents.length,
        trajectory_checksum: computeRuntimeEventsChecksum(sortedEvents),
        events: sortedEvents,
    };
    return JSON.stringify(snapshot, null, 2);
}

export function parseRuntimeEventsSnapshot(raw: string): RuntimeEvent[] {
    let parsedRaw: unknown;
    try {
        parsedRaw = JSON.parse(raw);
    } catch (error) {
        throw new Error(
            `Unable to parse replay snapshot: ${
                error instanceof Error ? error.message : 'invalid JSON'
            }`,
        );
    }

    let rawEvents: unknown[] | null = null;
    let checksum: string | null = null;
    if (Array.isArray(parsedRaw)) {
        rawEvents = parsedRaw;
    } else if (isRecord(parsedRaw) && Array.isArray(parsedRaw.events)) {
        rawEvents = parsedRaw.events;
        const checksumRaw = parsedRaw.trajectory_checksum;
        if (typeof checksumRaw === 'string' && checksumRaw.trim()) {
            checksum = checksumRaw;
        }
    }

    if (!rawEvents) {
        throw new Error('Replay snapshot is missing events[]');
    }

    const events = normalizeSnapshotEvents(rawEvents);
    if (!events.length) {
        throw new Error('Replay snapshot has no usable events');
    }

    if (checksum) {
        const actual = computeRuntimeEventsChecksum(events);
        if (actual !== checksum) {
            throw new Error('Replay snapshot consistency check failed');
        }
    }

    return events;
}
