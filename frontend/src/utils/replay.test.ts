import { describe, expect, it } from 'vitest';
import type { RuntimeEvent } from '../types';
import {
    clampReplayCursor,
    deriveRuntimeViewState,
    getVisibleRuntimeEvents,
} from './replay';

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

describe('replay utils', () => {
    it('clamps cursor boundaries', () => {
        expect(clampReplayCursor(-5, 0)).toBe(-1);
        expect(clampReplayCursor(99, 3)).toBe(2);
        expect(clampReplayCursor(-2, 3)).toBe(-1);
        expect(clampReplayCursor(1.9, 4)).toBe(1);
    });

    it('builds replay-visible event window from cursor', () => {
        const events = [
            makeEvent({ event_id: 'evt_1', seq: 1 }),
            makeEvent({ event_id: 'evt_2', seq: 2 }),
            makeEvent({ event_id: 'evt_3', seq: 3 }),
        ];

        expect(getVisibleRuntimeEvents(events, false, 0)).toHaveLength(3);
        expect(getVisibleRuntimeEvents(events, true, 1).map((event) => event.event_id)).toEqual([
            'evt_1',
            'evt_2',
        ]);
    });

    it('derives runtime phase/status from replay window', () => {
        const events = [
            makeEvent({
                event_id: 'evt_1',
                type: 'status',
                phase: 'processing',
                payload: { content: '准备中', node: 'manage_context' },
            }),
            makeEvent({
                event_id: 'evt_2',
                type: 'judge_start',
                payload: {},
            }),
            makeEvent({
                event_id: 'evt_3',
                type: 'debate_complete',
                payload: {},
            }),
        ];

        const view = deriveRuntimeViewState(events, {
            phase: 'idle',
            status: '',
            node: '',
            isDebating: true,
        });

        expect(view.phase).toBe('complete');
        expect(view.status).toBe('辩论已完成');
        expect(view.isDebating).toBe(false);
        expect(view.node).toBe('judge');
    });
});
