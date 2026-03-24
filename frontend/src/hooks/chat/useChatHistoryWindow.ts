import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { resolveHistoryRowStart, revealFocusedHistoryRow } from '../../utils/chatHistoryWindow';
import { computeVariableVirtualWindow } from '../../utils/virtualWindow';
import type { TranscriptViewModel } from '../../utils/transcriptViewModel';

const INITIAL_HISTORY_ROW_WINDOW = 120;
const HISTORY_ROW_BATCH_SIZE = 80;
const CHAT_ROW_OVERSCAN = 5;
const DEFAULT_CHAT_ROW_HEIGHT = 320;
const CHAT_ROW_HEIGHT_JITTER_PX = 1;
const CHAT_SCROLL_EPSILON = 2;

type UseChatHistoryWindowArgs = {
    currentSessionId: string | null;
    replayEnabled: boolean;
    focusedRuntimeEventId: string | null;
    transcriptViewModel: TranscriptViewModel;
    scrollRef: RefObject<HTMLDivElement | null>;
    scrollTop: number;
    viewportHeight: number;
    smoothScrollSuppressed: boolean;
};

export function useChatHistoryWindow({
    currentSessionId,
    replayEnabled,
    focusedRuntimeEventId,
    transcriptViewModel,
    scrollRef,
    scrollTop,
    viewportHeight,
    smoothScrollSuppressed,
}: UseChatHistoryWindowArgs) {
    const previousRowsLengthRef = useRef(0);
    const previousSessionIdRef = useRef<string | null | undefined>(undefined);
    const previousReplayEnabledRef = useRef<boolean | undefined>(undefined);
    const pendingHistoryPrependScrollHeightRef = useRef<number | null>(null);
    const measureObserversRef = useRef<Map<string, ResizeObserver>>(new Map());
    const measureCallbacksRef = useRef<Map<string, (node: HTMLDivElement | null) => void>>(new Map());
    const pendingRowHeightsRef = useRef<Map<string, number>>(new Map());
    const rowHeightFlushFrameRef = useRef<number | null>(null);
    const [historyRowStart, setHistoryRowStart] = useState(0);
    const [rowHeights, setRowHeights] = useState<Record<string, number>>({});

    useEffect(() => {
        if (rowHeightFlushFrameRef.current !== null) {
            cancelAnimationFrame(rowHeightFlushFrameRef.current);
            rowHeightFlushFrameRef.current = null;
        }
        pendingRowHeightsRef.current.clear();
        pendingHistoryPrependScrollHeightRef.current = null;
        setRowHeights({});
    }, [currentSessionId]);

    useEffect(() => {
        const sessionId = currentSessionId;
        const rowsLength = transcriptViewModel.rows.length;
        const sessionChanged = previousSessionIdRef.current !== sessionId;
        const replayChanged = previousReplayEnabledRef.current !== replayEnabled;

        setHistoryRowStart((currentStart) => resolveHistoryRowStart({
            currentStart,
            rowsLength,
            previousRowsLength: previousRowsLengthRef.current,
            replayEnabled,
            sessionChanged,
            replayChanged,
            initialWindowSize: INITIAL_HISTORY_ROW_WINDOW,
        }));

        previousSessionIdRef.current = sessionId;
        previousReplayEnabledRef.current = replayEnabled;
        previousRowsLengthRef.current = rowsLength;
    }, [currentSessionId, replayEnabled, transcriptViewModel.rows.length]);

    const renderedRowViewModels = useMemo(
        () => (replayEnabled || historyRowStart <= 0
            ? transcriptViewModel.rowViewModels
            : transcriptViewModel.rowViewModels.slice(historyRowStart)),
        [historyRowStart, replayEnabled, transcriptViewModel.rowViewModels],
    );
    const hiddenHistoryRowCount = replayEnabled ? 0 : historyRowStart;

    const estimateRowHeight = useCallback((index: number) => {
        const viewModel = renderedRowViewModels[index];
        if (!viewModel) {
            return DEFAULT_CHAT_ROW_HEIGHT;
        }

        const baseHeight = viewModel.row.system ? 96 : 260;
        const insightCount = viewModel.insightSections.length + viewModel.jurySections.length;
        return baseHeight + insightCount * 64;
    }, [renderedRowViewModels]);

    const virtualItemHeights = useMemo(
        () => renderedRowViewModels.map((viewModel, index) => rowHeights[viewModel.key] ?? estimateRowHeight(index)),
        [estimateRowHeight, renderedRowViewModels, rowHeights],
    );

    const virtualWindow = useMemo(
        () => computeVariableVirtualWindow({
            itemHeights: virtualItemHeights,
            scrollTop,
            viewportHeight,
            overscan: CHAT_ROW_OVERSCAN,
        }),
        [scrollTop, viewportHeight, virtualItemHeights],
    );

    const virtualRows = useMemo(
        () => renderedRowViewModels.slice(virtualWindow.startIndex, virtualWindow.endIndex),
        [renderedRowViewModels, virtualWindow.endIndex, virtualWindow.startIndex],
    );

    const getRenderedRowTop = useCallback((index: number) => (
        virtualItemHeights.slice(0, index).reduce((sum, height) => sum + height, 0)
    ), [virtualItemHeights]);

    const flushPendingRowHeights = useCallback(() => {
        rowHeightFlushFrameRef.current = null;
        const pendingEntries = Array.from(pendingRowHeightsRef.current.entries());
        if (!pendingEntries.length) {
            return;
        }

        pendingRowHeightsRef.current.clear();
        setRowHeights((previous) => {
            let nextState = previous;
            let changed = false;

            for (const [key, nextHeight] of pendingEntries) {
                const previousHeight = previous[key];
                if (
                    previousHeight !== undefined
                    && Math.abs(previousHeight - nextHeight) <= CHAT_ROW_HEIGHT_JITTER_PX
                ) {
                    continue;
                }
                if (nextState === previous) {
                    nextState = { ...previous };
                }
                nextState[key] = nextHeight;
                changed = true;
            }

            return changed ? nextState : previous;
        });
    }, []);

    const scheduleRowHeightFlush = useCallback(() => {
        if (rowHeightFlushFrameRef.current !== null) {
            return;
        }
        rowHeightFlushFrameRef.current = requestAnimationFrame(flushPendingRowHeights);
    }, [flushPendingRowHeights]);

    const setMeasuredRow = useCallback((key: string) => {
        const callbacks = measureCallbacksRef.current;
        const cached = callbacks.get(key);
        if (cached) {
            return cached;
        }

        const callback = (node: HTMLDivElement | null) => {
            const observers = measureObserversRef.current;
            const previousObserver = observers.get(key);
            if (previousObserver) {
                previousObserver.disconnect();
                observers.delete(key);
            }

            if (!node || typeof ResizeObserver === 'undefined') {
                return;
            }

            const updateHeight = () => {
                const nextHeight = Math.ceil(node.getBoundingClientRect().height);
                const pendingHeight = pendingRowHeightsRef.current.get(key);
                if (
                    pendingHeight !== undefined
                    && Math.abs(pendingHeight - nextHeight) <= CHAT_ROW_HEIGHT_JITTER_PX
                ) {
                    return;
                }
                pendingRowHeightsRef.current.set(key, nextHeight);
                scheduleRowHeightFlush();
            };

            updateHeight();
            const observer = new ResizeObserver(updateHeight);
            observer.observe(node);
            observers.set(key, observer);
        };

        callbacks.set(key, callback);
        return callback;
    }, [scheduleRowHeightFlush]);

    useEffect(() => {
        const activeKeys = new Set(renderedRowViewModels.map((viewModel) => viewModel.key));
        const callbacks = measureCallbacksRef.current;
        const observers = measureObserversRef.current;
        const pendingHeights = pendingRowHeightsRef.current;

        callbacks.forEach((_, key) => {
            if (activeKeys.has(key)) {
                return;
            }
            callbacks.delete(key);
            pendingHeights.delete(key);
            const observer = observers.get(key);
            if (observer) {
                observer.disconnect();
                observers.delete(key);
            }
        });
    }, [renderedRowViewModels]);

    useEffect(() => () => {
        if (rowHeightFlushFrameRef.current !== null) {
            cancelAnimationFrame(rowHeightFlushFrameRef.current);
            rowHeightFlushFrameRef.current = null;
        }
        pendingRowHeightsRef.current.clear();
        measureObserversRef.current.forEach((observer) => observer.disconnect());
        measureObserversRef.current.clear();
        measureCallbacksRef.current.clear();
    }, []);

    const loadOlderHistoryRows = useCallback(() => {
        const container = scrollRef.current;
        if (!container || replayEnabled || hiddenHistoryRowCount <= 0) return;
        if (pendingHistoryPrependScrollHeightRef.current !== null) return;

        pendingHistoryPrependScrollHeightRef.current = container.scrollHeight;
        setHistoryRowStart((currentStart) => Math.max(0, currentStart - HISTORY_ROW_BATCH_SIZE));
    }, [hiddenHistoryRowCount, replayEnabled, scrollRef]);

    useLayoutEffect(() => {
        const previousScrollHeight = pendingHistoryPrependScrollHeightRef.current;
        const container = scrollRef.current;
        if (previousScrollHeight === null || !container) return;

        const scrollDelta = container.scrollHeight - previousScrollHeight;
        if (scrollDelta > 0) {
            container.scrollTop += scrollDelta;
        }
        pendingHistoryPrependScrollHeightRef.current = null;
    }, [renderedRowViewModels.length, scrollRef, virtualWindow.paddingBottom, virtualWindow.paddingTop]);

    useEffect(() => {
        if (replayEnabled || !focusedRuntimeEventId || transcriptViewModel.focusedRowIndex < 0) {
            return;
        }

        setHistoryRowStart((currentStart) => revealFocusedHistoryRow(currentStart, transcriptViewModel.focusedRowIndex));
    }, [focusedRuntimeEventId, replayEnabled, transcriptViewModel.focusedRowIndex]);

    useEffect(() => {
        if (!focusedRuntimeEventId) return;
        const container = scrollRef.current;
        if (!container) return;

        const target = container.querySelector('[data-row-focused="true"]') as HTMLElement | null;
        if (target) {
            const containerRect = container.getBoundingClientRect();
            const targetRect = target.getBoundingClientRect();
            const targetAlreadyVisible = targetRect.top >= containerRect.top + CHAT_SCROLL_EPSILON
                && targetRect.bottom <= containerRect.bottom - CHAT_SCROLL_EPSILON;
            if (!targetAlreadyVisible) {
                target.scrollIntoView({
                    block: 'center',
                    behavior: smoothScrollSuppressed ? 'auto' : 'smooth',
                });
            }
            return;
        }

        const renderedFocusedIndex = replayEnabled
            ? transcriptViewModel.focusedRowIndex
            : transcriptViewModel.focusedRowIndex - historyRowStart;
        if (renderedFocusedIndex < 0) {
            return;
        }

        const top = getRenderedRowTop(renderedFocusedIndex);
        const height = virtualItemHeights[renderedFocusedIndex] ?? DEFAULT_CHAT_ROW_HEIGHT;
        const targetScrollTop = Math.max(0, top - (container.clientHeight / 2) + (height / 2));
        if (Math.abs(container.scrollTop - targetScrollTop) <= CHAT_SCROLL_EPSILON) {
            return;
        }
        container.scrollTo({
            top: targetScrollTop,
            behavior: smoothScrollSuppressed ? 'auto' : 'smooth',
        });
    }, [
        focusedRuntimeEventId,
        getRenderedRowTop,
        historyRowStart,
        replayEnabled,
        scrollRef,
        smoothScrollSuppressed,
        transcriptViewModel.focusedRowIndex,
        virtualItemHeights,
        virtualRows,
        viewportHeight,
    ]);

    return {
        renderedRowViewModels,
        hiddenHistoryRowCount,
        virtualWindow,
        virtualRows,
        loadOlderHistoryRows,
        setMeasuredRow,
        consensusEntries: transcriptViewModel.consensusEntries,
        consensusFocused: transcriptViewModel.consensusFocused,
    };
}
