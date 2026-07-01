import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DialogueEntry, Session } from '../types';
import { useDebateStore } from '../stores/debateStore';
import { buildTranscriptViewModel } from '../utils/chat/transcriptViewModel';
import type { DialogueGroupingState } from '../utils/chat/groupDialogue';

function makeDialogueEntry(index: number): DialogueEntry {
    const role = index % 2 === 0 ? 'proposer' : 'opposer';
    return {
        role,
        agent_name: role === 'proposer' ? 'Proposer' : 'Opposer',
        content: `Render performance message ${index + 1}`.repeat(2),
        citations: [],
        timestamp: `2026-03-17T00:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}Z`,
        event_id: `evt_render_${index + 1}`,
        turn: Math.floor(index / 2),
    };
}

function makeSessionWithHistory(historyCount: number): Session {
    return {
        id: 'session_render',
        topic: `Render performance - ${historyCount}`,
        debate_mode: 'standard',
        mode_config: {},
        participants: ['proposer', 'opposer'],
        max_turns: Math.ceil(historyCount / 2),
        current_turn: Math.ceil(historyCount / 2),
        status: 'completed',
        created_at: '2026-03-17T00:00:00+00:00',
        updated_at: '2026-03-17T01:00:00+00:00',
        dialogue_history: Array.from({ length: historyCount }, (_, index) => makeDialogueEntry(index)),
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

function buildViewModel(session: Session, previousGroupingState: DialogueGroupingState | null = null) {
    return buildTranscriptViewModel({
        dialogueHistory: session.dialogue_history,
        participants: session.participants,
        previousGroupingState,
    });
}

describe('large transcript rendering performance', () => {
    beforeEach(() => {
        useDebateStore.getState().reset();
    });

    afterEach(() => {
        useDebateStore.getState().reset();
    });

    it('builds a 100-row transcript view model within budget', () => {
        const session = makeSessionWithHistory(100);
        useDebateStore.getState().setCurrentSession(session);

        const startTime = performance.now();
        const viewModel = buildViewModel(session);
        const buildTime = performance.now() - startTime;

        expect(buildTime).toBeLessThan(50);
        expect(viewModel.rows.length).toBeGreaterThan(0);
    });

    it('builds a 1000-row transcript view model within budget', () => {
        const session = makeSessionWithHistory(1000);
        useDebateStore.getState().setCurrentSession(session);

        const startTime = performance.now();
        const viewModel = buildViewModel(session);
        const buildTime = performance.now() - startTime;

        expect(buildTime).toBeLessThan(500);
        expect(viewModel.rows.length).toBeGreaterThan(0);
    });

    it('keeps repeated transcript rebuilds stable', () => {
        const session = makeSessionWithHistory(300);
        useDebateStore.getState().setCurrentSession(session);
        const viewModel1 = buildViewModel(session);

        const startTime = performance.now();
        const viewModel2 = buildViewModel(session, viewModel1.groupingState);
        const rebuildTime = performance.now() - startTime;

        expect(rebuildTime).toBeLessThan(30);
        expect(viewModel2.rows.length).toBe(viewModel1.rows.length);
    });
});
