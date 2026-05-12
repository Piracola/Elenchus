import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
    clampFloatingInspectorRect,
    createCollapsedFloatingInspectorRect,
    createTopDockedFloatingInspectorRect,
    getCollapsedFloatingInspectorSize,
    interactionCursor,
    parseStoredFloatingInspectorRect,
    resizeFloatingInspectorRect,
    type FloatingInspectorBounds,
    type FloatingInspectorInteraction,
    type FloatingInspectorLayoutMode,
    type FloatingInspectorRect,
    type FloatingInspectorResizeHandle,
    type FloatingInspectorViewportOffset,
} from '../../utils/inspector/floatingInspectorLayout';
import {
    FLOATING_INSPECTOR_RESET_EVENT,
    FLOATING_INSPECTOR_STORAGE_KEY,
} from '../../utils/inspector/floatingInspector';

type UseFloatingInspectorStateArgs = {
    panelRef: RefObject<HTMLDivElement | null>;
    messageWidth: string;
    topOverlayHeight: number;
};

type ExpandedFloatingInspectorSnapshot = {
    mode: Extract<FloatingInspectorLayoutMode, 'top-docked' | 'floating'>;
    rect: FloatingInspectorRect | null;
};

type CollapsedFloatingInspectorSnapshot = Pick<FloatingInspectorRect, 'x' | 'y'> | null;

