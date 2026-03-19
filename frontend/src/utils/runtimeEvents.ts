import type { DebatePhase, RuntimeEvent } from '../types';
import { isRecord } from './typeGuards';

const LEGACY_SCHEMA_VERSION = 'legacy';

function asString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function buildLegacyPayload(raw: Record<string, unknown>): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
        if (
            key === 'type' ||
            key === 'phase' ||
            key === 'event_id' ||
            key === 'schema_version' ||
            key === 'session_id' ||
            key === 'seq' ||
            key === 'timestamp' ||
            key === 'source' ||
            key === 'payload'
        ) {
            continue;
        }
        payload[key] = value;
    }
    return payload;
}

export function normalizeRuntimeEvent(raw: unknown): RuntimeEvent | null {
    if (!isRecord(raw)) {
        return null;
    }

    const eventType = asString(raw.type);
    if (!eventType) {
        return null;
    }

    if (isRecord(raw.payload) && asString(raw.event_id) && asString(raw.timestamp)) {
        return {
            schema_version: asString(raw.schema_version) ?? LEGACY_SCHEMA_VERSION,
            event_id: asString(raw.event_id)!,
            session_id: asString(raw.session_id) ?? '',
            seq: asNumber(raw.seq) ?? -1,
            timestamp: asString(raw.timestamp)!,
            source: asString(raw.source) ?? 'runtime',
            type: eventType,
            phase: asString(raw.phase) as DebatePhase | undefined,
            payload: raw.payload,
        };
    }

    return {
        schema_version: LEGACY_SCHEMA_VERSION,
        event_id: `legacy-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
        session_id: asString(raw.session_id) ?? '',
        seq: asNumber(raw.seq) ?? -1,
        timestamp: asString(raw.timestamp) ?? new Date().toISOString(),
        source: asString(raw.source) ?? 'legacy',
        type: eventType,
        phase: asString(raw.phase) as DebatePhase | undefined,
        payload: buildLegacyPayload(raw),
    };
}
