import { describe, expect, it } from 'vitest';

import type { SessionListItem } from '../../types';
import {
    filterSessionsByQuery,
    getSessionModePresentation,
    mergeSessionPage,
    sortSessionListItems,
    upsertSessionListItem,
} from './sessionList';

const baseSessions: SessionListItem[] = [
    {
        id: 'a',
        topic: 'Alpha topic',
        debate_mode: 'standard',
        status: 'completed',
        current_turn: 1,
        max_turns: 3,
        created_at: '2026-03-20T00:00:00Z',
    },
    {
        id: 'b',
        topic: 'Beta topic',
        debate_mode: 'standard',
        status: 'in_progress',
        current_turn: 2,
        max_turns: 5,
        created_at: '2026-03-21T00:00:00Z',
    },
];

describe('sessionList utils', () => {
    it('sorts newer sessions first', () => {
        expect([...baseSessions].sort(sortSessionListItems).map((session) => session.id)).toEqual(['b', 'a']);
    });

    it('upserts an existing session and keeps the list sorted', () => {
        const updated = upsertSessionListItem(baseSessions, {
            ...baseSessions[0],
            current_turn: 3,
            created_at: '2026-03-22T00:00:00Z',
        });

        expect(updated.map((session) => session.id)).toEqual(['a', 'b']);
        expect(updated[0].current_turn).toBe(3);
    });

    it('merges appended pages without duplicating existing sessions', () => {
        const merged = mergeSessionPage(baseSessions, [
            {
                ...baseSessions[1],
                current_turn: 4,
            },
            {
                id: 'c',
                topic: 'Gamma topic',
                debate_mode: 'standard',
                status: 'completed',
                current_turn: 1,
                max_turns: 2,
                created_at: '2026-03-19T00:00:00Z',
            },
        ]);

        expect(merged.map((session) => session.id)).toEqual(['b', 'a', 'c']);
        expect(merged[0].current_turn).toBe(4);
    });

    it('filters sessions by a trimmed case-insensitive query', () => {
        expect(filterSessionsByQuery(baseSessions, '  beta ')).toEqual([baseSessions[1]]);
        expect(filterSessionsByQuery(baseSessions, '')).toEqual(baseSessions);
    });

    it('returns a dedicated presentation for sophistry sessions', () => {
        expect(getSessionModePresentation('standard')).toMatchObject({
            label: '标准',
            activeBackground: 'var(--bg-card)',
            activeBorder: '1px solid var(--border-subtle)',
        });

        expect(getSessionModePresentation('sophistry_experiment')).toMatchObject({
            label: '诡辩',
            badgeBackground: 'var(--mode-sophistry-soft)',
            badgeColor: 'var(--mode-sophistry-accent)',
            activeBackground: 'var(--mode-sophistry-card)',
            activeBorder: '1px solid var(--mode-sophistry-accent)',
        });
    });
});
