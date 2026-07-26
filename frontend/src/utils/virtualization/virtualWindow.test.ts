import { describe, expect, it } from 'vitest';
import { computeVariableVirtualWindow } from './virtualWindow';

const heights = (count: number, height: number) => Array.from({ length: count }, () => height);

describe('computeVariableVirtualWindow', () => {
    it('returns an empty window for an empty list', () => {
        expect(
            computeVariableVirtualWindow({ itemHeights: [], scrollTop: 0, viewportHeight: 500, overscan: 5 }),
        ).toEqual({ startIndex: 0, endIndex: 0, paddingTop: 0, paddingBottom: 0 });
    });

    it('covers the viewport from the top of the list', () => {
        const window = computeVariableVirtualWindow({
            itemHeights: heights(20, 100),
            scrollTop: 0,
            viewportHeight: 300,
            overscan: 0,
        });

        expect(window.startIndex).toBe(0);
        expect(window.endIndex).toBeGreaterThanOrEqual(3);
        expect(window.paddingTop).toBe(0);
        // Everything below the rendered slice must still be reserved.
        expect(window.paddingTop + window.endIndex * 100 - window.startIndex * 100 + window.paddingBottom).toBe(2000);
    });

    it('skips rows scrolled past and reserves their height as padding', () => {
        const window = computeVariableVirtualWindow({
            itemHeights: heights(20, 100),
            scrollTop: 500,
            viewportHeight: 300,
            overscan: 0,
        });

        expect(window.startIndex).toBe(5);
        expect(window.paddingTop).toBe(500);
    });

    it('applies overscan on both sides without leaving the list bounds', () => {
        const window = computeVariableVirtualWindow({
            itemHeights: heights(20, 100),
            scrollTop: 500,
            viewportHeight: 300,
            overscan: 3,
        });

        expect(window.startIndex).toBe(2);
        expect(window.paddingTop).toBe(200);
        expect(window.endIndex).toBeLessThanOrEqual(20);
    });

    it('clamps to the list when scrolled to the very bottom', () => {
        const window = computeVariableVirtualWindow({
            itemHeights: heights(10, 100),
            scrollTop: 10_000,
            viewportHeight: 300,
            overscan: 2,
        });

        expect(window.endIndex).toBe(10);
        expect(window.paddingBottom).toBe(0);
    });

    it('handles variable row heights', () => {
        const itemHeights = [50, 400, 30, 30, 800, 20];
        const window = computeVariableVirtualWindow({
            itemHeights,
            scrollTop: 460,
            viewportHeight: 100,
            overscan: 0,
        });

        // 50 + 400 = 450 are fully above the viewport, so row 2 is first.
        expect(window.startIndex).toBe(2);
        expect(window.paddingTop).toBe(450);
    });

    it('treats negative scroll, viewport, and overscan values as zero', () => {
        const window = computeVariableVirtualWindow({
            itemHeights: heights(5, 100),
            scrollTop: -200,
            viewportHeight: -50,
            overscan: -3,
        });

        // A zero-height viewport renders nothing, but the full content height
        // must still be reserved so the scroll container keeps its size.
        expect(window).toEqual({
            startIndex: 0,
            endIndex: 0,
            paddingTop: 0,
            paddingBottom: 500,
        });
    });

    it('keeps total reserved height equal to the content height', () => {
        const itemHeights = [120, 80, 300, 60, 240, 90, 150];
        const total = itemHeights.reduce((sum, value) => sum + value, 0);
        const window = computeVariableVirtualWindow({
            itemHeights,
            scrollTop: 300,
            viewportHeight: 200,
            overscan: 1,
        });

        const renderedHeight = itemHeights
            .slice(window.startIndex, window.endIndex)
            .reduce((sum, value) => sum + value, 0);
        expect(window.paddingTop + renderedHeight + window.paddingBottom).toBe(total);
    });
});
