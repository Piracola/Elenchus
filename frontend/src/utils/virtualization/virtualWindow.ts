import type { RuntimeEvent } from '../../types';

export interface VirtualVariableWindow {
    startIndex: number;
    endIndex: number;
    paddingTop: number;
    paddingBottom: number;
}

export function estimateRuntimeEventSummary(event: RuntimeEvent): string {
    const content = event.payload.content;
    if (typeof content === 'string' && content.trim()) {
        return content;
    }

    const role = event.payload.role;
    if (typeof role === 'string' && role.trim()) {
        return role;
    }

    const node = event.payload.node;
    if (typeof node === 'string' && node.trim()) {
        return node;
    }

    return event.type;
}

export function estimateTimelineItemHeight(event: RuntimeEvent): number {
    const summary = estimateRuntimeEventSummary(event);
    const extraLines = Math.ceil(Math.max(0, summary.length - 42) / 36);
    return 54 + Math.min(4, extraLines) * 16;
}

export function computeVariableVirtualWindow({
    itemHeights,
    scrollTop,
    viewportHeight,
    overscan,
}: {
    itemHeights: number[];
    scrollTop: number;
    viewportHeight: number;
    overscan: number;
}): VirtualVariableWindow {
    const totalCount = itemHeights.length;
    if (!totalCount) {
        return { startIndex: 0, endIndex: 0, paddingTop: 0, paddingBottom: 0 };
    }

    const safeOverscan = Math.max(0, overscan);
    const safeViewportHeight = Math.max(0, viewportHeight);
    const safeScrollTop = Math.max(0, scrollTop);
    const viewportBottom = safeScrollTop + safeViewportHeight;

    let offset = 0;
    let startIndex = 0;
    while (startIndex < totalCount && offset + itemHeights[startIndex] <= safeScrollTop) {
        offset += itemHeights[startIndex];
        startIndex += 1;
    }

    let endIndex = startIndex;
    let consumedHeight = offset;
    while (endIndex < totalCount && consumedHeight < viewportBottom) {
        consumedHeight += itemHeights[endIndex];
        endIndex += 1;
    }

    const visibleStart = Math.max(0, startIndex - safeOverscan);
    const visibleEnd = Math.min(totalCount, endIndex + safeOverscan);
    const paddingTop = itemHeights.slice(0, visibleStart).reduce((sum, height) => sum + height, 0);
    const renderedHeight = itemHeights
        .slice(visibleStart, visibleEnd)
        .reduce((sum, height) => sum + height, 0);
    const totalHeight = itemHeights.reduce((sum, height) => sum + height, 0);

    return {
        startIndex: visibleStart,
        endIndex: visibleEnd,
        paddingTop,
        paddingBottom: Math.max(0, totalHeight - paddingTop - renderedHeight),
    };
}
