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
        team_dialogue_history: [],
        jury_dialogue_history: [],
        current_scores: {},
        cumulative_scores: {},
        team_config: { agents_per_team: 0, discussion_rounds: 0 },
        jury_config: { agents_per_jury: 0, discussion_rounds: 0 },
        reasoning_config: {
            steelman_enabled: true,
            counterfactual_enabled: true,
            consensus_enabled: true,
        },
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

    it('adds the current session to the sidebar list immediately', () => {
        useDebateStore.getState().reset();

        const session = {
            ...makeSession(),
            id: 'session_2',
            topic: 'Fresh debate',
            status: 'pending' as const,
            created_at: '2026-03-18T12:00:00+00:00',
            updated_at: '2026-03-18T12:00:00+00:00',
        };

        useDebateStore.getState().setCurrentSession(session);

        expect(useDebateStore.getState().sessions).toEqual([
            {
                id: 'session_2',
                topic: 'Fresh debate',
                status: 'pending',
                current_turn: 0,
                max_turns: 3,
                created_at: '2026-03-18T12:00:00+00:00',
            },
        ]);
    });

    it('restores running session state when re-opening an in-progress session', () => {
        useDebateStore.getState().reset();

        useDebateStore.getState().setCurrentSession({
            ...makeSession(),
            status: 'in_progress',
        });

        useDebateStore.getState().hydrateRuntimeEvents([], false);

        const state = useDebateStore.getState();
        expect(state.isDebating).toBe(true);
        expect(state.phase).toBe('processing');
        expect(state.currentStatus).toBe('辩论进行中...');
    });

    it('keeps the sidebar summary in sync with runtime progress', () => {
        const store = useDebateStore.getState();

        store.applyRuntimeEvent(makeEvent({
            event_id: 'evt_turn',
            seq: 1,
            type: 'turn_complete',
            payload: {
                turn: 2,
                cumulative_scores: {},
            },
        }));

        expect(useDebateStore.getState().sessions[0]).toMatchObject({
            id: 'session_1',
            current_turn: 2,
            status: 'in_progress',
        });

        store.applyRuntimeEvent(makeEvent({
            event_id: 'evt_done',
            seq: 2,
            type: 'debate_complete',
            payload: {
                total_turns: 3,
                final_scores: {},
            },
        }));

        expect(useDebateStore.getState().sessions[0]).toMatchObject({
            id: 'session_1',
            current_turn: 3,
            status: 'completed',
        });
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

    it('hydrates persisted runtime history without forcing replay mode', () => {
        useDebateStore.getState().hydrateRuntimeEvents(
            [
                makeEvent({ event_id: 'evt_10', seq: 10, type: 'status', payload: { content: 'A' } }),
                makeEvent({ event_id: 'evt_11', seq: 11, type: 'status', payload: { content: 'B' } }),
            ],
            true,
        );

        const state = useDebateStore.getState();
        expect(state.replayEnabled).toBe(false);
        expect(state.runtimeEvents).toHaveLength(2);
        expect(state.visibleRuntimeEvents).toHaveLength(2);
        expect(state.hasOlderRuntimeEvents).toBe(true);
        expect(state.lastEventSeq).toBe(11);
    });

    it('preserves replay focus when older runtime history is prepended', () => {
        const store = useDebateStore.getState();
        store.hydrateRuntimeEvents([
            makeEvent({ event_id: 'evt_3', seq: 3, type: 'status', payload: { content: 'C' } }),
            makeEvent({ event_id: 'evt_4', seq: 4, type: 'status', payload: { content: 'D' } }),
        ]);

        store.setReplayCursor(1);
        store.prependRuntimeEvents(
            [
                makeEvent({ event_id: 'evt_1', seq: 1, type: 'status', payload: { content: 'A' } }),
                makeEvent({ event_id: 'evt_2', seq: 2, type: 'status', payload: { content: 'B' } }),
            ],
            false,
        );

        const state = useDebateStore.getState();
        expect(state.runtimeEvents.map((event) => event.event_id)).toEqual([
            'evt_1',
            'evt_2',
            'evt_3',
            'evt_4',
        ]);
        expect(state.replayEnabled).toBe(true);
        expect(state.focusedRuntimeEventId).toBe('evt_4');
        expect(state.replayCursor).toBe(3);
    });

    it('retains more than 1200 runtime events for long-session replay', () => {
        const store = useDebateStore.getState();

        for (let index = 0; index < 1500; index++) {
            store.applyRuntimeEvent(
                makeEvent({
                    event_id: `evt_${index + 1}`,
                    seq: index + 1,
                    type: 'status',
                    payload: { content: `event ${index + 1}` },
                }),
            );
        }

        const state = useDebateStore.getState();
        expect(state.runtimeEvents).toHaveLength(1500);
        expect(state.visibleRuntimeEvents).toHaveLength(1500);
        expect(state.runtimeEvents[0].event_id).toBe('evt_1');
        expect(state.runtimeEvents[1499].event_id).toBe('evt_1500');
    });

    it('repairs known mojibake runtime status content on ingest', () => {
        const store = useDebateStore.getState();
        store.applyRuntimeEvent(
            makeEvent({
                event_id: 'evt_garbled',
                seq: 1,
                type: 'status',
                payload: { content: '姝ｅ湪鏁寸悊涓婁笅鏂?.' },
            }),
        );

        const state = useDebateStore.getState();
        expect(state.currentStatus).toBe('正在整理上下文...');
        expect(state.runtimeEvents[0]?.payload.content).toBe('正在整理上下文...');
    });
});
