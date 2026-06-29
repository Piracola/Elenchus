import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useDebateStore } from '../../stores/debateStore';
import type { DialogueEntry, Session } from '../../types';
import { useTranscriptPanelState } from './useTranscriptPanelState';

function makeSession(dialogueHistory: DialogueEntry[] = []): Session {
    return {
        id: 'session_group_discussion',
        topic: '组内讨论自动收起',
        debate_mode: 'standard',
        mode_config: {},
        participants: ['proposer', 'opposer'],
        max_turns: 5,
        current_turn: 0,
        status: 'in_progress',
        created_at: '2026-03-24T00:00:00Z',
        updated_at: '2026-03-24T00:00:00Z',
        dialogue_history: dialogueHistory,
        current_scores: {},
        cumulative_scores: {},
        reasoning_config: {
            consensus_enabled: true,
            group_discussion_rounds: 1,
        },
        mode_artifacts: [],
        current_mode_report: null,
        final_mode_report: null,
    };
}

describe('useTranscriptPanelState', () => {
    beforeEach(() => {
        useDebateStore.getState().reset();
    });

    afterEach(() => {
        cleanup();
        useDebateStore.getState().reset();
    });

    it('auto-collapses newly completed group discussion entries', () => {
        useDebateStore.getState().setCurrentSession(makeSession());

        const { result, rerender } = renderHook(() => useTranscriptPanelState());

        expect(result.current.collapsedAgentMessages).toEqual({});
        expect(result.current.currentTurn).toBe(0);
        expect(result.current.displayTurn).toBe(1);

        act(() => {
            useDebateStore.getState().setCurrentSession(makeSession([
                {
                    role: 'group_discussion',
                    agent_name: '组内讨论',
                    content: '本轮赛前简报',
                    citations: [],
                    timestamp: '2026-03-24T00:01:00Z',
                    event_id: 'evt_group_discussion_1',
                    turn: 0,
                    discussion_kind: 'group_discussion',
                    discussion_round: 1,
                },
            ]));
        });

        rerender();

        expect(
            useDebateStore.getState().collapsedAgentMessagesBySession.session_group_discussion?.[
                'event:evt_group_discussion_1'
            ],
        ).toBe(true);
    });
});
