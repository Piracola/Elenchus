import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
    clampFloatingInspectorRect,
    createDefaultFloatingInspectorRect,
    getCollapsedFloatingInspectorSize,
    interactionCursor,
    parseStoredFloatingInspectorRect,
    resizeFloatingInspectorRect,
    type FloatingInspectorBounds,
    type FloatingInspectorInteraction,
    type FloatingInspectorRect,
    type FloatingInspectorResizeHandle,
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
    // 保存展开状态下的尺寸，用于展开时恢复
    const expandedRectRef = useRef<FloatingInspectorRect | null>(null);
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
        // 如果是展开状态，保存展开时的尺寸
        if (floatingInspectorExpanded && floatingInspectorRect) {
            expandedRectRef.current = floatingInspectorRect;
        }
    }, [floatingInspectorRect, floatingInspectorExpanded]);

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
                        ) ?? createDefaultFloatingInspectorRect(bounds, topOverlayHeight),
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
                    topOverlayHeight,
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

        // 收起时使用最小尺寸作为拖动基准，避免位置计算错误
        const collapsedSize = getCollapsedFloatingInspectorSize();
        const effectiveWidth = floatingInspectorExpanded ? currentRect.width : collapsedSize.width;
        const effectiveHeight = floatingInspectorExpanded ? currentRect.height : collapsedSize.height;
        
        // 保持左上角位置，使用有效尺寸计算边界
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
        });
    }, [floatingInspectorBounds, floatingInspectorExpanded, startFloatingInspectorInteraction]);

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
            if (expanded) {
                // 展开时：恢复之前保存的展开尺寸，保持位置不变
                setFloatingInspectorRect((prev) => {
                    if (!prev) return prev;
                    const savedExpandedRect = expandedRectRef.current;
                    if (savedExpandedRect) {
                        // 恢复展开时的尺寸，但保持当前位置
                        return {
                            ...prev,
                            width: savedExpandedRect.width,
                            height: savedExpandedRect.height,
                        };
                    }
                    // 如果没有保存的展开尺寸，使用默认展开尺寸
                    const defaultExpandedSize = {
                        width: Math.min(560, floatingInspectorBounds.width - 32),
                        height: Math.min(600, floatingInspectorBounds.height - 32),
                    };
                    return {
                        ...prev,
                        width: defaultExpandedSize.width,
                        height: defaultExpandedSize.height,
                    };
                });
            } else {
                // 收起时：保持当前位置和收起尺寸
                setFloatingInspectorRect((prev) => {
                    if (!prev) return prev;
                    const collapsedSize = getCollapsedFloatingInspectorSize();
                    return {
                        ...prev,
                        width: collapsedSize.width,
                        height: collapsedSize.height,
                    };
                });
            }
            setFloatingInspectorExpanded(expanded);
            if (!expanded) {
                setFloatingInspectorActive(false);
            }
        },
    };
}
