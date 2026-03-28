import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useDebateStore } from '../stores/debateStore';
import type { RuntimeEvent, Session } from '../types';
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
        team_dialogue_history: [],
        jury_dialogue_history: [],
        current_scores: {},
        cumulative_scores: {},
        team_config: { agents_per_team: 0, discussion_rounds: 0 },
        jury_config: { agents_per_jury: 0, discussion_rounds: 0 },
        reasoning_config: {
            steelman_enabled: false,
            counterfactual_enabled: false,
            consensus_enabled: false,
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
        expect(result.current.modeArtifactsLength).toBe(1);
        expect(result.current.hasCurrentSession).toBe(true);
    });

    it('returns grouped runtime and transcript state for the active session', () => {
        useDebateStore.getState().setCurrentSession(makeSession({ status: 'completed' }));
        useDebateStore.getState().hydrateRuntimeEvents([makeRuntimeEvent()]);
        useDebateStore.getState().setAllAgentMessagesCollapsed('session_view', ['event:evt_selector'], true);

        const runtime = renderHook(() => useRuntimeViewState());
        const transcript = renderHook(() => useTranscriptViewState());

        expect(runtime.result.current.runtimeEventCount).toBe(1);
        expect(runtime.result.current.currentStatus).toBe('准备中');
        expect(runtime.result.current.currentNode).toBe('speaker');
        expect(transcript.result.current.currentSessionId).toBe('session_view');
        expect(transcript.result.current.replayEnabled).toBe(false);
        expect(transcript.result.current.collapsedAgentMessages['event:evt_selector']).toBe(true);
    });
});
