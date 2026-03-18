import { describe, expect, it } from 'vitest';

import type { RuntimeEvent } from '../types';
import {
    parseRuntimeEventsSnapshot,
    serializeRuntimeEventsSnapshot,
} from './replaySnapshot';
import {
    buildTimelineSearchIndex,
    computeTimelinePageTotal,
    computeVirtualTimelineWindow,
    filterIndexedTimelineEvents,
    filterTimelineEvents,
    requiredPageCountForIndex,
    sliceTimelineTail,
} from './timelineWindow';

function makeEvent(index: number): RuntimeEvent {
    const speech = index % 2 === 0;
    const type = speech ? 'speech_end' : 'judge_score';
    return {
        schema_version: '2026-03-17',
        event_id: `evt_${index + 1}`,
        session_id: 'bench_session',
        seq: index + 1,
        timestamp: new Date(1742169600000 + index * 1000).toISOString(),
        source: 'runtime.orchestrator',
        type,
        payload: speech
            ? { role: index % 4 === 0 ? 'proposer' : 'opposer', content: `speech ${index}` }
            : { role: 'proposer', turn: Math.floor(index / 2) + 1, content: `judge ${index}` },
    };
}

describe('performance baseline (10k events)', () => {
    it('keeps timeline + replay operations within baseline budget', () => {
        const events = Array.from({ length: 10_000 }, (_, index) => makeEvent(index));

        const timelineStart = performance.now();
        const indexed = buildTimelineSearchIndex(events);
        const filtered = filterIndexedTimelineEvents(indexed, 'proposer');
        const pageTotal = computeTimelinePageTotal(filtered.length, 200);
        const requiredPages = requiredPageCountForIndex(filtered.length, 1500, 200);
        const tail = sliceTimelineTail(filtered, 200, 5);
        const virtualWindow = computeVirtualTimelineWindow(tail.length, 3200, 360, 60, 8);
        const timelineCost = performance.now() - timelineStart;

        expect(filterTimelineEvents(events, 'proposer').length).toBe(filtered.length);
        expect(filtered.length).toBeGreaterThan(0);
        expect(pageTotal).toBeGreaterThan(1);
        expect(requiredPages).toBeGreaterThan(1);
        expect(tail.length).toBe(1000);
        expect(virtualWindow.endIndex - virtualWindow.startIndex).toBeLessThan(40);
        expect(timelineCost).toBeLessThan(3000);

        const replayStart = performance.now();
        const serialized = serializeRuntimeEventsSnapshot(events);
        const parsed = parseRuntimeEventsSnapshot(serialized);
        const replayCost = performance.now() - replayStart;

        expect(parsed.length).toBe(10_000);
        expect(replayCost).toBeLessThan(8000);
    });
});
