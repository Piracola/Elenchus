import { describe, expect, it } from 'vitest';

import type { RuntimeEvent } from '../types';
import {
    computeRuntimeEventsChecksum,
    parseRuntimeEventsSnapshot,
    serializeRuntimeEventsSnapshot,
} from './replaySnapshot';

function makeEvent(overrides: Partial<RuntimeEvent>): RuntimeEvent {
    return {
        schema_version: '2026-03-17',
        event_id: 'evt_default',
        session_id: 'abc123def456',
        seq: 1,
        timestamp: '2026-03-17T00:00:00+00:00',
        source: 'runtime.orchestrator',
        type: 'status',
        payload: {},
        ...overrides,
    };
}

describe('replaySnapshot utils', () => {
    it('serializes snapshot with checksum metadata', () => {
        const raw = serializeRuntimeEventsSnapshot([
            makeEvent({ event_id: 'evt_1', seq: 1 }),
        ]);
        const parsed = JSON.parse(raw) as {
            version: string;
            event_count: number;
            trajectory_checksum: string;
            events: RuntimeEvent[];
        };

        expect(parsed.version).toBe('runtime-events.v1');
        expect(parsed.event_count).toBe(1);
        expect(parsed.trajectory_checksum.startsWith('fnv1a32-')).toBe(true);
        expect(parsed.events[0].event_id).toBe('evt_1');
    });

    it('parses and sorts events from snapshot object', () => {
        const raw = JSON.stringify({
            version: 'runtime-events.v1',
            events: [
                makeEvent({ event_id: 'evt_3', seq: 3 }),
                makeEvent({ event_id: 'evt_1', seq: 1 }),
                makeEvent({ event_id: 'evt_2', seq: 2 }),
                makeEvent({ event_id: 'evt_2', seq: 2 }),
            ],
        });

        const events = parseRuntimeEventsSnapshot(raw);
        expect(events.map((event) => event.event_id)).toEqual(['evt_1', 'evt_2', 'evt_3']);
    });

    it('supports raw event arrays and rejects invalid payloads', () => {
        const rawArray = JSON.stringify([
            makeEvent({ event_id: 'evt_1', seq: 1 }),
            { type: 'status', content: 'legacy payload' },
        ]);
        const events = parseRuntimeEventsSnapshot(rawArray);
        expect(events).toHaveLength(2);

        expect(() => parseRuntimeEventsSnapshot('{"foo":"bar"}')).toThrow(
            'Replay snapshot is missing events[]',
        );
    });

    it('fails consistency check when checksum mismatches', () => {
        const raw = serializeRuntimeEventsSnapshot([
            makeEvent({ event_id: 'evt_1', seq: 1 }),
            makeEvent({ event_id: 'evt_2', seq: 2 }),
        ]);
        const parsed = JSON.parse(raw) as {
            version: string;
            event_count: number;
            trajectory_checksum: string;
            events: RuntimeEvent[];
        };
        parsed.events[0] = makeEvent({ event_id: 'evt_1', seq: 9 });

        expect(() => parseRuntimeEventsSnapshot(JSON.stringify(parsed))).toThrow(
            'Replay snapshot consistency check failed',
        );
    });

    it('generates deterministic checksum for stable input', () => {
        const events = [
            makeEvent({ event_id: 'evt_1', seq: 1 }),
            makeEvent({ event_id: 'evt_2', seq: 2, payload: { role: 'proposer', content: 'A' } }),
        ];
        expect(computeRuntimeEventsChecksum(events)).toBe(computeRuntimeEventsChecksum(events));
    });
});

