export interface ResolveHistoryRowStartOptions {
    currentStart: number;
    rowsLength: number;
    previousRowsLength: number;
    sessionChanged: boolean;
    initialWindowSize: number;
}

export function resolveHistoryRowStart({
    currentStart,
    rowsLength,
    previousRowsLength,
    sessionChanged,
    initialWindowSize,
}: ResolveHistoryRowStartOptions): number {
    const latestWindowStart = Math.max(0, rowsLength - initialWindowSize);

    if (sessionChanged) {
        return latestWindowStart;
    }

    const previousLatestWindowStart = Math.max(0, previousRowsLength - initialWindowSize);
    return currentStart < previousLatestWindowStart ? currentStart : latestWindowStart;
}
