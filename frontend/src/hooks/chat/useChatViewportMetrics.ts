import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { isElementNearBottom } from '../../utils/chat/chatScroll';

type UseChatViewportMetricsArgs = {
    currentSessionId: string | null;
    replayEnabled: boolean;
    isDocumentVisible: boolean;
    visibilityResumeToken: number;
    dialogueHistoryLength: number;
    teamDialogueHistoryLength: number;
    juryDialogueHistoryLength: number;
    currentTurn: number;
    scrollRef: RefObject<HTMLDivElement | null>;
    topOverlayRef: RefObject<HTMLDivElement | null>;
    bottomOverlayRef: RefObject<HTMLDivElement | null>;
};

export function useChatViewportMetrics({
    currentSessionId,
    replayEnabled,
    isDocumentVisible,
    visibilityResumeToken,
    dialogueHistoryLength,
    teamDialogueHistoryLength,
    juryDialogueHistoryLength,
    currentTurn,
    scrollRef,
    topOverlayRef,
    bottomOverlayRef,
}: UseChatViewportMetricsArgs) {
    const overlayHeightsRef = useRef<{ top: number; bottom: number } | null>(null);
    const autoScrollEnabledRef = useRef(true);
    const smoothScrollRestoreRef = useRef<number | null>(null);
    const [topOverlayHeight, setTopOverlayHeight] = useState(0);
    const [bottomOverlayHeight, setBottomOverlayHeight] = useState(0);
    const [smoothScrollSuppressed, setSmoothScrollSuppressed] = useState(false);
    const [viewportHeight, setViewportHeight] = useState(0);
    const [scrollTop, setScrollTop] = useState(0);

    useEffect(() => {
        autoScrollEnabledRef.current = true;
        overlayHeightsRef.current = null;
    }, [currentSessionId]);

    useEffect(() => {
        if (!isDocumentVisible) {
            return;
        }

        queueMicrotask(() => {
            setSmoothScrollSuppressed(true);
        });
        if (smoothScrollRestoreRef.current !== null) {
            cancelAnimationFrame(smoothScrollRestoreRef.current);
        }
        smoothScrollRestoreRef.current = requestAnimationFrame(() => {
            smoothScrollRestoreRef.current = requestAnimationFrame(() => {
                setSmoothScrollSuppressed(false);
                smoothScrollRestoreRef.current = null;
            });
        });

        return () => {
            if (smoothScrollRestoreRef.current !== null) {
                cancelAnimationFrame(smoothScrollRestoreRef.current);
                smoothScrollRestoreRef.current = null;
            }
        };
    }, [isDocumentVisible, visibilityResumeToken]);

    useLayoutEffect(() => {
        if (replayEnabled) return;
        if (!autoScrollEnabledRef.current) return;
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [
        currentTurn,
        dialogueHistoryLength,
        replayEnabled,
        scrollRef,
        teamDialogueHistoryLength,
        juryDialogueHistoryLength,
    ]);

    useEffect(() => {
        const topElement = topOverlayRef.current;
        const bottomElement = bottomOverlayRef.current;
        const container = scrollRef.current;

        const updateMetrics = () => {
            setTopOverlayHeight(topElement?.offsetHeight ?? 0);
            setBottomOverlayHeight(bottomElement?.offsetHeight ?? 0);
            setViewportHeight(container?.clientHeight ?? 0);
            setScrollTop(container?.scrollTop ?? 0);
        };

        updateMetrics();
        window.addEventListener('resize', updateMetrics);

        if (typeof ResizeObserver === 'undefined') {
            return () => window.removeEventListener('resize', updateMetrics);
        }

        const observer = new ResizeObserver(() => updateMetrics());
        if (topElement) observer.observe(topElement);
        if (bottomElement) observer.observe(bottomElement);
        if (container) observer.observe(container);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateMetrics);
        };
    }, [currentSessionId, scrollRef, topOverlayRef, bottomOverlayRef]);

    useLayoutEffect(() => {
        const container = scrollRef.current;
        const nextHeights = { top: topOverlayHeight, bottom: bottomOverlayHeight };

        if (!container) {
            overlayHeightsRef.current = nextHeights;
            return;
        }

        if (!overlayHeightsRef.current) {
            overlayHeightsRef.current = nextHeights;
            return;
        }

        const topDelta = nextHeights.top - overlayHeightsRef.current.top;
        if (topDelta !== 0) {
            container.scrollTop = Math.max(0, container.scrollTop + topDelta);
        }

        overlayHeightsRef.current = nextHeights;
        setViewportHeight(container.clientHeight);
        setScrollTop(container.scrollTop);
    }, [bottomOverlayHeight, scrollRef, topOverlayHeight]);

    const handleScroll = useCallback(() => {
        const container = scrollRef.current;
        if (!container || replayEnabled) return;

        setScrollTop(container.scrollTop);
        setViewportHeight(container.clientHeight);
        autoScrollEnabledRef.current = isElementNearBottom(container);
    }, [replayEnabled, scrollRef]);

    return {
        topOverlayHeight,
        bottomOverlayHeight,
        viewportHeight,
        scrollTop,
        smoothScrollSuppressed,
        handleScroll,
    };
}
