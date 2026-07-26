import { beforeEach, describe, expect, it } from 'vitest';
import { useDebateStore } from './debateStore';
import { makeRuntimeEvent } from '../test/runtimeEventFactory';
import type { RunSummary, Session } from '../types';

function makeSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        topic: '测试辩题',
        debate_mode: 'standard',
        mode_config: {},
        participants: ['proposer', 'opposer'],
        max_turns: 3,
        current_turn: 0,
        status: 'in_progress',
        created_at: '2026-03-17T00:00:00Z',
        updated_at: '2026-03-17T00:00:00Z',
        dialogue_history: [],
        current_scores: {},
        cumulative_scores: {},
        reasoning_config: { consensus_enabled: true, group_discussion_rounds: 1 },
        mode_artifacts: [],
        ...overrides,
    };
}

function makeRun(overrides: Partial<RunSummary> = {}): RunSummary {
    return {
        id: 'run-1',
        session_id: 'session-1',
        status: 'running',
        current_turn: 0,
        latest_seq: 0,
        last_status_message: null,
        last_error_message: null,
        created_at: '2026-03-17T00:00:00Z',
        updated_at: '2026-03-17T00:00:00Z',
        ...overrides,
    } as RunSummary;
}

function apply(event: Parameters<ReturnType<typeof useDebateStore.getState>['applyRuntimeEvent']>[0]) {
    useDebateStore.getState().applyRuntimeEvent(event);
}

