import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Session, TurnScore } from '../types';
import { makeRuntimeEvent } from '../test/runtimeEventFactory';
import { useDebateStore } from './debateStore';
import { repairKnownMojibakeText } from '../utils/text/textRepair';

function makeSession(): Session {
    return {
        id: 'session_1',
        topic: 'Replay test',
        debate_mode: 'standard',
        mode_config: {},
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
        mode_artifacts: [],
        current_mode_report: null,
        final_mode_report: null,
    };
}

function makeScores(comment: string): TurnScore {
    return {
        logical_rigor: { score: 8, rationale: 'ok' },
        evidence_quality: { score: 8, rationale: 'ok' },
        topic_focus: { score: 8, rationale: 'ok' },
        rebuttal_strength: { score: 8, rationale: 'ok' },
        consistency: { score: 8, rationale: 'ok' },
        boundary_contribution: { score: 8, rationale: 'ok' },
        module_scores: {
            foundation: 8,
            confrontation: 8,
            stability: 8,
            vision: 8,
        },
        comprehensive_score: 8,
        overall_comment: comment,
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
                debate_mode: 'standard',
                status: 'pending',
                current_turn: 0,
                max_turns: 3,
                created_at: '2026-03-18T12:00:00+00:00',
            },
        ]);
    });

    it('treats a persisted in-progress session as resumable instead of live-running', () => {
        useDebateStore.getState().reset();

        useDebateStore.getState().setCurrentSession({
            ...makeSession(),
            status: 'in_progress',
        });

        useDebateStore.getState().hydrateRuntimeEvents([
            makeRuntimeEvent({
                event_id: 'evt_status',
                session_id: 'session_1',
                seq: 1,
                type: 'status',
                phase: 'judging',
                payload: { content: '裁判评估中...', node: 'judge' },
            }),
            makeRuntimeEvent({
                event_id: 'evt_fact',
                session_id: 'session_1',
                seq: 2,
                type: 'fact_check_start',
                payload: {},
            }),
        ], false);

        const state = useDebateStore.getState();
        expect(state.isDebating).toBe(false);
        expect(state.phase).toBe('idle');
        expect(state.currentStatus).toBe('');
        expect(state.currentNode).toBe('');
        expect(state.runtimeEvents).toHaveLength(2);
        expect(state.visibleRuntimeEvents).toHaveLength(2);
    });

    it('keeps terminal historical sessions on their derived terminal state', () => {
        useDebateStore.getState().reset();
        useDebateStore.getState().setCurrentSession({
            ...makeSession(),
            status: 'completed',
        });

        useDebateStore.getState().hydrateRuntimeEvents([
            makeRuntimeEvent({
                event_id: 'evt_done',
                session_id: 'session_1',
                seq: 3,
                type: 'debate_complete',
                payload: { total_turns: 3, final_scores: {} },
            }),
        ]);

        let state = useDebateStore.getState();
        expect(state.isDebating).toBe(false);
        expect(state.phase).toBe('complete');
        expect(state.currentStatus).toBe('辩论已完成');

        useDebateStore.getState().reset();
        useDebateStore.getState().setCurrentSession({
            ...makeSession(),
            status: 'error',
        });

        useDebateStore.getState().hydrateRuntimeEvents([
            makeRuntimeEvent({
                event_id: 'evt_error',
                session_id: 'session_1',
                seq: 4,
                type: 'error',
                payload: { content: '出现错误' },
            }),
        ]);

        state = useDebateStore.getState();
        expect(state.isDebating).toBe(false);
        expect(state.phase).toBe('error');
        expect(state.currentStatus).toBe('出现错误');
    });

    it('switches a resumable session into a fresh live initialization state when continuing', () => {
        const store = useDebateStore.getState();
        store.hydrateRuntimeEvents([
            makeRuntimeEvent({
                event_id: 'evt_judge',
                session_id: 'session_1',
                seq: 1,
                type: 'judge_start',
                payload: {},
            }),
        ]);

        store.setCurrentSession({
            ...makeSession(),
            status: 'in_progress',
        });
        store.hydrateRuntimeEvents([
            makeRuntimeEvent({
                event_id: 'evt_old_status',
                session_id: 'session_1',
                seq: 2,
                type: 'status',
                phase: 'judging',
                payload: { content: '裁判评估中...', node: 'judge' },
            }),
        ]);

        store.setDebating(true);
        store.setPhase('initializing', '辩论准备中...');

        const state = useDebateStore.getState();
        expect(state.isDebating).toBe(true);
        expect(state.phase).toBe('initializing');
        expect(state.currentStatus).toBe('辩论准备中...');
        expect(state.currentNode).toBe('');
        expect(state.runtimeEvents).toHaveLength(1);
        expect(state.runtimeEvents[0]?.event_id).toBe('evt_old_status');
    });

    it('keeps the sidebar summary in sync with runtime progress', () => {
        const store = useDebateStore.getState();

        store.applyRuntimeEvent(makeRuntimeEvent({
            event_id: 'evt_turn',
            session_id: 'session_1',
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

        store.applyRuntimeEvent(makeRuntimeEvent({
            event_id: 'evt_done',
            session_id: 'session_1',
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
        store.applyRuntimeEvent(makeRuntimeEvent({
            event_id: 'evt_1',
            session_id: 'session_1',
            seq: 1,
            type: 'speech_end',
            payload: { role: 'proposer', content: 'A' },
        }));
        store.applyRuntimeEvent(makeRuntimeEvent({
            event_id: 'evt_2',
            session_id: 'session_1',
            seq: 2,
            type: 'judge_score',
            payload: { role: 'proposer', turn: 1, scores: makeScores('good') },
        }));
        store.applyRuntimeEvent(makeRuntimeEvent({
            event_id: 'evt_3',
            session_id: 'session_1',
            seq: 3,
            type: 'speech_end',
            payload: { role: 'opposer', content: 'B' },
        }));

        useDebateStore.getState().setReplayCursor(0);
        expect(useDebateStore.getState().replayEnabled).toBe(true);
        expect(useDebateStore.getState().visibleRuntimeEvents).toHaveLength(1);

        useDebateStore.getState().applyRuntimeEvent(makeRuntimeEvent({
            event_id: 'evt_4',
            session_id: 'session_1',
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
        store.applyRuntimeEvent(makeRuntimeEvent({ event_id: 'evt_1', session_id: 'session_1', seq: 1, type: 'status' }));
        store.applyRuntimeEvent(makeRuntimeEvent({ event_id: 'evt_2', session_id: 'session_1', seq: 2, type: 'status' }));

        useDebateStore.getState().setReplayCursor(0);
        useDebateStore.getState().exitReplay();

        const next = useDebateStore.getState();
        expect(next.replayEnabled).toBe(false);
        expect(next.visibleRuntimeEvents).toHaveLength(next.runtimeEvents.length);
        expect(next.replayCursor).toBe(next.runtimeEvents.length - 1);
    });

    it('loads imported snapshots into replay mode', () => {
        useDebateStore.getState().loadRuntimeEventSnapshot([
            makeRuntimeEvent({ event_id: 'evt_1', session_id: 'session_1', seq: 1, type: 'status', payload: { content: 'A' } }),
            makeRuntimeEvent({ event_id: 'evt_2', session_id: 'session_1', seq: 2, type: 'status', payload: { content: 'B' } }),
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
                makeRuntimeEvent({ event_id: 'evt_10', session_id: 'session_1', seq: 10, type: 'status', payload: { content: 'A' } }),
                makeRuntimeEvent({ event_id: 'evt_11', session_id: 'session_1', seq: 11, type: 'status', payload: { content: 'B' } }),
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

    it('returns historical runtime state to a stable realtime window after replay focus cycle', () => {
        const store = useDebateStore.getState();
        store.setCurrentSession({
            ...makeSession(),
            status: 'completed',
        });
        store.hydrateRuntimeEvents(
            [
                makeRuntimeEvent({ event_id: 'evt_10', session_id: 'session_1', seq: 10, type: 'status', payload: { content: 'A' } }),
                makeRuntimeEvent({ event_id: 'evt_11', session_id: 'session_1', seq: 11, type: 'status', payload: { content: 'B' } }),
                makeRuntimeEvent({ event_id: 'evt_12', session_id: 'session_1', seq: 12, type: 'status', payload: { content: 'C' } }),
            ],
            true,
        );

        store.setReplayCursor(1);
        store.setFocusedRuntimeEventId('evt_11');

        let state = useDebateStore.getState();
        expect(state.replayEnabled).toBe(true);
        expect(state.replayCursor).toBe(1);
        expect(state.focusedRuntimeEventId).toBe('evt_11');
        expect(state.visibleRuntimeEvents.map((event) => event.event_id)).toEqual(['evt_10', 'evt_11']);

        store.exitReplay();

        state = useDebateStore.getState();
        expect(state.replayEnabled).toBe(false);
        expect(state.focusedRuntimeEventId).toBeNull();
        expect(state.replayCursor).toBe(2);
        expect(state.visibleRuntimeEvents.map((event) => event.event_id)).toEqual(['evt_10', 'evt_11', 'evt_12']);
        expect(state.hasOlderRuntimeEvents).toBe(true);
        expect(state.phase).toBe('complete');
    });

    it('preserves replay focus when older runtime history is prepended', () => {
        const store = useDebateStore.getState();
        store.hydrateRuntimeEvents([
            makeRuntimeEvent({ event_id: 'evt_3', session_id: 'session_1', seq: 3, type: 'status', payload: { content: 'C' } }),
            makeRuntimeEvent({ event_id: 'evt_4', session_id: 'session_1', seq: 4, type: 'status', payload: { content: 'D' } }),
        ]);

        store.setReplayCursor(1);
        store.prependRuntimeEvents(
            [
                makeRuntimeEvent({ event_id: 'evt_1', session_id: 'session_1', seq: 1, type: 'status', payload: { content: 'A' } }),
                makeRuntimeEvent({ event_id: 'evt_2', session_id: 'session_1', seq: 2, type: 'status', payload: { content: 'B' } }),
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
                makeRuntimeEvent({
                    event_id: `evt_${index + 1}`,
                    session_id: 'session_1',
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

    it('ignores websocket pong events in runtime history', () => {
        const store = useDebateStore.getState();

        store.applyRuntimeEvent(
            makeRuntimeEvent({
                event_id: 'evt_pong',
                session_id: 'session_1',
                seq: 1,
                type: 'pong',
                payload: {},
            }),
        );

        const state = useDebateStore.getState();
        expect(state.runtimeEvents).toHaveLength(0);
        expect(state.visibleRuntimeEvents).toHaveLength(0);
        expect(state.lastEventSeq).toBe(-1);
    });

    it('clears transient speech status without appending visible dialogue when speech is cancelled', () => {
        const store = useDebateStore.getState();

        store.applyRuntimeEvent(
            makeRuntimeEvent({
                event_id: 'evt_stream_start',
                session_id: 'session_1',
                seq: 1,
                type: 'speech_start',
                payload: { role: 'proposer' },
            }),
        );
        store.applyRuntimeEvent(
            makeRuntimeEvent({
                event_id: 'evt_stream_token',
                session_id: 'session_1',
                seq: 2,
                type: 'speech_token',
                payload: { token: '半句' },
            }),
        );
        store.applyRuntimeEvent(
            makeRuntimeEvent({
                event_id: 'evt_stream_cancel',
                session_id: 'session_1',
                seq: 3,
                type: 'speech_cancel',
                payload: { role: 'proposer' },
            }),
        );

        const state = useDebateStore.getState();
        expect(state.streamingRole).toBe('');
        expect(state.streamingContent).toBe('');
        expect(state.currentSession?.dialogue_history).toEqual([]);
        expect(state.runtimeEvents.map((event) => event.type)).toEqual(['speech_start', 'speech_cancel']);
        expect(state.visibleRuntimeEvents.map((event) => event.type)).toEqual(['speech_start', 'speech_cancel']);
    });

    it('keeps speech tokens out of runtime history while preserving live streaming content', () => {
        const store = useDebateStore.getState();

        store.applyRuntimeEvent(
            makeRuntimeEvent({
                event_id: 'evt_stream_start',
                session_id: 'session_1',
                seq: 1,
                type: 'speech_start',
                payload: { role: 'proposer' },
            }),
        );
        store.applyRuntimeEvent(
            makeRuntimeEvent({
                event_id: 'evt_stream_token',
                session_id: 'session_1',
                seq: 2,
                type: 'speech_token',
                payload: { token: 'partial' },
            }),
        );

        const state = useDebateStore.getState();
        expect(state.streamingRole).toBe('proposer');
        expect(state.streamingContent).toBe('partial');
        expect(state.currentSession?.dialogue_history).toEqual([]);
        expect(state.runtimeEvents.map((event) => event.type)).toEqual(['speech_start']);
        expect(state.visibleRuntimeEvents.map((event) => event.type)).toEqual(['speech_start']);
        expect(state.lastEventSeq).toBe(2);
    });

    it('streams team discussion content before finalizing it into team history', () => {
        const store = useDebateStore.getState();

        store.applyRuntimeEvent(
            makeRuntimeEvent({
                event_id: 'evt_team_stream_start',
                session_id: 'session_1',
                seq: 1,
                type: 'discussion_stream_start',
                payload: {
                    role: 'team_member',
                    agent_name: '正方组员1',
                    discussion_kind: 'team',
                    team_side: 'proposer',
                    team_round: 0,
                    team_member_index: 0,
                    team_specialty: '证据审查',
                    source_role: 'proposer',
                    turn: 0,
                },
            }),
        );
        store.applyRuntimeEvent(
            makeRuntimeEvent({
                event_id: 'evt_team_stream_token',
                session_id: 'session_1',
                seq: 2,
                type: 'discussion_stream_token',
                payload: { token: '先补证据' },
            }),
        );

        let state = useDebateStore.getState();
        expect(state.streamingRole).toBe('team_member');
        expect(state.streamingEntry).toMatchObject({
            agent_name: '正方组员1',
            discussion_kind: 'team',
            team_specialty: '证据审查',
        });
        expect(state.streamingContent).toBe('先补证据');
        expect(state.currentSession?.team_dialogue_history).toEqual([]);
        expect(state.runtimeEvents.map((event) => event.type)).toEqual(['discussion_stream_start']);

        store.applyRuntimeEvent(
            makeRuntimeEvent({
                event_id: 'evt_team_final',
                session_id: 'session_1',
                seq: 3,
                type: 'team_discussion',
                payload: {
                    role: 'team_member',
                    agent_name: '正方组员1',
                    content: '先补证据',
                    discussion_kind: 'team',
                    team_side: 'proposer',
                    team_round: 0,
                    team_member_index: 0,
                    team_specialty: '证据审查',
                    source_role: 'proposer',
                    turn: 0,
                },
            }),
        );

        state = useDebateStore.getState();
        expect(state.streamingRole).toBe('');
        expect(state.streamingContent).toBe('');
        expect(state.streamingEntry).toBeNull();
        expect(state.currentSession?.team_dialogue_history).toHaveLength(1);
        expect(state.currentSession?.team_dialogue_history[0]).toMatchObject({
            role: 'team_member',
            content: '先补证据',
            team_specialty: '证据审查',
        });
    });

    it('streams jury discussion content before finalizing it into jury history', () => {
        const store = useDebateStore.getState();

        store.applyRuntimeEvent(
            makeRuntimeEvent({
                event_id: 'evt_jury_stream_start',
                session_id: 'session_1',
                seq: 1,
                type: 'discussion_stream_start',
                payload: {
                    role: 'jury_member',
                    agent_name: '陪审员1',
                    discussion_kind: 'jury',
                    jury_round: 0,
                    jury_member_index: 0,
                    jury_perspective: '逻辑审查',
                    turn: 0,
                },
            }),
        );
        store.applyRuntimeEvent(
            makeRuntimeEvent({
                event_id: 'evt_jury_stream_token',
                session_id: 'session_1',
                seq: 2,
                type: 'discussion_stream_token',
                payload: { token: '双方争点仍在因果链' },
            }),
        );

        let state = useDebateStore.getState();
        expect(state.streamingRole).toBe('jury_member');
        expect(state.streamingEntry).toMatchObject({
            agent_name: '陪审员1',
            discussion_kind: 'jury',
            jury_perspective: '逻辑审查',
        });
        expect(state.streamingContent).toBe('双方争点仍在因果链');
        expect(state.currentSession?.jury_dialogue_history).toEqual([]);

        store.applyRuntimeEvent(
            makeRuntimeEvent({
                event_id: 'evt_jury_final',
                session_id: 'session_1',
                seq: 3,
                type: 'jury_discussion',
                payload: {
                    role: 'jury_member',
                    agent_name: '陪审员1',
                    content: '双方争点仍在因果链',
                    discussion_kind: 'jury',
                    jury_round: 0,
                    jury_member_index: 0,
                    jury_perspective: '逻辑审查',
                    turn: 0,
                },
            }),
        );

        state = useDebateStore.getState();
        expect(state.streamingEntry).toBeNull();
        expect(state.currentSession?.jury_dialogue_history).toHaveLength(1);
        expect(state.currentSession?.jury_dialogue_history[0]).toMatchObject({
            role: 'jury_member',
            content: '双方争点仍在因果链',
            jury_perspective: '逻辑审查',
        });
    });

    it('appends the final speech on speech_end after ignoring token updates', () => {
        const store = useDebateStore.getState();

        store.applyRuntimeEvent(
            makeRuntimeEvent({
                event_id: 'evt_stream_start',
                session_id: 'session_1',
                seq: 1,
                type: 'speech_start',
                payload: { role: 'proposer' },
            }),
        );
        store.applyRuntimeEvent(
            makeRuntimeEvent({
                event_id: 'evt_stream_token',
                session_id: 'session_1',
                seq: 2,
                type: 'speech_token',
                payload: { token: 'partial' },
            }),
        );
        const beforeEnd = useDebateStore.getState();
        store.applyRuntimeEvent(
            makeRuntimeEvent({
                event_id: 'evt_stream_end',
                session_id: 'session_1',
                seq: 3,
                type: 'speech_end',
                payload: {
                    role: 'proposer',
                    agent_name: '正方',
                    content: 'complete speech',
                    citations: ['source-1'],
                    turn: 0,
                },
            }),
        );

        const state = useDebateStore.getState();
        expect(state.runtimeEvents).not.toBe(beforeEnd.runtimeEvents);
        expect(state.visibleRuntimeEvents).not.toBe(beforeEnd.visibleRuntimeEvents);
        expect(state.streamingRole).toBe('');
        expect(state.streamingContent).toBe('');
        expect(state.currentSession?.dialogue_history).toHaveLength(1);
        expect(state.currentSession?.dialogue_history[0]).toMatchObject({
            role: 'proposer',
            agent_name: '正方',
            content: 'complete speech',
            citations: ['source-1'],
            turn: 0,
            event_id: 'evt_stream_end',
        });
        expect(state.runtimeEvents.map((event) => event.type)).toEqual(['speech_start', 'speech_end']);
        expect(state.visibleRuntimeEvents.map((event) => event.type)).toEqual(['speech_start', 'speech_end']);
        expect(state.lastEventSeq).toBe(3);
    });

    it('does not duplicate a restored speech entry when a replayed speech_end carries empty metadata', () => {
        const store = useDebateStore.getState();
        store.setCurrentSession({
            ...makeSession(),
            dialogue_history: [
                {
                    role: 'proposer',
                    agent_name: '正方',
                    content: 'complete speech',
                    citations: ['source-1'],
                    timestamp: '2026-03-17T00:00:01+00:00',
                    turn: 0,
                },
            ],
        });

        store.applyRuntimeEvent(
            makeRuntimeEvent({
                event_id: 'evt_stream_end_dedupe',
                session_id: 'session_1',
                seq: 3,
                type: 'speech_end',
                payload: {
                    role: 'proposer',
                    agent_name: '正方',
                    content: 'complete speech',
                    citations: ['source-1'],
                    metadata: {},
                    turn: 0,
                },
            }),
        );

        const state = useDebateStore.getState();
        expect(state.currentSession?.dialogue_history).toHaveLength(1);
        expect(state.currentSession?.dialogue_history[0]?.metadata).toBeUndefined();
    });

    it('keeps speech_start visible while token updates stay invisible until speech_end finalizes the turn', () => {
        const store = useDebateStore.getState();

        store.applyRuntimeEvent(
            makeRuntimeEvent({
                event_id: 'evt_stream_start_visible',
                session_id: 'session_1',
                seq: 1,
                type: 'speech_start',
                payload: { role: 'opposer' },
            }),
        );
        store.applyRuntimeEvent(
            makeRuntimeEvent({
                event_id: 'evt_stream_token_hidden',
                session_id: 'session_1',
                seq: 2,
                type: 'speech_token',
                payload: { token: 'still hidden' },
            }),
        );

        let state = useDebateStore.getState();
        expect(state.streamingRole).toBe('opposer');
        expect(state.streamingContent).toBe('still hidden');
        expect(state.runtimeEvents.map((event) => event.event_id)).toEqual(['evt_stream_start_visible']);
        expect(state.visibleRuntimeEvents.map((event) => event.event_id)).toEqual(['evt_stream_start_visible']);
        expect(state.currentSession?.dialogue_history).toEqual([]);

        store.applyRuntimeEvent(
            makeRuntimeEvent({
                event_id: 'evt_stream_end_visible',
                session_id: 'session_1',
                seq: 3,
                type: 'speech_end',
                payload: {
                    role: 'opposer',
                    content: 'final visible speech',
                },
            }),
        );

        state = useDebateStore.getState();
        expect(state.streamingRole).toBe('');
        expect(state.streamingContent).toBe('');
        expect(state.runtimeEvents.map((event) => event.event_id)).toEqual([
            'evt_stream_start_visible',
            'evt_stream_end_visible',
        ]);
        expect(state.visibleRuntimeEvents.map((event) => event.event_id)).toEqual([
            'evt_stream_start_visible',
            'evt_stream_end_visible',
        ]);
        expect(state.currentSession?.dialogue_history.at(-1)).toMatchObject({
            role: 'opposer',
            content: 'final visible speech',
            event_id: 'evt_stream_end_visible',
        });
    });

    it('does not mutate previously captured runtime event arrays when appending a new event', () => {
        const store = useDebateStore.getState();

        store.applyRuntimeEvent(
            makeRuntimeEvent({
                event_id: 'evt_before_1',
                session_id: 'session_1',
                seq: 1,
                type: 'status',
                payload: { content: 'first' },
            }),
        );

        const beforeAppend = useDebateStore.getState();
        const previousRuntimeEvents = beforeAppend.runtimeEvents;
        const previousVisibleRuntimeEvents = beforeAppend.visibleRuntimeEvents;

        store.applyRuntimeEvent(
            makeRuntimeEvent({
                event_id: 'evt_before_2',
                session_id: 'session_1',
                seq: 2,
                type: 'status',
                payload: { content: 'second' },
            }),
        );

        const state = useDebateStore.getState();
        expect(previousRuntimeEvents).toHaveLength(1);
        expect(previousRuntimeEvents.map((event) => event.event_id)).toEqual(['evt_before_1']);
        expect(previousVisibleRuntimeEvents).toHaveLength(1);
        expect(previousVisibleRuntimeEvents.map((event) => event.event_id)).toEqual(['evt_before_1']);
        expect(state.runtimeEvents).not.toBe(previousRuntimeEvents);
        expect(state.visibleRuntimeEvents).not.toBe(previousVisibleRuntimeEvents);
        expect(state.runtimeEvents.map((event) => event.event_id)).toEqual(['evt_before_1', 'evt_before_2']);
        expect(state.visibleRuntimeEvents.map((event) => event.event_id)).toEqual(['evt_before_1', 'evt_before_2']);
    });

    it('copies nested runtime payload objects so later state changes do not alias older snapshots', () => {
        const store = useDebateStore.getState();
        const finalScores = {
            proposer: {
                logical_rigor: [8],
            },
        };

        store.applyRuntimeEvent(
            makeRuntimeEvent({
                event_id: 'evt_nested_1',
                session_id: 'session_1',
                seq: 1,
                type: 'turn_complete',
                payload: {
                    turn: 1,
                    cumulative_scores: finalScores,
                },
            }),
        );

        const beforeMutation = useDebateStore.getState();
        const previousScores = beforeMutation.currentSession?.cumulative_scores;
        expect(previousScores).toEqual(finalScores);

        finalScores.proposer.logical_rigor.push(9);

        const afterMutation = useDebateStore.getState();
        expect(previousScores).toEqual({
            proposer: {
                logical_rigor: [8],
            },
        });
        expect(afterMutation.currentSession?.cumulative_scores).toEqual({
            proposer: {
                logical_rigor: [8],
            },
        });
    });

    it('filters speech tokens out when hydrating runtime history', () => {
        useDebateStore.getState().hydrateRuntimeEvents([
            makeRuntimeEvent({ event_id: 'evt_1', session_id: 'session_1', seq: 1, type: 'speech_start', payload: { role: 'proposer' } }),
            makeRuntimeEvent({ event_id: 'evt_2', session_id: 'session_1', seq: 2, type: 'speech_token', payload: { token: 'partial' } }),
            makeRuntimeEvent({
                event_id: 'evt_3',
                session_id: 'session_1',
                seq: 3,
                type: 'speech_end',
                payload: { role: 'proposer', content: 'complete speech' },
            }),
        ]);

        const state = useDebateStore.getState();
        expect(state.runtimeEvents.map((event) => event.event_id)).toEqual(['evt_1', 'evt_3']);
        expect(state.visibleRuntimeEvents.map((event) => event.event_id)).toEqual(['evt_1', 'evt_3']);
        expect(state.lastEventSeq).toBe(3);
    });

    it('repairs known mojibake runtime status content on ingest', () => {
        const store = useDebateStore.getState();
        const raw = '濮濓絽婀弫瀵告倞娑撳﹣绗呴弬?.';
        store.applyRuntimeEvent(
            makeRuntimeEvent({
                event_id: 'evt_garbled',
                session_id: 'session_1',
                seq: 1,
                type: 'status',
                payload: { content: raw },
            }),
        );

        const state = useDebateStore.getState();
        const repaired = repairKnownMojibakeText(raw);
        expect(state.currentStatus).toBe(repaired);
        expect(state.runtimeEvents[0]?.payload.content).toBe(repaired);
    });

    it('stores sophistry reports as dialogue entries and mode artifacts', () => {
        const store = useDebateStore.getState();
        store.setCurrentSession({
            ...makeSession(),
            debate_mode: 'sophistry_experiment',
        });

        store.applyRuntimeEvent(
            makeRuntimeEvent({
                event_id: 'evt_report',
                session_id: 'session_1',
                seq: 1,
                type: 'sophistry_round_report',
                payload: {
                    role: 'sophistry_round_report',
                    turn: 0,
                    content: 'Detected a false dichotomy.',
                    report: {
                        type: 'sophistry_round_report',
                        title: '本轮观察',
                        turn: 0,
                        content: 'Detected a false dichotomy.',
                        created_at: '2026-03-17T00:00:01+00:00',
                    },
                },
            }),
        );

        const state = useDebateStore.getState();
        expect(state.currentSession?.dialogue_history.at(-1)?.role).toBe('sophistry_round_report');
        expect(state.currentSession?.mode_artifacts).toHaveLength(1);
        expect(state.currentSession?.current_mode_report).toMatchObject({
            type: 'sophistry_round_report',
            title: '本轮观察',
        });
    });
});
