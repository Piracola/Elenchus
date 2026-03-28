import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
    clampFloatingInspectorRect,
    createDefaultFloatingInspectorRect,
    interactionCursor,
    parseStoredFloatingInspectorRect,
    resizeFloatingInspectorRect,
    type FloatingInspectorBounds,
    type FloatingInspectorInteraction,
    type FloatingInspectorRect,
    type FloatingInspectorResizeHandle,
} from '../../utils/floatingInspectorLayout';
import {
    FLOATING_INSPECTOR_RESET_EVENT,
    FLOATING_INSPECTOR_STORAGE_KEY,
} from '../../utils/floatingInspector';

type UseFloatingInspectorStateArgs = {
    panelRef: RefObject<HTMLDivElement | null>;
    messageWidth: string;
    topOverlayHeight: number;
};

export function useFloatingInspectorState({
    panelRef,
    messageWidth,
    topOverlayHeight,
}: UseFloatingInspectorStateArgs) {
    const floatingInspectorInteractionRef = useRef<FloatingInspectorInteraction | null>(null);
    const floatingInspectorRectRef = useRef<FloatingInspectorRect | null>(null);
    const [floatingInspectorBounds, setFloatingInspectorBounds] = useState<FloatingInspectorBounds>({
        width: 0,
        height: 0,
    });
    const [floatingInspectorRect, setFloatingInspectorRect] = useState<FloatingInspectorRect | null>(null);
    const [floatingInspectorActive, setFloatingInspectorActive] = useState(false);
    const [floatingInspectorExpanded, setFloatingInspectorExpanded] = useState(false);
    const [isWideLayout, setIsWideLayout] = useState(() => {
        if (typeof window === 'undefined') return true;
        return window.innerWidth >= 1280;
    });
    const floatingInspectorWidth = floatingInspectorBounds.width;
    const floatingInspectorHeight = floatingInspectorBounds.height;

    const stopFloatingInspectorInteraction = useCallback(() => {
        if (!floatingInspectorInteractionRef.current) return;

        floatingInspectorInteractionRef.current = null;
        setFloatingInspectorActive(false);
        if (typeof document !== 'undefined') {
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        }
    }, []);

    const clearFloatingInspectorInteraction = useCallback(() => {
        floatingInspectorInteractionRef.current = null;
        if (typeof document !== 'undefined') {
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const updateLayout = () => {
            setIsWideLayout(window.innerWidth >= 1280);
        };

        updateLayout();
        window.addEventListener('resize', updateLayout);
        return () => window.removeEventListener('resize', updateLayout);
    }, []);

    useEffect(() => {
        floatingInspectorRectRef.current = floatingInspectorRect;
    }, [floatingInspectorRect]);

    useEffect(() => {
        if (typeof window === 'undefined' || !floatingInspectorRect) {
            return;
        }

        window.localStorage.setItem(
            FLOATING_INSPECTOR_STORAGE_KEY,
            JSON.stringify(floatingInspectorRect),
        );
    }, [floatingInspectorRect]);

    useEffect(() => {
        const panelElement = panelRef.current;
        if (!panelElement) return;

        const updateBounds = () => {
            setFloatingInspectorBounds({
                width: panelElement.clientWidth,
                height: panelElement.clientHeight,
            });
        };

        updateBounds();
        window.addEventListener('resize', updateBounds);

        if (typeof ResizeObserver === 'undefined') {
            return () => window.removeEventListener('resize', updateBounds);
        }

        const observer = new ResizeObserver(() => updateBounds());
        observer.observe(panelElement);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateBounds);
        };
    }, [messageWidth, isWideLayout, panelRef]);

    useEffect(() => {
        if (!isWideLayout) {
            queueMicrotask(() => {
                setFloatingInspectorExpanded(false);
                setFloatingInspectorActive(false);
            });
            clearFloatingInspectorInteraction();
            return;
        }
        if (floatingInspectorWidth <= 0 || floatingInspectorHeight <= 0) return;

        const bounds = {
            width: floatingInspectorWidth,
            height: floatingInspectorHeight,
        };

        queueMicrotask(() => {
            setFloatingInspectorRect((prev) => (
                prev
                    ? clampFloatingInspectorRect(prev, bounds)
                    : clampFloatingInspectorRect(
                        parseStoredFloatingInspectorRect(
                            typeof window === 'undefined'
                                ? null
                                : window.localStorage.getItem(FLOATING_INSPECTOR_STORAGE_KEY),
                        ) ?? createDefaultFloatingInspectorRect(bounds, topOverlayHeight + 12),
                        bounds,
                    )
            ));
        });
    }, [
        floatingInspectorHeight,
        floatingInspectorWidth,
        clearFloatingInspectorInteraction,
        isWideLayout,
        topOverlayHeight,
    ]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const handleReset = () => {
            if (!isWideLayout || floatingInspectorWidth <= 0 || floatingInspectorHeight <= 0) {
                setFloatingInspectorRect(null);
                setFloatingInspectorExpanded(false);
                stopFloatingInspectorInteraction();
                return;
            }

            setFloatingInspectorRect(
                createDefaultFloatingInspectorRect(
                    {
                        width: floatingInspectorWidth,
                        height: floatingInspectorHeight,
                    },
                    topOverlayHeight + 12,
                ),
            );
            setFloatingInspectorExpanded(false);
            stopFloatingInspectorInteraction();
        };

        window.addEventListener(FLOATING_INSPECTOR_RESET_EVENT, handleReset);
        return () => window.removeEventListener(FLOATING_INSPECTOR_RESET_EVENT, handleReset);
    }, [
        floatingInspectorHeight,
        floatingInspectorWidth,
        isWideLayout,
        stopFloatingInspectorInteraction,
        topOverlayHeight,
    ]);

    useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
            const interaction = floatingInspectorInteractionRef.current;
            if (!interaction) return;

            event.preventDefault();
            const deltaX = event.clientX - interaction.startX;
            const deltaY = event.clientY - interaction.startY;
            const nextRect = interaction.mode === 'move'
                ? clampFloatingInspectorRect(
                    {
                        ...interaction.startRect,
                        x: interaction.startRect.x + deltaX,
                        y: interaction.startRect.y + deltaY,
                    },
                    interaction.bounds,
                )
                : resizeFloatingInspectorRect(
                    interaction.startRect,
                    interaction.handle,
                    deltaX,
                    deltaY,
                    interaction.bounds,
                );

            setFloatingInspectorRect((prev) => {
                if (
                    prev
                    && prev.x === nextRect.x
                    && prev.y === nextRect.y
                    && prev.width === nextRect.width
                    && prev.height === nextRect.height
                ) {
                    return prev;
                }
                return nextRect;
            });
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', stopFloatingInspectorInteraction);
        window.addEventListener('pointercancel', stopFloatingInspectorInteraction);
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', stopFloatingInspectorInteraction);
            window.removeEventListener('pointercancel', stopFloatingInspectorInteraction);
            stopFloatingInspectorInteraction();
        };
    }, [stopFloatingInspectorInteraction]);

    const startFloatingInspectorInteraction = useCallback((
        event: ReactPointerEvent<HTMLElement>,
        interaction: FloatingInspectorInteraction,
    ) => {
        event.preventDefault();
        event.stopPropagation();
        floatingInspectorInteractionRef.current = interaction;
        setFloatingInspectorActive(true);

        if (typeof document !== 'undefined') {
            document.body.style.userSelect = 'none';
            document.body.style.cursor = interactionCursor(interaction);
        }
    }, []);

    const handleFloatingInspectorMoveStart = useCallback((event: ReactPointerEvent<HTMLElement>) => {
        const currentRect = floatingInspectorRectRef.current;
        if (!currentRect) return;

        startFloatingInspectorInteraction(event, {
            mode: 'move',
            startX: event.clientX,
            startY: event.clientY,
            startRect: currentRect,
            bounds: floatingInspectorBounds,
        });
    }, [floatingInspectorBounds, startFloatingInspectorInteraction]);

    const handleFloatingInspectorResizeStart = useCallback(
        (handle: FloatingInspectorResizeHandle) =>
            (event: ReactPointerEvent<HTMLElement>) => {
                const currentRect = floatingInspectorRectRef.current;
                if (!currentRect) return;

                startFloatingInspectorInteraction(event, {
                    mode: 'resize',
                    handle,
                    startX: event.clientX,
                    startY: event.clientY,
                    startRect: currentRect,
                    bounds: floatingInspectorBounds,
                });
            },
        [floatingInspectorBounds, startFloatingInspectorInteraction],
    );

    return {
        isWideLayout,
        floatingInspectorRect,
        floatingInspectorExpanded,
        floatingInspectorActive,
        floatingInspectorInteractionRef,
        handleFloatingInspectorMoveStart,
        handleFloatingInspectorResizeStart,
        handleFloatingInspectorExpandedChange: (expanded: boolean) => {
            setFloatingInspectorExpanded(expanded);
            if (!expanded) {
                setFloatingInspectorActive(false);
            }
        },
    };
}
