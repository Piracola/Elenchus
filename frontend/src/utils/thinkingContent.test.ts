import { describe, expect, it } from 'vitest';

import { splitLeadingThinkingContent } from './thinkingContent';

describe('splitLeadingThinkingContent', () => {
    it('extracts a leading think block and keeps the final response visible', () => {
        expect(
            splitLeadingThinkingContent('<think>draft reasoning</think>\n\nFinal answer'),
        ).toEqual({
            thinking: 'draft reasoning',
            response: 'Final answer',
        });
    });

    it('merges consecutive leading think blocks', () => {
        expect(
            splitLeadingThinkingContent(
                '<think>first pass</think>\n<think>second pass</think>\nResult',
            ),
        ).toEqual({
            thinking: 'first pass\n\nsecond pass',
            response: 'Result',
        });
    });

    it('ignores non-leading think tags', () => {
        const content = 'Code sample: <think>literal tag</think>';

        expect(splitLeadingThinkingContent(content)).toEqual({
            thinking: null,
            response: content,
        });
    });

    it('keeps the original content when the think block is malformed', () => {
        const content = '<think>missing end tag';

        expect(splitLeadingThinkingContent(content)).toEqual({
            thinking: null,
            response: content,
        });
    });
});
