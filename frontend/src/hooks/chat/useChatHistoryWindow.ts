import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { resolveHistoryRowStart } from '../../utils/chat/chatHistoryWindow';
import { computeVariableVirtualWindow } from '../../utils/virtualization/virtualWindow';
import type { TranscriptViewModel } from '../../utils/chat/transcriptViewModel';

const INITIAL_HISTORY_ROW_WINDOW = 120;
const HISTORY_ROW_BATCH_SIZE = 80;
const CHAT_ROW_OVERSCAN = 5;
const DEFAULT_CHAT_ROW_HEIGHT = 320;
const CHAT_ROW_HEIGHT_JITTER_PX = 1;

type UseChatHistoryWindowArgs = {
    currentSessionId: string | null;
    transcriptViewModel: TranscriptViewModel;
    scrollRef: RefObject<HTMLDivElement | null>;
    scrollTop: number;
    viewportHeight: number;
};

export function useChatHistoryWindow({
    currentSessionId,
    transcriptViewModel,
    scrollRef,
    scrollTop,
    viewportHeight,
}: UseChatHistoryWindowArgs) {
    const previousRowsLengthRef = useRef(0);
    const previousSessionIdRef = useRef<string | null | undefined>(undefined);
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
        queueMicrotask(() => {
            setRowHeights({});
        });
    }, [currentSessionId]);

    useEffect(() => {
        const sessionId = currentSessionId;
        const rowsLength = transcriptViewModel.rows.length;
        const sessionChanged = previousSessionIdRef.current !== sessionId;

        setHistoryRowStart((currentStart) => resolveHistoryRowStart({
            currentStart,
            rowsLength,
            previousRowsLength: previousRowsLengthRef.current,
            sessionChanged,
            initialWindowSize: INITIAL_HISTORY_ROW_WINDOW,
        }));

        previousSessionIdRef.current = sessionId;
        previousRowsLengthRef.current = rowsLength;
    }, [currentSessionId, transcriptViewModel.rows.length]);

    const renderedRowViewModels = useMemo(
        () => (historyRowStart <= 0
            ? transcriptViewModel.rowViewModels
            : transcriptViewModel.rowViewModels.slice(historyRowStart)),
        [historyRowStart, transcriptViewModel.rowViewModels],
    );
    const hiddenHistoryRowCount = historyRowStart;

    const estimateRowHeight = useCallback((index: number) => {
        const viewModel = renderedRowViewModels[index];
        if (!viewModel) {
            return DEFAULT_CHAT_ROW_HEIGHT;
        }

        const baseHeight = viewModel.row.system ? 96 : 260;
        const insightCount = viewModel.insightSections.length;
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
        if (!container || hiddenHistoryRowCount <= 0) return;
        if (pendingHistoryPrependScrollHeightRef.current !== null) return;

        pendingHistoryPrependScrollHeightRef.current = container.scrollHeight;
        setHistoryRowStart((currentStart) => Math.max(0, currentStart - HISTORY_ROW_BATCH_SIZE));
    }, [hiddenHistoryRowCount, scrollRef]);

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

    return {
        renderedRowViewModels,
        hiddenHistoryRowCount,
        virtualWindow,
        virtualRows,
        loadOlderHistoryRows,
        setMeasuredRow,
        consensusEntries: transcriptViewModel.consensusEntries,
        liveTranscript: transcriptViewModel.liveTranscript,
    };
}
