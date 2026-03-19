import { describe, expect, it } from 'vitest';

import {
    DEFAULT_MAX_TURNS,
    DEFAULT_TEAM_AGENTS_PER_TEAM,
    DEFAULT_TEAM_DISCUSSION_ROUNDS,
    parseMaxTurnsInput,
    parseTeamAgentsInput,
    parseTeamDiscussionRoundsInput,
} from './debateSession';

describe('debateSession utils', () => {
    it('falls back to the default max turn count for empty input', () => {
        expect(parseMaxTurnsInput('')).toBe(DEFAULT_MAX_TURNS);
        expect(parseMaxTurnsInput('   ')).toBe(DEFAULT_MAX_TURNS);
    });

    it('parses positive integer input', () => {
        expect(parseMaxTurnsInput('7')).toBe(7);
        expect(parseMaxTurnsInput(' 12 ')).toBe(12);
    });

    it('rejects invalid and non-positive values', () => {
        expect(parseMaxTurnsInput('0')).toBe(DEFAULT_MAX_TURNS);
        expect(parseMaxTurnsInput('-1')).toBe(DEFAULT_MAX_TURNS);
        expect(parseMaxTurnsInput('abc')).toBe(DEFAULT_MAX_TURNS);
    });

    it('parses team agent count within 0-10', () => {
        expect(parseTeamAgentsInput('0')).toBe(0);
        expect(parseTeamAgentsInput('6')).toBe(6);
        expect(parseTeamAgentsInput('11')).toBe(DEFAULT_TEAM_AGENTS_PER_TEAM);
    });

    it('parses team discussion rounds within 0-10', () => {
        expect(parseTeamDiscussionRoundsInput('0')).toBe(0);
        expect(parseTeamDiscussionRoundsInput('4')).toBe(4);
        expect(parseTeamDiscussionRoundsInput('-1')).toBe(DEFAULT_TEAM_DISCUSSION_ROUNDS);
    });
});
