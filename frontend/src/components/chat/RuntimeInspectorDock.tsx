import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, GitBranch, History, X } from 'lucide-react';
import { useRuntimeViewState } from '../../hooks/useDebateViewState';
import { getLiveGraphNodeLabel } from '../../utils/viz/liveGraph';
import ExecutionTimeline from './ExecutionTimeline';
import LiveGraph from './LiveGraph';
import MemoryPanel from './MemoryPanel';
import {
    DEFAULT_RUNTIME_INSPECTOR_PANEL_SIZES,
    RUNTIME_INSPECTOR_PANEL_MIN_SIZE,
    RUNTIME_INSPECTOR_PANEL_RESET_EVENT,
    type RuntimeInspectorPanelId,
    type RuntimeInspectorPanelSize,
    writeStoredRuntimeInspectorPanelSize,
    readStoredRuntimeInspectorPanelSizes,
} from '../../utils/inspector/runtimeInspectorDock';
import {
    HEADER_TOOLBAR_BUTTON_ACTIVE_STYLE,
    HEADER_TOOLBAR_BUTTON_STYLE,
    HEADER_TOOLBAR_PANEL_STYLE,
    HEADER_TOOLBAR_SECONDARY_BUTTON_STYLE,
} from './toolbarStyles';

type RuntimeInspectorDockProps = {
    currentSessionId: string | null;
};

type RuntimeInspectorPanelPlacement = {
    top: number;
    left: number;
    width: number;
    height: number;
    anchorOffset: number;
    availableWidth: number;
    availableHeight: number;
};

const PANEL_LABELS: Record<RuntimeInspectorPanelId, string> = {
    timeline: '执行时间线',
    graph: '流程图',
    memory: '记忆',
};

const PANEL_DESCRIPTIONS: Record<RuntimeInspectorPanelId, string> = {
    timeline: '查看事件顺序、状态变化和回放详情。',
    graph: '查看当前节点、路径切换和流程流向。',
    memory: '查看记忆写入、图谱关系和时间推进。',
};

const PANEL_ICONS = {
    timeline: History,
    graph: GitBranch,
    memory: Activity,
} satisfies Record<RuntimeInspectorPanelId, typeof History>;

function buildInitialPanelSizes(): Record<RuntimeInspectorPanelId, RuntimeInspectorPanelSize> {
    const stored = readStoredRuntimeInspectorPanelSizes();
    return {
        timeline: stored.timeline ?? DEFAULT_RUNTIME_INSPECTOR_PANEL_SIZES.timeline,
        graph: stored.graph ?? DEFAULT_RUNTIME_INSPECTOR_PANEL_SIZES.graph,
        memory: stored.memory ?? DEFAULT_RUNTIME_INSPECTOR_PANEL_SIZES.memory,
    };
}

function readObservedPanelSize(
    entry: ResizeObserverEntry,
    panelElement: HTMLDivElement,
): RuntimeInspectorPanelSize {
    const borderBoxSize = Array.isArray(entry.borderBoxSize)
        ? entry.borderBoxSize[0]
        : entry.borderBoxSize;

    if (
        borderBoxSize
        && typeof borderBoxSize.inlineSize === 'number'
        && typeof borderBoxSize.blockSize === 'number'
    ) {
        return {
            width: Math.round(borderBoxSize.inlineSize),
            height: Math.round(borderBoxSize.blockSize),
        };
    }

    const rect = panelElement.getBoundingClientRect();
    return {
        width: Math.round(rect.width || panelElement.offsetWidth),
        height: Math.round(rect.height || panelElement.offsetHeight),
    };
}

