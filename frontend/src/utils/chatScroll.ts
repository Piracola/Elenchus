const DEFAULT_BOTTOM_THRESHOLD = 96;

export function isNearBottom(
    scrollTop: number,
    clientHeight: number,
    scrollHeight: number,
    threshold: number = DEFAULT_BOTTOM_THRESHOLD,
): boolean {
    const distanceToBottom = scrollHeight - (scrollTop + clientHeight);
    return distanceToBottom <= Math.max(0, threshold);
}

export function isElementNearBottom(
    element: Pick<HTMLElement, 'scrollTop' | 'clientHeight' | 'scrollHeight'>,
    threshold?: number,
): boolean {
    return isNearBottom(
        element.scrollTop,
        element.clientHeight,
        element.scrollHeight,
        threshold,
    );
}

