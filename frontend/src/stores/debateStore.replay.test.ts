import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { RuntimeEvent, Session, TurnScore } from '../types';
import { useDebateStore } from './debateStore';

function makeSession(): Session {
    return {
        id: 'session_1',
        topic: 'Replay test',
        participants: ['proposer', 'opposer'],
        max_turns: 3,
        current_turn: 0,
        status: 'in_progress',
        created_at: '2026-03-17T00:00:00+00:00',
        updated_at: '2026-03-17T00:00:00+00:00',
        dialogue_history: [],
        current_scores: {},
        cumulative_scores: {},
    };
}

function makeScores(comment: string): TurnScore {
    return {
        logical_rigor: { score: 8, rationale: 'ok' },
        evidence_quality: { score: 8, rationale: 'ok' },
        rebuttal_strength: { score: 8, rationale: 'ok' },
        consistency: { score: 8, rationale: 'ok' },
        persuasiveness: { score: 8, rationale: 'ok' },
        overall_comment: comment,
    };
}

function makeEvent(overrides: Partial<RuntimeEvent>): RuntimeEvent {
    return {
        schema_version: '2026-03-17',
        event_id: 'evt_default',
        session_id: 'session_1',
        seq: 1,
        timestamp: '2026-03-17T00:00:00+00:00',
        source: 'runtime.orchestrator',
        type: 'status',
        payload: {},
        ...overrides,
    };
}

describe('debateStore replay state', () => {
    beforeEach(() => {
        useDebateStore.getState().reset();
        useDebateStore.getState().setCurrentSession(makeSession());
    });

    afterEach(() => {
        useDebateStore.getState().reset();
    });

    it('locks visible window while replay mode is active', () => {
        const store = useDebateStore.getState();
        store.applyRuntimeEvent(makeEvent({
            event_id: 'evt_1',
            seq: 1,
            type: 'speech_end',
            payload: { role: 'proposer', content: 'A' },
        }));
        store.applyRuntimeEvent(makeEvent({
            event_id: 'evt_2',
            seq: 2,
            type: 'judge_score',
            payload: { role: 'proposer', turn: 1, scores: makeScores('good') },
        }));
        store.applyRuntimeEvent(makeEvent({
            event_id: 'evt_3',
            seq: 3,
            type: 'speech_end',
            payload: { role: 'opposer', content: 'B' },
        }));

        useDebateStore.getState().setReplayCursor(0);
        expect(useDebateStore.getState().replayEnabled).toBe(true);
        expect(useDebateStore.getState().visibleRuntimeEvents).toHaveLength(1);

        useDebateStore.getState().applyRuntimeEvent(makeEvent({
            event_id: 'evt_4',
            seq: 4,
            type: 'speech_end',
            payload: { role: 'proposer', content: 'C' },
        }));

        const next = useDebateStore.getState();
        expect(next.runtimeEvents).toHaveLength(4);
        expect(next.visibleRuntimeEvents).toHaveLength(1);
        expect(next.visibleRuntimeEvents[0].event_id).toBe('evt_1');
    });

    it('returns to realtime window when exiting replay', () => {
        const store = useDebateStore.getState();
        store.applyRuntimeEvent(makeEvent({ event_id: 'evt_1', seq: 1, type: 'status' }));
        store.applyRuntimeEvent(makeEvent({ event_id: 'evt_2', seq: 2, type: 'status' }));

        useDebateStore.getState().setReplayCursor(0);
        useDebateStore.getState().exitReplay();

        const next = useDebateStore.getState();
        expect(next.replayEnabled).toBe(false);
        expect(next.visibleRuntimeEvents).toHaveLength(next.runtimeEvents.length);
        expect(next.replayCursor).toBe(next.runtimeEvents.length - 1);
    });

    it('loads imported snapshots into replay mode', () => {
        useDebateStore.getState().loadRuntimeEventSnapshot([
            makeEvent({ event_id: 'evt_1', seq: 1, type: 'status', payload: { content: 'A' } }),
            makeEvent({ event_id: 'evt_2', seq: 2, type: 'status', payload: { content: 'B' } }),
        ]);

        const state = useDebateStore.getState();
        expect(state.replayEnabled).toBe(true);
        expect(state.runtimeEvents).toHaveLength(2);
        expect(state.visibleRuntimeEvents).toHaveLength(2);
        expect(state.replayCursor).toBe(1);
        expect(state.focusedRuntimeEventId).toBe('evt_2');
    });
});

