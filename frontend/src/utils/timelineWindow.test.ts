import { describe, expect, it } from 'vitest';

import type { RuntimeEvent } from '../types';
import {
    buildTimelineSearchIndex,
    buildTimelineSearchText,
    computeTimelinePageTotal,
    computeVirtualTimelineWindow,
    filterIndexedTimelineEvents,
    filterTimelineEvents,
    requiredPageCountForIndex,
    sliceTimelineTail,
} from './timelineWindow';

function makeEvent(overrides: Partial<RuntimeEvent>): RuntimeEvent {
    return {
        schema_version: '2026-03-17',
        event_id: 'evt_1',
        session_id: 'abc123def456',
        seq: 1,
        timestamp: '2026-03-17T00:00:00+00:00',
        source: 'runtime.orchestrator',
        type: 'status',
        payload: {},
        ...overrides,
    };
}

describe('timelineWindow utils', () => {
    it('builds searchable text with key payload terms', () => {
        const event = makeEvent({
            type: 'judge_score',
            payload: { role: 'proposer', content: 'Strong rebuttal', turn: 2 },
        });

        const text = buildTimelineSearchText(event);
        expect(text).toContain('judge_score');
        expect(text).toContain('proposer');
        expect(text).toContain('strong rebuttal');
        expect(text).toContain('2');
    });

    it('filters events by keyword', () => {
        const events = [
            makeEvent({
                event_id: 'evt_a',
                seq: 1,
                type: 'speech_end',
                payload: { role: 'proposer', content: 'Alpha point' },
            }),
            makeEvent({
                event_id: 'evt_b',
                seq: 2,
                type: 'judge_score',
                payload: { role: 'opposer', content: 'Beta response' },
            }),
            makeEvent({
                event_id: 'evt_c',
                seq: 3,
                type: 'memory_write',
                payload: {
                    memory_type: 'fact',
                    memory: { query: 'climate policy', result: 'memory fact' },
                },
            }),
        ];

        expect(filterTimelineEvents(events, 'alpha').map((event) => event.event_id)).toEqual(['evt_a']);
        expect(filterTimelineEvents(events, 'JUDGE').map((event) => event.event_id)).toEqual(['evt_b']);
        expect(filterTimelineEvents(events, 'climate').map((event) => event.event_id)).toEqual(['evt_c']);
        expect(filterTimelineEvents(events, '').map((event) => event.event_id)).toEqual(['evt_a', 'evt_b', 'evt_c']);
    });

    it('reuses prebuilt search index for repeated filtering', () => {
        const events = [
            makeEvent({
                event_id: 'evt_a',
                seq: 1,
                type: 'speech_end',
                payload: { role: 'proposer', content: 'Alpha point' },
            }),
            makeEvent({
                event_id: 'evt_b',
                seq: 2,
                type: 'judge_score',
                payload: { role: 'opposer', content: 'Beta response' },
            }),
        ];

        const index = buildTimelineSearchIndex(events);
        expect(filterIndexedTimelineEvents(index, 'alpha').map((event) => event.event_id)).toEqual(['evt_a']);
        expect(filterIndexedTimelineEvents(index, 'beta').map((event) => event.event_id)).toEqual(['evt_b']);
        expect(filterIndexedTimelineEvents(index, '').map((event) => event.event_id)).toEqual(['evt_a', 'evt_b']);
    });

    it('computes page totals and tail slices for long timeline', () => {
        const events = Array.from({ length: 9 }, (_, index) =>
            makeEvent({
                event_id: `evt_${index + 1}`,
                seq: index + 1,
            }),
        );

        expect(computeTimelinePageTotal(events.length, 4)).toBe(3);
        expect(requiredPageCountForIndex(events.length, 1, 4)).toBe(2);
        expect(sliceTimelineTail(events, 4, 1).map((event) => event.event_id)).toEqual([
            'evt_6',
            'evt_7',
            'evt_8',
            'evt_9',
        ]);
    });

    it('computes a virtual window for long visible event lists', () => {
        const window = computeVirtualTimelineWindow(500, 600, 240, 60, 3);

        expect(window.startIndex).toBe(7);
        expect(window.endIndex).toBe(17);
        expect(window.paddingTop).toBe(420);
        expect(window.paddingBottom).toBe((500 - 17) * 60);
    });
});
