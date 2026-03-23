import { describe, expect, it } from 'vitest';

import { groupDialogue } from '../utils/groupDialogue';
import type { DialogueEntry } from '../types';

describe('groupDialogue', () => {
    it('returns empty array for empty input', () => {
        expect(groupDialogue([])).toEqual([]);
    });

    it('groups agent entries with judge evaluations', () => {
        const entries: DialogueEntry[] = [
            { role: 'proposer', agent_name: '正方', content: 'Hello', timestamp: '2024-01-01T00:00:00Z', citations: [] },
            { role: 'judge', agent_name: '裁判', content: 'Good point', timestamp: '2024-01-01T00:01:00Z', citations: [], target_role: 'proposer' },
            { role: 'opposer', agent_name: '反方', content: 'Hi', timestamp: '2024-01-01T00:02:00Z', citations: [] },
        ];

        const result = groupDialogue(entries);

        expect(result).toHaveLength(2);
        expect(result[0].agent?.role).toBe('proposer');
        expect(result[0].judge?.role).toBe('judge');
        expect(result[1].agent?.role).toBe('opposer');
        expect(result[1].judge).toBeNull();
    });

    it('handles a single judge entry', () => {
        const entries: DialogueEntry[] = [
            { role: 'judge', agent_name: '裁判长', content: 'Decision', timestamp: '2024-01-01T00:00:00Z', citations: [] },
        ];

        const result = groupDialogue(entries);

        expect(result).toHaveLength(1);
        expect(result[0].agent).toBeNull();
        expect(result[0].judge?.role).toBe('judge');
    });

    it('treats additional participants as agent rows when provided', () => {
        const entries: DialogueEntry[] = [
            { role: 'proposer', agent_name: 'Proposer', content: 'Opening', timestamp: '2024-01-01T00:00:00Z', citations: [] },
            { role: 'challenger', agent_name: 'Challenger', content: 'Counterpoint', timestamp: '2024-01-01T00:01:00Z', citations: [] },
            { role: 'judge', agent_name: 'Judge', content: 'Noted', timestamp: '2024-01-01T00:02:00Z', citations: [], target_role: 'challenger' },
        ];

        const result = groupDialogue(entries, ['proposer', 'challenger']);

        expect(result).toHaveLength(2);
        expect(result[1].agent?.role).toBe('challenger');
        expect(result[1].judge?.target_role).toBe('challenger');
    });

    it('matches judge rows by turn when available', () => {
        const entries: DialogueEntry[] = [
            { role: 'proposer', agent_name: 'Proposer', content: 'Turn 1', timestamp: '2024-01-01T00:00:00Z', citations: [], turn: 0 },
            { role: 'proposer', agent_name: 'Proposer', content: 'Turn 2', timestamp: '2024-01-01T00:01:00Z', citations: [], turn: 1 },
            { role: 'judge', agent_name: 'Judge', content: 'Scores turn 1', timestamp: '2024-01-01T00:02:00Z', citations: [], target_role: 'proposer', turn: 0 },
        ];

        const result = groupDialogue(entries);

        expect(result[0].judge?.content).toBe('Scores turn 1');
        expect(result[1].judge).toBeNull();
    });

    it('falls back to the latest unmatched no-turn speaker row for judge entries', () => {
        const entries: DialogueEntry[] = [
            { role: 'proposer', agent_name: 'Proposer', content: 'Opening', timestamp: '2024-01-01T00:00:00Z', citations: [] },
            { role: 'proposer', agent_name: 'Proposer', content: 'Turn 2', timestamp: '2024-01-01T00:01:00Z', citations: [], turn: 1 },
            { role: 'judge', agent_name: 'Judge', content: 'Scores unknown turn', timestamp: '2024-01-01T00:02:00Z', citations: [], target_role: 'proposer', turn: 9 },
        ];

        const result = groupDialogue(entries);

        expect(result[0].judge?.content).toBe('Scores unknown turn');
        expect(result[1].judge).toBeNull();
    });

    it('attaches sophistry observer reports to the latest speaker row of the turn', () => {
        const entries: DialogueEntry[] = [
            { role: 'proposer', agent_name: 'Proposer', content: 'Opening', timestamp: '2024-01-01T00:00:00Z', citations: [], turn: 0 },
            { role: 'opposer', agent_name: 'Opposer', content: 'Response', timestamp: '2024-01-01T00:00:30Z', citations: [], turn: 0 },
            { role: 'sophistry_round_report', agent_name: 'Observer', content: 'Detected a false dichotomy.', timestamp: '2024-01-01T00:01:00Z', citations: [], turn: 0 },
        ];

        const result = groupDialogue(entries);

        expect(result).toHaveLength(2);
        expect(result[1].agent?.role).toBe('opposer');
        expect(result[1].judge?.role).toBe('sophistry_round_report');
    });

    it('does not require intermediate token entries to keep final rows stable', () => {
        const entries: DialogueEntry[] = [
            { role: 'proposer', agent_name: 'Proposer', content: 'Final speech', timestamp: '2024-01-01T00:00:00Z', citations: [], event_id: 'evt_speech_end', turn: 0 },
            { role: 'judge', agent_name: 'Judge', content: 'Final score', timestamp: '2024-01-01T00:01:00Z', citations: [], target_role: 'proposer', turn: 0, event_id: 'evt_judge' },
        ];

        const result = groupDialogue(entries);

        expect(result).toEqual([
            {
                agent: entries[0],
                judge: entries[1],
                turn: 0,
            },
        ]);
    });
});
