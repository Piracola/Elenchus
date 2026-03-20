import { describe, expect, it } from 'vitest';

import { isElementNearBottom, isNearBottom } from './chatScroll';

describe('chatScroll', () => {
    it('treats positions near the bottom as followable', () => {
        expect(isNearBottom(820, 200, 1100)).toBe(true);
        expect(isNearBottom(790, 200, 1100)).toBe(false);
    });

    it('supports element-shaped inputs', () => {
        expect(
            isElementNearBottom({
                scrollTop: 900,
                clientHeight: 200,
                scrollHeight: 1200,
            }),
        ).toBe(false);

        expect(
            isElementNearBottom({
                scrollTop: 920,
                clientHeight: 200,
                scrollHeight: 1200,
            }),
        ).toBe(true);
    });
});
