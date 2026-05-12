import { describe, expect, it } from 'vitest';

import {
    clampFloatingInspectorRect,
    createCollapsedFloatingInspectorRect,
    createDefaultFloatingInspectorRect,
    createTopDockedFloatingInspectorRect,
    interactionCursor,
    parseStoredFloatingInspectorRect,
    resizeFloatingInspectorRect,
} from './floatingInspectorLayout';

describe('floatingInspectorLayout', () => {
    it('parses a stored rect when all numeric fields exist', () => {
        expect(parseStoredFloatingInspectorRect('{"x":1,"y":2,"width":3,"height":4}')).toEqual({
            x: 1,
            y: 2,
            width: 3,
            height: 4,
        });
    });

    it('returns null for invalid stored rect payloads', () => {
        expect(parseStoredFloatingInspectorRect('{"x":1}')).toBeNull();
        expect(parseStoredFloatingInspectorRect('nope')).toBeNull();
    });

    it('clamps rect bounds and size into the visible panel area', () => {
        expect(clampFloatingInspectorRect(
            { x: -10, y: -20, width: 999, height: 999 },
            { width: 500, height: 400 },
        )).toEqual({
            x: 8,
            y: 8,
            width: 484,
            height: 384,
        });
    });

    it('creates a default docked rect inside the available bounds', () => {
        const rect = createDefaultFloatingInspectorRect({ width: 900, height: 700 }, 24);

        expect(rect.width).toBe(360);
        expect(rect.height).toBe(520);
        expect(rect.x).toBe(524);
        expect(rect.y).toBe(24);
    });

    it('creates a top docked expanded rect spanning the visible chat workspace', () => {
        expect(createTopDockedFloatingInspectorRect({ width: 900, height: 700 }, 72)).toEqual({
            x: 8,
            y: 72,
            width: 884,
            height: 520,
        });
    });

    it('keeps the top docked rect inside a short viewport', () => {
        const rect = createTopDockedFloatingInspectorRect({ width: 900, height: 300 }, 72);

        expect(rect.y).toBe(72);
        expect(rect.height).toBeLessThanOrEqual(300 - 72 - 8);
    });

    it('creates a compact collapsed rect without inflating to the expanded minimum size', () => {
        expect(createCollapsedFloatingInspectorRect({ width: 900, height: 700 }, 72)).toEqual({
            x: 736,
            y: 72,
            width: 148,
            height: 38,
        });
    });

    it('resizes from the left while respecting minimum size', () => {
        expect(resizeFloatingInspectorRect(
            { x: 100, y: 100, width: 360, height: 520 },
            'left',
            120,
            0,
            { width: 900, height: 700 },
        )).toEqual({
            x: 160,
            y: 100,
            width: 300,
            height: 520,
        });
    });

    it('reports the expected cursor for each interaction mode', () => {
        expect(interactionCursor(null)).toBe('');
        expect(interactionCursor({
            mode: 'move',
            startX: 0,
            startY: 0,
            startRect: { x: 0, y: 0, width: 1, height: 1 },
            bounds: { width: 1, height: 1 },
            startLayoutMode: 'collapsed',
        })).toBe('grabbing');
        expect(interactionCursor({
            mode: 'resize',
            handle: 'top-right',
            startX: 0,
            startY: 0,
            startRect: { x: 0, y: 0, width: 1, height: 1 },
            bounds: { width: 1, height: 1 },
            startLayoutMode: 'collapsed',
        })).toBe('nesw-resize');
    });
});
