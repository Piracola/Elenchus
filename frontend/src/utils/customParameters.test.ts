import { describe, expect, it } from 'vitest';

import { formatCustomParameters, parseCustomParametersInput } from './customParameters';

describe('customParameters utils', () => {
    it('parses a full JSON object', () => {
        expect(parseCustomParametersInput('{"reasoning_effort":"medium"}')).toEqual({
            reasoning_effort: 'medium',
        });
    });

    it('parses a JSON snippet without outer braces', () => {
        expect(parseCustomParametersInput('"reasoning_effort": "medium",')).toEqual({
            reasoning_effort: 'medium',
        });
    });

    it('formats stored parameters for editing', () => {
        expect(formatCustomParameters({ reasoning_effort: 'high' })).toBe(
            '{\n  "reasoning_effort": "high"\n}',
        );
    });
});