describe('applyRuntimeEventPatch', () => {
    beforeEach(() => {
        useDebateStore.getState().reset();
        useDebateStore.getState().setCurrentSession(makeSession());
        useDebateStore.getState().setActiveRun(makeRun());
    });

    it('drops events from another run', () => {
        apply(makeRuntimeEvent({ run_id: 'other-run', seq: 5, type: 'status', payload: { content: '不该出现' } }));
        expect(useDebateStore.getState().currentStatus).not.toBe('不该出现');
    });

    it('drops events from another session', () => {
        apply(makeRuntimeEvent({ session_id: 'session-2', seq: 5, payload: { content: '不该出现' } }));
        expect(useDebateStore.getState().currentStatus).not.toBe('不该出现');
    });

    it('ignores replayed sequence numbers', () => {
        apply(makeRuntimeEvent({ event_id: 'e1', seq: 3, payload: { content: '第一次' } }));
        apply(makeRuntimeEvent({ event_id: 'e2', seq: 2, payload: { content: '旧事件' } }));
        expect(useDebateStore.getState().currentStatus).toBe('第一次');
    });

    it('ignores duplicate event ids', () => {
        apply(makeRuntimeEvent({ event_id: 'dup', seq: 3, type: 'status', payload: { content: 'A' } }));
        const countAfterFirst = useDebateStore.getState().runtimeEvents.length;
        apply(makeRuntimeEvent({ event_id: 'dup', seq: 4, type: 'status', payload: { content: 'B' } }));
        expect(useDebateStore.getState().runtimeEvents.length).toBe(countAfterFirst);
    });

    it('appends the finished speech and clears streaming state', () => {
        apply(makeRuntimeEvent({
            event_id: 'start',
            seq: 1,
            type: 'speech_start',
            payload: { role: 'proposer', agent_name: '正方', turn: 0 },
        }));
        apply(makeRuntimeEvent({
            event_id: 'token',
            seq: 2,
            type: 'speech_token',
            payload: { role: 'proposer', token: '你好' },
        }));
        expect(useDebateStore.getState().streamingContent).toBe('你好');

        apply(makeRuntimeEvent({
            event_id: 'end',
            seq: 3,
            type: 'speech_end',
            payload: { role: 'proposer', agent_name: '正方', content: '你好世界', turn: 0 },
        }));

        const state = useDebateStore.getState();
        expect(state.streamingContent).toBe('');
        expect(state.streamingEntry).toBeNull();
        expect(state.currentSession?.dialogue_history.at(-1)).toMatchObject({
            role: 'proposer',
            content: '你好世界',
        });
    });

    it('rolls back streaming text on speech_cancel', () => {
        apply(makeRuntimeEvent({
            event_id: 'start',
            seq: 1,
            type: 'speech_start',
            payload: { role: 'proposer', turn: 0 },
        }));
        apply(makeRuntimeEvent({
            event_id: 'token',
            seq: 2,
            type: 'speech_token',
            payload: { role: 'proposer', token: '半截' },
        }));
        apply(makeRuntimeEvent({
            event_id: 'cancel',
            seq: 3,
            type: 'speech_cancel',
            payload: { role: 'proposer', turn: 0 },
        }));

        const state = useDebateStore.getState();
        expect(state.streamingContent).toBe('');
        expect(state.currentSession?.dialogue_history).toHaveLength(0);
    });

    it('stores judge scores and appends the judge entry', () => {
        const scores = {
            logical_rigor: { score: 8, rationale: 'r' },
            evidence_quality: { score: 7, rationale: 'r' },
            topic_focus: { score: 8, rationale: 'r' },
            rebuttal_strength: { score: 9, rationale: 'r' },
            consistency: { score: 8, rationale: 'r' },
            boundary_contribution: { score: 8, rationale: 'r' },
            overall_comment: '不错',
        };
        apply(makeRuntimeEvent({
            event_id: 'judge',
            seq: 4,
            type: 'judge_score',
            payload: { role: 'proposer', scores, turn: 0 },
        }));

        const state = useDebateStore.getState();
        expect(state.currentSession?.current_scores.proposer?.overall_comment).toBe('不错');
        expect(state.currentSession?.dialogue_history.at(-1)).toMatchObject({ role: 'judge', target_role: 'proposer' });
    });

    it('marks the run complete on debate_complete', () => {
        apply(makeRuntimeEvent({
            event_id: 'done',
            seq: 9,
            type: 'debate_complete',
            payload: { total_turns: 3, final_scores: { proposer: { logical_rigor: [8, 9] } } },
        }));

        const state = useDebateStore.getState();
        expect(state.isDebating).toBe(false);
        expect(state.phase).toBe('complete');
        expect(state.currentSession?.status).toBe('completed');
        expect(state.currentSession?.cumulative_scores.proposer.logical_rigor).toEqual([8, 9]);
    });

    it('records the error entry and failed run state', () => {
        apply(makeRuntimeEvent({
            event_id: 'err',
            seq: 6,
            type: 'error',
            payload: { content: '辩论出错：模型不可用' },
        }));

        const state = useDebateStore.getState();
        expect(state.phase).toBe('error');
        expect(state.activeRun?.status).toBe('failed');
        expect(state.currentSession?.dialogue_history.at(-1)?.role).toBe('error');
    });

    it('appends moderator directives as audience entries', () => {
        apply(makeRuntimeEvent({
            event_id: 'cmd_1',
            seq: 7,
            type: 'audience_message',
            payload: { content: '请回应经济学证据', agent_name: '主持人', turn: 0 },
        }));

        expect(useDebateStore.getState().currentSession?.dialogue_history.at(-1)).toMatchObject({
            role: 'audience',
            content: '请回应经济学证据',
        });
    });

    it('accumulates token usage per role and in total', () => {
        apply(makeRuntimeEvent({
            event_id: 'tu1',
            seq: 10,
            type: 'token_usage',
            payload: { role: 'proposer', input_tokens: 100, output_tokens: 50, total_tokens: 150 },
        }));
        apply(makeRuntimeEvent({
            event_id: 'tu2',
            seq: 11,
            type: 'token_usage',
            payload: { role: 'judge', input_tokens: 20, output_tokens: 10, total_tokens: 30 },
        }));

        const usage = useDebateStore.getState().tokenUsage;
        expect(usage?.total).toEqual({ input_tokens: 120, output_tokens: 60, total_tokens: 180, calls: 2 });
        expect(usage?.by_role.proposer.calls).toBe(1);
        expect(usage?.by_role.judge.total_tokens).toBe(30);
    });

    it('applies terminal run statuses consistently', () => {
        apply(makeRuntimeEvent({
            event_id: 'stalled',
            seq: 12,
            type: 'run_status_changed',
            payload: { status: 'stalled', content: '模型连续失败，已暂停' },
        }));

        const state = useDebateStore.getState();
        expect(state.isDebating).toBe(false);
        expect(state.phase).toBe('idle');
        expect(state.activeRun?.status).toBe('stalled');
        expect(state.currentStatus).toBe('模型连续失败，已暂停');
    });

    it('treats stopping as no longer debating', () => {
        apply(makeRuntimeEvent({
            event_id: 'stopping',
            seq: 13,
            type: 'run_status_changed',
            payload: { status: 'stopping' },
        }));

        const state = useDebateStore.getState();
        expect(state.isDebating).toBe(false);
        expect(state.phase).toBe('processing');
        expect(state.currentStatus).toBe('正在停止辩论...');
    });

    it('keeps speech tokens out of the runtime event log', () => {
        const before = useDebateStore.getState().runtimeEvents.length;
        apply(makeRuntimeEvent({
            event_id: 'tok',
            seq: 14,
            type: 'speech_token',
            payload: { role: 'proposer', token: 'x' },
        }));
        expect(useDebateStore.getState().runtimeEvents.length).toBe(before);
        // The sequence watermark still advances so catch-up stays correct.
        expect(useDebateStore.getState().lastEventSeqByRun['run-1']).toBe(14);
    });
});