export function useFloatingInspectorState({
    panelRef,
    messageWidth,
    topOverlayHeight,
}: UseFloatingInspectorStateArgs) {
    const floatingInspectorInteractionRef = useRef<FloatingInspectorInteraction | null>(null);
    const floatingInspectorRectRef = useRef<FloatingInspectorRect | null>(null);
    const collapsedFloatingInspectorSnapshotRef = useRef<CollapsedFloatingInspectorSnapshot>(null);
    const expandedFloatingInspectorSnapshotRef = useRef<ExpandedFloatingInspectorSnapshot>({
        mode: 'top-docked',
        rect: null,
    });
    const [floatingInspectorBounds, setFloatingInspectorBounds] = useState<FloatingInspectorBounds>({
        width: 0,
        height: 0,
    });
    const [floatingInspectorViewportOffset, setFloatingInspectorViewportOffset] = useState<FloatingInspectorViewportOffset>({
        left: 0,
        top: 0,
    });
    const [floatingInspectorRect, setFloatingInspectorRect] = useState<FloatingInspectorRect | null>(null);
    const [floatingInspectorActive, setFloatingInspectorActive] = useState(false);
    const [floatingInspectorLayoutMode, setFloatingInspectorLayoutMode] = useState<FloatingInspectorLayoutMode>('collapsed');
    const [isWideLayout, setIsWideLayout] = useState(() => {
        if (typeof window === 'undefined') return true;
        return window.innerWidth >= 1280;
    });
    const floatingInspectorWidth = floatingInspectorBounds.width;
    const floatingInspectorHeight = floatingInspectorBounds.height;
    const floatingInspectorDockTop = Math.max(topOverlayHeight + 8, 16);
    const floatingInspectorExpanded = floatingInspectorLayoutMode !== 'collapsed';
    const floatingInspectorTopDocked = floatingInspectorLayoutMode === 'top-docked';

    const rectChanged = useCallback((left: FloatingInspectorRect, right: FloatingInspectorRect) => (
        left.x !== right.x
        || left.y !== right.y
        || left.width !== right.width
        || left.height !== right.height
    ), []);

    const createCollapsedRectFromSnapshot = useCallback((
        bounds: FloatingInspectorBounds,
        preferredTop: number,
        source: CollapsedFloatingInspectorSnapshot,
    ) => {
        const collapsedSize = getCollapsedFloatingInspectorSize();
        const defaultRect = createCollapsedFloatingInspectorRect(bounds, preferredTop);
        if (!source) {
            return defaultRect;
        }

        return clampFloatingInspectorRect(
            {
                ...defaultRect,
                x: source.x,
                y: source.y,
                width: collapsedSize.width,
                height: collapsedSize.height,
            },
            bounds,
            collapsedSize,
        );
    }, []);

    const stopFloatingInspectorInteraction = useCallback(() => {
        floatingInspectorInteractionRef.current = null;
        setFloatingInspectorActive(false);
        if (typeof document !== 'undefined') {
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        }
    }, []);

    const clearFloatingInspectorInteraction = useCallback(() => {
        floatingInspectorInteractionRef.current = null;
        setFloatingInspectorActive(false);
        if (typeof document !== 'undefined') {
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        }
    }, []);

    const rememberExpandedFloatingInspectorState = useCallback(() => {
        if (!floatingInspectorExpanded) {
            return;
        }

        const currentRect = floatingInspectorRectRef.current;
        expandedFloatingInspectorSnapshotRef.current = {
            mode: floatingInspectorTopDocked ? 'top-docked' : 'floating',
            rect: currentRect,
        };
    }, [floatingInspectorExpanded, floatingInspectorTopDocked]);

    const resetExpandedFloatingInspectorState = useCallback(() => {
        expandedFloatingInspectorSnapshotRef.current = {
            mode: 'top-docked',
            rect: null,
        };
    }, []);

    const rememberCollapsedFloatingInspectorState = useCallback((rect: FloatingInspectorRect | null) => {
        if (!rect) {
            return;
        }

        collapsedFloatingInspectorSnapshotRef.current = {
            x: rect.x,
            y: rect.y,
        };
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
        if (!floatingInspectorExpanded && floatingInspectorRect) {
            rememberCollapsedFloatingInspectorState(floatingInspectorRect);
        }
        if (floatingInspectorExpanded) {
            expandedFloatingInspectorSnapshotRef.current = {
                mode: floatingInspectorTopDocked ? 'top-docked' : 'floating',
                rect: floatingInspectorRect,
            };
        }
    }, [
        floatingInspectorExpanded,
        floatingInspectorRect,
        floatingInspectorTopDocked,
        rememberCollapsedFloatingInspectorState,
    ]);

    useEffect(() => {
        if (typeof window === 'undefined' || !floatingInspectorRect || floatingInspectorExpanded) {
            return;
        }

        window.localStorage.setItem(
            FLOATING_INSPECTOR_STORAGE_KEY,
            JSON.stringify(floatingInspectorRect),
        );
    }, [floatingInspectorRect, floatingInspectorExpanded]);

    useEffect(() => {
        const panelElement = panelRef.current;
        if (!panelElement) return;

        const updateBounds = () => {
            const rect = panelElement.getBoundingClientRect();
            setFloatingInspectorBounds({
                width: panelElement.clientWidth,
                height: Math.max(0, window.innerHeight - rect.top),
            });
            setFloatingInspectorViewportOffset({
                left: rect.left,
                top: rect.top,
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
            rememberExpandedFloatingInspectorState();
            queueMicrotask(() => {
                setFloatingInspectorLayoutMode('collapsed');
                setFloatingInspectorRect(null);
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
            if (floatingInspectorExpanded) {
                setFloatingInspectorRect((prev) => {
                    if (floatingInspectorLayoutMode === 'top-docked' || !prev) {
                        return clampFloatingInspectorRect(
                            createTopDockedFloatingInspectorRect(bounds, floatingInspectorDockTop),
                            bounds,
                        );
                    }

                    return clampFloatingInspectorRect(prev, bounds);
                });
                return;
            }

            setFloatingInspectorRect((prev) => {
                const storedRect = typeof window === 'undefined'
                    ? null
                    : parseStoredFloatingInspectorRect(window.localStorage.getItem(FLOATING_INSPECTOR_STORAGE_KEY));
                const sourceRect = prev ?? collapsedFloatingInspectorSnapshotRef.current ?? storedRect;
                return createCollapsedRectFromSnapshot(
                    bounds,
                    floatingInspectorDockTop,
                    sourceRect,
                );
            });
        });
    }, [
        floatingInspectorExpanded,
        floatingInspectorHeight,
        floatingInspectorWidth,
        floatingInspectorDockTop,
        floatingInspectorTopDocked,
        createCollapsedRectFromSnapshot,
        clearFloatingInspectorInteraction,
        floatingInspectorLayoutMode,
        isWideLayout,
        rememberExpandedFloatingInspectorState,
    ]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const handleReset = () => {
            resetExpandedFloatingInspectorState();
            if (!isWideLayout || floatingInspectorWidth <= 0 || floatingInspectorHeight <= 0) {
                setFloatingInspectorRect(null);
                setFloatingInspectorLayoutMode('collapsed');
                stopFloatingInspectorInteraction();
                return;
            }

            setFloatingInspectorRect(
                createCollapsedRectFromSnapshot(
                    {
                        width: floatingInspectorWidth,
                        height: floatingInspectorHeight,
                    },
                    floatingInspectorDockTop,
                    null,
                ),
            );
            setFloatingInspectorLayoutMode('collapsed');
            stopFloatingInspectorInteraction();
        };

        window.addEventListener(FLOATING_INSPECTOR_RESET_EVENT, handleReset);
        return () => window.removeEventListener(FLOATING_INSPECTOR_RESET_EVENT, handleReset);
    }, [
        floatingInspectorHeight,
        floatingInspectorWidth,
        floatingInspectorDockTop,
        createCollapsedRectFromSnapshot,
        isWideLayout,
        resetExpandedFloatingInspectorState,
        stopFloatingInspectorInteraction,
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
                    getCollapsedFloatingInspectorSize(),
                )
                : resizeFloatingInspectorRect(
                    interaction.startRect,
                    interaction.handle,
                    deltaX,
                    deltaY,
                    interaction.bounds,
                );

            if (interaction.startLayoutMode === 'top-docked' && rectChanged(interaction.startRect, nextRect)) {
                setFloatingInspectorLayoutMode('floating');
            }

            setFloatingInspectorRect((prev) => {
                if (prev && !rectChanged(prev, nextRect)) {
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
    }, [rectChanged, stopFloatingInspectorInteraction]);

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

        const collapsedSize = getCollapsedFloatingInspectorSize();
        const effectiveWidth = floatingInspectorExpanded ? currentRect.width : collapsedSize.width;
        const effectiveHeight = floatingInspectorExpanded ? currentRect.height : collapsedSize.height;
        const effectiveRect = {
            x: currentRect.x,
            y: currentRect.y,
            width: effectiveWidth,
            height: effectiveHeight,
        };

        startFloatingInspectorInteraction(event, {
            mode: 'move',
            startX: event.clientX,
            startY: event.clientY,
            startRect: effectiveRect,
            bounds: floatingInspectorBounds,
            startLayoutMode: floatingInspectorLayoutMode,
        });
    }, [
        floatingInspectorBounds,
        floatingInspectorExpanded,
        floatingInspectorLayoutMode,
        startFloatingInspectorInteraction,
    ]);

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
                    startLayoutMode: floatingInspectorLayoutMode,
                });
            },
        [floatingInspectorBounds, floatingInspectorLayoutMode, startFloatingInspectorInteraction],
    );

    return {
        isWideLayout,
        floatingInspectorRect,
        floatingInspectorViewportOffset,
        floatingInspectorExpanded,
        floatingInspectorActive,
        floatingInspectorInteractionRef,
        floatingInspectorTopDocked,
        floatingInspectorLayoutMode,
        handleFloatingInspectorMoveStart,
        handleFloatingInspectorResizeStart,
        handleFloatingInspectorExpandedChange: (expanded: boolean) => {
            if (expanded) {
                const snapshot = expandedFloatingInspectorSnapshotRef.current;
                const nextMode = snapshot.rect ? snapshot.mode : 'top-docked';
                setFloatingInspectorLayoutMode(nextMode);
                setFloatingInspectorRect((prev) => {
                    if (floatingInspectorBounds.width <= 0 || floatingInspectorBounds.height <= 0) return prev;
                    const savedExpandedRect = snapshot.rect;
                    if (savedExpandedRect && nextMode === 'floating') {
                        return clampFloatingInspectorRect(savedExpandedRect, floatingInspectorBounds);
                    }
                    return createTopDockedFloatingInspectorRect(
                        floatingInspectorBounds,
                        floatingInspectorDockTop,
                    );
                });
            } else {
                rememberExpandedFloatingInspectorState();
                const collapsedSnapshot = collapsedFloatingInspectorSnapshotRef.current;
                setFloatingInspectorRect((prev) => {
                    if (floatingInspectorBounds.width <= 0 || floatingInspectorBounds.height <= 0) return prev;
                    return createCollapsedRectFromSnapshot(
                        floatingInspectorBounds,
                        floatingInspectorDockTop,
                        collapsedSnapshot,
                    );
                });
                setFloatingInspectorLayoutMode('collapsed');
            }
            stopFloatingInspectorInteraction();
        },
    };
}
