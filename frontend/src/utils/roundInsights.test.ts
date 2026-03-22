import { describe, expect, it } from 'vitest';

import type { DialogueEntry } from '../types';
import {
    buildSpeakerDiscussionMap,
    buildTurnDiscussionMap,
    eventMatchesTurn,
    sideLabel,
    speakerInsightKey,
} from './roundInsights';

describe('roundInsights utils', () => {
    it('builds the expected speaker insight key and side label', () => {
        expect(speakerInsightKey(1, 'proposer')).toBe('1:proposer');
        expect(sideLabel('opposer')).toBe('反方');
        expect(sideLabel(undefined)).toBe('队内');
    });

    it('groups team discussion by turn and speaker side', () => {
        const entries: DialogueEntry[] = [
            {
                role: 'team_member',
                content: 'internal note',
                citations: [],
                timestamp: '2026-03-17T00:00:00Z',
                agent_name: 'A',
                turn: 1,
                team_side: 'proposer',
            },
        ];

        expect(buildSpeakerDiscussionMap(entries).get('1:proposer')).toEqual(entries);
    });

    it('groups jury entries by turn and ignores consensus summaries', () => {
        const juryEntry: DialogueEntry = {
            role: 'jury_member',
            content: 'jury note',
            citations: [],
            timestamp: '2026-03-17T00:00:00Z',
            agent_name: 'J',
            turn: 2,
        };
        const consensusEntry: DialogueEntry = {
            ...juryEntry,
            role: 'consensus_summary',
        };

        expect(buildTurnDiscussionMap([juryEntry, consensusEntry]).get(2)).toEqual([juryEntry]);
    });

    it('matches events to turns from the runtime payload', () => {
        expect(eventMatchesTurn({ payload: { turn: 3 } }, 3)).toBe(true);
        expect(eventMatchesTurn({ payload: { turn: '3' } }, 3)).toBe(false);
    });
});
