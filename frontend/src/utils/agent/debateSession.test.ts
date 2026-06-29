import { describe, expect, it } from 'vitest';

import {
    DEFAULT_MAX_TURNS,
    parseMaxTurnsInput,
    parseSpeechMaxCharsInput,
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

    it('parses speech limits within 0-20000', () => {
        expect(parseSpeechMaxCharsInput('0')).toBe(0);
        expect(parseSpeechMaxCharsInput('1200')).toBe(1200);
        expect(parseSpeechMaxCharsInput('20001')).toBe(0);
    });

    it('falls back for invalid speech limits', () => {
        expect(parseSpeechMaxCharsInput('-1')).toBe(0);
        expect(parseSpeechMaxCharsInput('abc')).toBe(0);
        expect(parseSpeechMaxCharsInput('')).toBe(0);
    });
});