export default function RuntimeInspectorDock({
    currentSessionId,
}: RuntimeInspectorDockProps) {
    const {
        runtimeEventCount,
        visibleRuntimeEvents,
        currentNode,
        debateMode,
        replayEnabled,
        isDocumentVisible,
    } = useRuntimeViewState();
    const [isOpen, setIsOpen] = useState(false);
    const [activePanel, setActivePanel] = useState<RuntimeInspectorPanelId>('timeline');
    const [panelSizes, setPanelSizes] = useState<Record<RuntimeInspectorPanelId, RuntimeInspectorPanelSize>>(buildInitialPanelSizes);
    const [panelPlacement, setPanelPlacement] = useState<RuntimeInspectorPanelPlacement | null>(null);
    const panelSurfaceRef = useRef<HTMLDivElement | null>(null);
    const triggerRefs = useRef<Record<RuntimeInspectorPanelId, HTMLDivElement | null>>({
        timeline: null,
        graph: null,
        memory: null,
    });
    const panelViewportBoundsRef = useRef<Pick<RuntimeInspectorPanelPlacement, 'availableWidth' | 'availableHeight'> | null>(null);

    const memoryWriteCount = useMemo(
        () => visibleRuntimeEvents.reduce((count, event) => count + (event.type === 'memory_write' ? 1 : 0), 0),
        [visibleRuntimeEvents],
    );

    const commitPanelSize = useCallback((
        panel: RuntimeInspectorPanelId,
        nextSize: RuntimeInspectorPanelSize,
    ) => {
        setPanelSizes((previous) => {
            const currentSize = previous[panel];
            const viewportBounds = panelViewportBoundsRef.current;
            const persistedSize = {
                width: viewportBounds
                    && currentSize.width > viewportBounds.availableWidth
                    && nextSize.width >= viewportBounds.availableWidth - 1
                    ? currentSize.width
                    : nextSize.width,
                height: viewportBounds
                    && currentSize.height > viewportBounds.availableHeight
                    && nextSize.height >= viewportBounds.availableHeight - 1
                    ? currentSize.height
                    : nextSize.height,
            };

            if (
                currentSize.width === persistedSize.width
                && currentSize.height === persistedSize.height
            ) {
                return previous;
            }

            writeStoredRuntimeInspectorPanelSize(panel, persistedSize);
            return {
                ...previous,
                [panel]: persistedSize,
            };
        });
    }, []);

    const persistCurrentPanelSize = useCallback((panel: RuntimeInspectorPanelId) => {
        const panelElement = panelSurfaceRef.current;
        if (!panelElement) {
            return;
        }

        const rect = panelElement.getBoundingClientRect();
        commitPanelSize(panel, {
            width: Math.round(rect.width || panelElement.offsetWidth),
            height: Math.round(rect.height || panelElement.offsetHeight),
        });
    }, [commitPanelSize]);

    const closePanel = useCallback(() => {
        persistCurrentPanelSize(activePanel);
        setPanelPlacement(null);
        setIsOpen(false);
    }, [activePanel, persistCurrentPanelSize]);

    const handlePanelToggle = useCallback((panel: RuntimeInspectorPanelId) => {
        if (!isOpen) {
            setActivePanel(panel);
            setPanelPlacement(null);
            setIsOpen(true);
            return;
        }

        persistCurrentPanelSize(activePanel);

        if (activePanel === panel) {
            setPanelPlacement(null);
            setIsOpen(false);
            return;
        }

        setActivePanel(panel);
        setPanelPlacement(null);
    }, [activePanel, isOpen, persistCurrentPanelSize]);

    useEffect(() => {
        setActivePanel('timeline');
        setIsOpen(false);
        setPanelPlacement(null);
    }, [currentSessionId]);

    useEffect(() => {
        const handleReset = () => {
            setPanelSizes(buildInitialPanelSizes());
            setActivePanel('timeline');
            setIsOpen(false);
            setPanelPlacement(null);
        };

        window.addEventListener(RUNTIME_INSPECTOR_PANEL_RESET_EVENT, handleReset);
        return () => window.removeEventListener(RUNTIME_INSPECTOR_PANEL_RESET_EVENT, handleReset);
    }, []);

    useEffect(() => {
        if (!isOpen || typeof ResizeObserver === 'undefined') {
            return;
        }

        const panelElement = panelSurfaceRef.current;
        if (!panelElement) {
            return;
        }

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) {
                return;
            }

            commitPanelSize(activePanel, readObservedPanelSize(entry, panelElement));
        });

        observer.observe(panelElement);
        return () => observer.disconnect();
    }, [activePanel, commitPanelSize, isOpen]);

    const panelSummaries = useMemo<Record<RuntimeInspectorPanelId, string>>(() => ({
        timeline: replayEnabled ? `回放中 · ${runtimeEventCount} 条事件` : `${runtimeEventCount} 条事件`,
        graph: (() => {
            const currentLabel = getLiveGraphNodeLabel(currentNode, debateMode);
            return currentLabel ? `当前节点：${currentLabel}` : '查看运行流程';
        })(),
        memory: replayEnabled ? `${memoryWriteCount} 条记忆写入 · 回放` : `${memoryWriteCount} 条记忆写入`,
    }), [currentNode, debateMode, memoryWriteCount, replayEnabled, runtimeEventCount]);

    const activePanelSize = panelSizes[activePanel];

    useLayoutEffect(() => {
        if (!isOpen || !activePanelSize || typeof window === 'undefined') {
            setPanelPlacement(null);
            panelViewportBoundsRef.current = null;
            return;
        }

        const updatePlacement = () => {
            const triggerElement = triggerRefs.current[activePanel];
            if (!triggerElement) {
                setPanelPlacement(null);
                panelViewportBoundsRef.current = null;
                return;
            }

            const viewportPadding = 16;
            const triggerGap = 12;
            const rect = triggerElement.getBoundingClientRect();
            const availableWidth = Math.max(
                RUNTIME_INSPECTOR_PANEL_MIN_SIZE.width,
                window.innerWidth - viewportPadding * 2,
            );
            const availableHeight = Math.max(
                220,
                window.innerHeight - rect.bottom - triggerGap - viewportPadding,
            );
            const width = Math.min(activePanelSize.width, availableWidth);
            const height = Math.min(activePanelSize.height, availableHeight);
            const anchorCenter = rect.left + rect.width / 2;
            const unclampedLeft = anchorCenter - width / 2;
            const maxLeft = Math.max(viewportPadding, window.innerWidth - viewportPadding - width);
            const left = Math.min(Math.max(viewportPadding, unclampedLeft), maxLeft);
            const anchorOffset = Math.min(
                Math.max(anchorCenter - left, 32),
                Math.max(32, width - 32),
            );

            panelViewportBoundsRef.current = { availableWidth, availableHeight };
            setPanelPlacement({
                top: rect.bottom + triggerGap,
                left,
                width,
                height,
                anchorOffset,
                availableWidth,
                availableHeight,
            });
        };

        updatePlacement();
        window.addEventListener('resize', updatePlacement);

        if (typeof ResizeObserver === 'undefined') {
            return () => window.removeEventListener('resize', updatePlacement);
        }

        const observedTriggers = Object.values(triggerRefs.current).filter((node): node is HTMLDivElement => Boolean(node));
        const observer = new ResizeObserver(() => updatePlacement());
        observedTriggers.forEach((node) => observer.observe(node));

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updatePlacement);
        };
    }, [activePanel, activePanelSize, isOpen]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const handlePointerUp = () => {
            persistCurrentPanelSize(activePanel);
        };

        window.addEventListener('mouseup', handlePointerUp);
        window.addEventListener('touchend', handlePointerUp);

        return () => {
            window.removeEventListener('mouseup', handlePointerUp);
            window.removeEventListener('touchend', handlePointerUp);
        };
    }, [activePanel, isOpen, persistCurrentPanelSize]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (panelSurfaceRef.current?.contains(target)) {
                return;
            }

            if (Object.values(triggerRefs.current).some((trigger) => trigger?.contains(target))) {
                return;
            }

            setIsOpen(false);
        };

        document.addEventListener('mousedown', handlePointerDown);

        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    return (
        <>
            <div
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    flexWrap: 'wrap',
                    minWidth: 0,
                }}
            >
                {(['timeline', 'graph', 'memory'] as RuntimeInspectorPanelId[]).map((panel) => {
                    const active = isOpen && activePanel === panel;
                    const Icon = PANEL_ICONS[panel];

                    return (
                        <div
                            key={panel}
                            ref={(node) => {
                                triggerRefs.current[panel] = node;
                            }}
                            style={{
                                display: 'inline-flex',
                                position: 'relative',
                            }}
                        >
                            <motion.button
                                type="button"
                                whileHover={{ opacity: 0.92 }}
                                whileTap={{ opacity: 0.82 }}
                                onClick={() => handlePanelToggle(panel)}
                                title={PANEL_LABELS[panel]}
                                style={{
                                    ...HEADER_TOOLBAR_BUTTON_STYLE,
                                    ...(active ? HEADER_TOOLBAR_BUTTON_ACTIVE_STYLE : null),
                                }}
                            >
                                <Icon size={14} />
                                {PANEL_LABELS[panel]}
                            </motion.button>
                        </div>
                    );
                })}
            </div>

            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence initial={false}>
                    {isOpen && panelPlacement && (
                        <motion.div
                            key="runtime-inspector-panel"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.16 }}
                            style={{
                                position: 'fixed',
                                top: `${panelPlacement.top}px`,
                                left: `${panelPlacement.left}px`,
                                width: `${panelPlacement.width}px`,
                                height: `${panelPlacement.height}px`,
                                minWidth: `${Math.min(RUNTIME_INSPECTOR_PANEL_MIN_SIZE.width, panelPlacement.availableWidth)}px`,
                                minHeight: `${Math.min(RUNTIME_INSPECTOR_PANEL_MIN_SIZE.height, panelPlacement.availableHeight)}px`,
                                resize: 'both',
                                overflow: 'hidden',
                                boxSizing: 'border-box',
                                ...HEADER_TOOLBAR_PANEL_STYLE,
                                display: 'flex',
                                flexDirection: 'column',
                                transformOrigin: `${panelPlacement.anchorOffset}px top`,
                                zIndex: 1200,
                                pointerEvents: 'auto',
                            }}
                            ref={panelSurfaceRef}
                            data-testid={`runtime-inspector-panel-${activePanel}`}
                        >
                            <div
                                style={{
                                    padding: '12px 14px',
                                    borderBottom: '1px solid var(--border-subtle)',
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    justifyContent: 'space-between',
                                    gap: '12px',
                                    background: 'var(--bg-card)',
                                }}
                            >
                                <div style={{ minWidth: 0 }}>
                                    <div
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            fontSize: '13px',
                                            fontWeight: 700,
                                            color: 'var(--text-primary)',
                                        }}
                                    >
                                        {(() => {
                                            const Icon = PANEL_ICONS[activePanel];
                                            return <Icon size={15} />;
                                        })()}
                                        {PANEL_LABELS[activePanel]}
                                    </div>
                                    <div
                                        style={{
                                            marginTop: '4px',
                                            fontSize: '11px',
                                            color: 'var(--text-muted)',
                                            lineHeight: 1.5,
                                        }}
                                    >
                                        {PANEL_DESCRIPTIONS[activePanel]}
                                    </div>
                                    <div
                                        style={{
                                            marginTop: '6px',
                                            fontSize: '11px',
                                            color: 'var(--text-secondary)',
                                            fontWeight: 600,
                                        }}
                                    >
                                        {panelSummaries[activePanel]}
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={closePanel}
                                    style={{
                                        ...HEADER_TOOLBAR_SECONDARY_BUTTON_STYLE,
                                        width: '30px',
                                        height: '30px',
                                        padding: 0,
                                        flexShrink: 0,
                                    }}
                                    aria-label="关闭运行观察器面板"
                                >
                                    <X size={14} />
                                </button>
                            </div>

                            <div
                                style={{
                                    padding: '10px 12px 0',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    flexWrap: 'wrap',
                                }}
                                role="tablist"
                                aria-label="运行观察器标签"
                            >
                                {(['timeline', 'graph', 'memory'] as RuntimeInspectorPanelId[]).map((panel) => {
                                    const selected = activePanel === panel;
                                    const Icon = PANEL_ICONS[panel];

                                    return (
                                        <button
                                            key={panel}
                                            type="button"
                                            onClick={() => setActivePanel(panel)}
                                            role="tab"
                                            aria-selected={selected}
                                            aria-label={`${PANEL_LABELS[panel]}标签`}
                                            style={{
                                                ...HEADER_TOOLBAR_BUTTON_STYLE,
                                                ...(selected ? HEADER_TOOLBAR_BUTTON_ACTIVE_STYLE : null),
                                            }}
                                        >
                                            <Icon size={13} />
                                            {PANEL_LABELS[panel]}
                                        </button>
                                    );
                                })}
                            </div>

                            <div
                                style={{
                                    padding: '8px 12px 0',
                                    fontSize: '11px',
                                    color: 'var(--text-muted)',
                                }}
                            >
                                右下角可直接拖拽调整尺寸，下一次展开会保持当前大小。
                            </div>

                            <div
                                style={{
                                    flex: 1,
                                    minHeight: 0,
                                    padding: '10px 12px 12px',
                                    overflow: 'auto',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    background: 'var(--bg-secondary)',
                                }}
                            >
                                {!isDocumentVisible && (
                                    <div
                                        style={{
                                            fontSize: '12px',
                                            color: 'var(--text-muted)',
                                            padding: '8px',
                                        }}
                                    >
                                        页面恢复可见后会继续同步运行观察器内容。
                                    </div>
                                )}

                                {isDocumentVisible && activePanel === 'timeline' && (
                                    <div style={{ flex: 1, minHeight: 0 }}>
                                        <ExecutionTimeline embedded fillHeight />
                                    </div>
                                )}
                                {isDocumentVisible && activePanel === 'graph' && <LiveGraph embedded />}
                                {isDocumentVisible && activePanel === 'memory' && <MemoryPanel embedded />}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body,
            )}
        </>
    );
}
