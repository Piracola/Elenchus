import { describe, expect, it } from 'vitest';

import type { DialogueEntry } from '../../types';
import { buildTranscriptViewModel } from './transcriptViewModel';

function entry(overrides: Partial<DialogueEntry>): DialogueEntry {
    return {
        role: 'proposer',
        agent_name: '正方',
        content: '发言内容',
        citations: [],
        timestamp: '2026-03-17T00:00:00Z',
        ...overrides,
    };
}

describe('buildTranscriptViewModel', () => {
    it('extracts consensus summaries from the main dialogue timeline', () => {
        const speaker = entry({
            role: 'proposer',
            agent_name: '正方',
            content: '正式发言',
            turn: 0,
            event_id: 'evt_speech',
        });
        const consensus = entry({
            role: 'consensus_summary',
            agent_name: '共识收敛员',
            content: '共同点与分歧',
            turn: 1,
            event_id: 'evt_consensus',
            discussion_kind: 'consensus',
        });

        const viewModel = buildTranscriptViewModel({
            dialogueHistory: [speaker, consensus],
            participants: ['proposer', 'opposer'],
        });

        expect(viewModel.consensusEntries).toEqual([consensus]);
        expect(viewModel.rowViewModels[0].insightSections).toEqual([]);
    });
});
