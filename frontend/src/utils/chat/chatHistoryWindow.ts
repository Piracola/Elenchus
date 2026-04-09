export interface ResolveHistoryRowStartOptions {
    currentStart: number;
    rowsLength: number;
    previousRowsLength: number;
    replayEnabled: boolean;
    sessionChanged: boolean;
    replayChanged: boolean;
    initialWindowSize: number;
}

export function resolveHistoryRowStart({
    currentStart,
    rowsLength,
    previousRowsLength,
    replayEnabled,
    sessionChanged,
    replayChanged,
    initialWindowSize,
}: ResolveHistoryRowStartOptions): number {
    const latestWindowStart = Math.max(0, rowsLength - initialWindowSize);

    if (replayEnabled) {
        return 0;
    }

    if (sessionChanged || replayChanged) {
        return latestWindowStart;
    }

    const previousLatestWindowStart = Math.max(0, previousRowsLength - initialWindowSize);
    return currentStart < previousLatestWindowStart ? currentStart : latestWindowStart;
}

export function revealFocusedHistoryRow(currentStart: number, focusedRowIndex: number): number {
    if (focusedRowIndex < 0 || focusedRowIndex >= currentStart) {
        return currentStart;
    }

    return Math.max(0, focusedRowIndex);
}
