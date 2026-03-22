import type { CSSProperties } from 'react';

export type FloatingInspectorBounds = {
    width: number;
    height: number;
};

export type FloatingInspectorRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type FloatingInspectorResizeHandle =
    | 'top'
    | 'right'
    | 'bottom'
    | 'left'
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right';

export type FloatingInspectorInteraction =
    | {
        mode: 'move';
        startX: number;
        startY: number;
        startRect: FloatingInspectorRect;
        bounds: FloatingInspectorBounds;
    }
    | {
        mode: 'resize';
        handle: FloatingInspectorResizeHandle;
        startX: number;
        startY: number;
        startRect: FloatingInspectorRect;
        bounds: FloatingInspectorBounds;
    };

export const FLOATING_INSPECTOR_DEFAULT_SIZE = { width: 360, height: 520 };
export const FLOATING_INSPECTOR_MIN_SIZE = { width: 300, height: 260 };
export const FLOATING_INSPECTOR_MARGIN = 8;
export const FLOATING_INSPECTOR_DOCK_GAP = 16;

export const FLOATING_INSPECTOR_RESIZE_HANDLES: ReadonlyArray<{
    key: FloatingInspectorResizeHandle;
    style: CSSProperties;
}> = [
    {
        key: 'left',
        style: { left: -6, top: 18, bottom: 18, width: 12, cursor: 'ew-resize' },
    },
    {
        key: 'right',
        style: { right: -6, top: 18, bottom: 18, width: 12, cursor: 'ew-resize' },
    },
    {
        key: 'top',
        style: { top: -6, left: 18, right: 18, height: 12, cursor: 'ns-resize' },
    },
    {
        key: 'bottom',
        style: { bottom: -6, left: 18, right: 18, height: 12, cursor: 'ns-resize' },
    },
    {
        key: 'top-left',
        style: { top: -6, left: -6, width: 16, height: 16, cursor: 'nwse-resize' },
    },
    {
        key: 'top-right',
        style: { top: -6, right: -6, width: 16, height: 16, cursor: 'nesw-resize' },
    },
    {
        key: 'bottom-left',
        style: { bottom: -6, left: -6, width: 16, height: 16, cursor: 'nesw-resize' },
    },
    {
        key: 'bottom-right',
        style: { bottom: -6, right: -6, width: 16, height: 16, cursor: 'nwse-resize' },
    },
];

function clampNumber(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function parseStoredFloatingInspectorRect(raw: string | null): FloatingInspectorRect | null {
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as Partial<FloatingInspectorRect>;
        if (
            typeof parsed.x !== 'number' ||
            typeof parsed.y !== 'number' ||
            typeof parsed.width !== 'number' ||
            typeof parsed.height !== 'number'
        ) {
            return null;
        }
        return parsed as FloatingInspectorRect;
    } catch {
        return null;
    }
}

function getFloatingInspectorSizeRange(size: number, preferredMin: number): { min: number; max: number } {
    const max = Math.max(160, size - FLOATING_INSPECTOR_MARGIN * 2);
    return {
        min: Math.min(preferredMin, max),
        max,
    };
}

export function clampFloatingInspectorRect(
    rect: FloatingInspectorRect,
    bounds: FloatingInspectorBounds,
): FloatingInspectorRect {
    const widthRange = getFloatingInspectorSizeRange(bounds.width, FLOATING_INSPECTOR_MIN_SIZE.width);
    const heightRange = getFloatingInspectorSizeRange(bounds.height, FLOATING_INSPECTOR_MIN_SIZE.height);
    const width = clampNumber(rect.width, widthRange.min, widthRange.max);
    const height = clampNumber(rect.height, heightRange.min, heightRange.max);
    const maxX = Math.max(FLOATING_INSPECTOR_MARGIN, bounds.width - width - FLOATING_INSPECTOR_MARGIN);
    const maxY = Math.max(FLOATING_INSPECTOR_MARGIN, bounds.height - height - FLOATING_INSPECTOR_MARGIN);

    return {
        x: clampNumber(rect.x, FLOATING_INSPECTOR_MARGIN, maxX),
        y: clampNumber(rect.y, FLOATING_INSPECTOR_MARGIN, maxY),
        width,
        height,
    };
}

export function createDefaultFloatingInspectorRect(
    bounds: FloatingInspectorBounds,
    preferredTop: number,
): FloatingInspectorRect {
    const widthRange = getFloatingInspectorSizeRange(bounds.width, FLOATING_INSPECTOR_MIN_SIZE.width);
    const heightRange = getFloatingInspectorSizeRange(bounds.height, FLOATING_INSPECTOR_MIN_SIZE.height);
    const width = clampNumber(
        FLOATING_INSPECTOR_DEFAULT_SIZE.width,
        widthRange.min,
        widthRange.max,
    );
    const height = clampNumber(
        FLOATING_INSPECTOR_DEFAULT_SIZE.height,
        heightRange.min,
        heightRange.max,
    );

    return clampFloatingInspectorRect(
        {
            x: bounds.width - width - FLOATING_INSPECTOR_DOCK_GAP,
            y: preferredTop,
            width,
            height,
        },
        bounds,
    );
}

export function resizeFloatingInspectorRect(
    startRect: FloatingInspectorRect,
    handle: FloatingInspectorResizeHandle,
    deltaX: number,
    deltaY: number,
    bounds: FloatingInspectorBounds,
): FloatingInspectorRect {
    const widthRange = getFloatingInspectorSizeRange(bounds.width, FLOATING_INSPECTOR_MIN_SIZE.width);
    const heightRange = getFloatingInspectorSizeRange(bounds.height, FLOATING_INSPECTOR_MIN_SIZE.height);
    const right = startRect.x + startRect.width;
    const bottom = startRect.y + startRect.height;

    let x = startRect.x;
    let y = startRect.y;
    let width = startRect.width;
    let height = startRect.height;

    if (handle.includes('left')) {
        x = clampNumber(startRect.x + deltaX, FLOATING_INSPECTOR_MARGIN, right - widthRange.min);
        width = right - x;
    }

    if (handle.includes('right')) {
        width = clampNumber(
            startRect.width + deltaX,
            widthRange.min,
            bounds.width - startRect.x - FLOATING_INSPECTOR_MARGIN,
        );
    }

    if (handle.includes('top')) {
        y = clampNumber(startRect.y + deltaY, FLOATING_INSPECTOR_MARGIN, bottom - heightRange.min);
        height = bottom - y;
    }

    if (handle.includes('bottom')) {
        height = clampNumber(
            startRect.height + deltaY,
            heightRange.min,
            bounds.height - startRect.y - FLOATING_INSPECTOR_MARGIN,
        );
    }

    return clampFloatingInspectorRect({ x, y, width, height }, bounds);
}

export function interactionCursor(interaction: FloatingInspectorInteraction | null): string {
    if (!interaction) return '';
    if (interaction.mode === 'move') return 'grabbing';

    switch (interaction.handle) {
        case 'left':
        case 'right':
            return 'ew-resize';
        case 'top':
        case 'bottom':
            return 'ns-resize';
        case 'top-left':
        case 'bottom-right':
            return 'nwse-resize';
        case 'top-right':
        case 'bottom-left':
            return 'nesw-resize';
        default:
            return '';
    }
}
