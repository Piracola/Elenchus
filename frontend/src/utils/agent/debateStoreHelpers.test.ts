import { describe, expect, it } from 'vitest';

import type { DialogueEntry } from '../../types';
import {
    appendDialogueWithDedupe,
    appendModeArtifact,
    computeLastEventSeq,
    getPayloadCitations,
    getPayloadNumber,
    getPayloadString,
    normalizeRuntimeEvents,
    sanitizeIncomingContent,
} from './debateStoreHelpers';
import { makeRuntimeEvent } from '../../test/runtimeEventFactory';

describe('debateStoreHelpers', () => {
    it('filters HTML provider responses into a safe message', () => {
        expect(sanitizeIncomingContent('<html><body>oops</body></html>')).toContain('Provider endpoint returned HTML');
    });

    it('dedupes repeated dialogue entries', () => {
        const entry: DialogueEntry = {
            role: 'proposer',
            content: 'hello',
            citations: [],
            timestamp: '2026-03-17T00:00:00Z',
            agent_name: '正方',
            turn: 0,
        };

        expect(appendDialogueWithDedupe([entry], entry)).toEqual([entry]);
    });

    it('dedupes and sorts normalized runtime events while dropping speech tokens', () => {
        const normalized = normalizeRuntimeEvents([
            makeRuntimeEvent({ event_id: 'evt-2', seq: 2, type: 'speech_token' }),
            makeRuntimeEvent({ event_id: 'evt-3', seq: 3 }),
            makeRuntimeEvent({ event_id: 'evt-1', seq: 1 }),
            makeRuntimeEvent({ event_id: 'evt-3', seq: 3 }),
        ]);

        expect(normalized.map((event) => event.event_id)).toEqual(['evt-1', 'evt-3']);
    });

    it('reads typed payload helpers safely', () => {
        const payload = {
            title: 'hello',
            turn: 2,
            citations: ['a', 'b', 3],
        } as unknown as Record<string, unknown>;

        expect(getPayloadString(payload, 'title')).toBe('hello');
        expect(getPayloadString(payload, 'missing')).toBeUndefined();
        expect(getPayloadNumber(payload, 'turn')).toBe(2);
        expect(getPayloadNumber(payload, 'title')).toBeUndefined();
        expect(getPayloadCitations(payload)).toEqual(['a', 'b']);
    });

    it('tracks the highest non-negative event sequence', () => {
        expect(computeLastEventSeq([
            makeRuntimeEvent({ event_id: 'evt-1', seq: -1 }),
            makeRuntimeEvent({ event_id: 'evt-2', seq: 3 }),
            makeRuntimeEvent({ event_id: 'evt-3', seq: 2 }),
        ])).toBe(3);
    });


    it('does not append duplicate mode artifacts', () => {
        const artifact = {
            type: 'round_report',
            turn: 1,
            content: 'summary',
        };

        expect(appendModeArtifact([artifact], artifact)).toEqual([artifact]);
    });
});
