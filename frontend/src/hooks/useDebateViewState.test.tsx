import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useDebateStore } from '../stores/debateStore';
import type { RuntimeEvent, RunSummary, Session } from '../types';
import {
    useRuntimeViewState,
    useSessionViewState,
    useTranscriptViewState,
} from './useDebateViewState';

function makeSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session_view',
        topic: 'Selector coverage',
        debate_mode: 'sophistry_experiment',
        mode_config: {},
        participants: ['proposer', 'opposer'],
        max_turns: 8,
        current_turn: 3,
        status: 'in_progress',
        created_at: '2026-03-24T00:00:00Z',
        updated_at: '2026-03-24T00:00:00Z',
        dialogue_history: [],
        current_scores: {},
        cumulative_scores: {},
        reasoning_config: {
            consensus_enabled: false,
            group_discussion_rounds: 0,
        },
        mode_artifacts: [{ type: 'report', content: 'artifact' }],
        current_mode_report: null,
        final_mode_report: null,
        ...overrides,
    };
}

function makeRuntimeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
    return {
        schema_version: '1.0',
        event_id: 'evt_selector',
        run_id: 'run_view',
        session_id: 'session_view',
        seq: 1,
        timestamp: '2026-03-24T00:01:00Z',
        source: 'runtime',
        type: 'status',
        phase: 'preparing',
        payload: { content: '准备中', node: 'speaker' },
        ...overrides,
    };
}

function makeRun(overrides: Partial<RunSummary> = {}): RunSummary {
    return {
        id: 'run_view',
        session_id: 'session_view',
        status: 'stalled',
        current_turn: 5,
        latest_seq: 8,
        last_status_message: '等待恢复',
        last_error_message: null,
        started_at: null,
        completed_at: null,
        interrupted_at: null,
        last_progress_at: null,
        created_at: '2026-03-24T00:00:00Z',
        updated_at: '2026-03-24T00:00:00Z',
        ...overrides,
    };
}

describe('useDebateViewState', () => {
    beforeEach(() => {
        useDebateStore.getState().reset();
    });

    afterEach(() => {
        cleanup();
        useDebateStore.getState().reset();
    });

    it('derives grouped session fields from the current session', () => {
        useDebateStore.getState().setCurrentSession(makeSession());

        const { result } = renderHook(() => useSessionViewState());

        expect(result.current.currentSessionId).toBe('session_view');
        expect(result.current.currentTopic).toBe('Selector coverage');
        expect(result.current.debateMode).toBe('sophistry_experiment');
        expect(result.current.currentTurn).toBe(3);
        expect(result.current.displayTurn).toBe(4);
        expect(result.current.modeArtifactsLength).toBe(1);
        expect(result.current.hasCurrentSession).toBe(true);
    });

    it('keeps completed sessions on their final finished turn for display', () => {
        useDebateStore.getState().setCurrentSession(makeSession({ status: 'completed' }));

        const { result } = renderHook(() => useSessionViewState());

        expect(result.current.currentTurn).toBe(3);
        expect(result.current.displayTurn).toBe(3);
    });

    it('uses the active run summary before falling back to session runtime summary', () => {
        useDebateStore.getState().setCurrentSession(makeSession({
            current_turn: 1,
            status: 'completed',
        }));
        useDebateStore.getState().setActiveRun(makeRun());

        const { result } = renderHook(() => useSessionViewState());

        expect(result.current.currentTurn).toBe(5);
        expect(result.current.displayTurn).toBe(5);
        expect(result.current.sessionStatus).toBe('error');
        expect(result.current.runStatus).toBe('stalled');
    });

    it('returns grouped runtime and transcript state for the active session', () => {
        useDebateStore.getState().setCurrentSession(makeSession({ status: 'completed' }));
        useDebateStore.getState().applyRuntimeEvent(makeRuntimeEvent());
        useDebateStore.getState().setAllAgentMessagesCollapsed('session_view', ['event:evt_selector'], true);

        const runtime = renderHook(() => useRuntimeViewState());
        const transcript = renderHook(() => useTranscriptViewState());

        expect(runtime.result.current.runtimeEventCount).toBe(1);
        expect(runtime.result.current.currentStatus).toBe('准备中');
        expect(runtime.result.current.currentNode).toBe('speaker');
        expect(transcript.result.current.currentSessionId).toBe('session_view');
        expect(transcript.result.current.collapsedAgentMessages['event:evt_selector']).toBe(true);
    });

    it('ignores runtime events without a run_id even when an active run exists', () => {
        useDebateStore.getState().setCurrentSession(makeSession());
        useDebateStore.getState().setActiveRun(makeRun({
            id: 'run_view',
            status: 'running',
        }));
        useDebateStore.getState().applyRuntimeEvent(makeRuntimeEvent({
            event_id: 'evt_without_run',
            run_id: '',
            payload: { content: 'should be ignored', node: 'speaker' },
        }));

        const runtime = renderHook(() => useRuntimeViewState());

        expect(runtime.result.current.runtimeEventCount).toBe(0);
        expect(runtime.result.current.currentStatus).toBe('');
    });

    it('keeps group discussion entries available in the transcript view', () => {
        useDebateStore.getState().setCurrentSession(makeSession({
            dialogue_history: [
                {
                    role: 'group_discussion',
                    agent_name: '组内讨论',
                    content: '赛前简报',
                    citations: [],
                    timestamp: '2026-03-24T00:00:00Z',
                    event_id: 'evt_group_1',
                    turn: 3,
                    discussion_kind: 'group_discussion',
                    discussion_round: 1,
                },
            ],
        }));

        const transcript = renderHook(() => useTranscriptViewState());

        expect(transcript.result.current.currentSessionId).toBe('session_view');
        expect(transcript.result.current.collapsedAgentMessages).toEqual({});
    });

    it('derives terminal state from run_status_changed events', () => {
        useDebateStore.getState().setCurrentSession(makeSession());
        useDebateStore.getState().setActiveRun(makeRun({
            status: 'running',
        }));
        useDebateStore.getState().applyRuntimeEvent(makeRuntimeEvent({
            event_id: 'evt_run_status',
            type: 'run_status_changed',
            payload: {
                status: 'failed',
                content: '上游模型调用失败',
            },
        }));

        const runtime = renderHook(() => useRuntimeViewState());
        const session = renderHook(() => useSessionViewState());

        expect(runtime.result.current.runStatus).toBe('failed');
        expect(runtime.result.current.phase).toBe('error');
        expect(runtime.result.current.currentStatus).toBe('上游模型调用失败');
        expect(session.result.current.sessionStatus).toBe('error');
    });
});
