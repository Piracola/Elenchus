/**
 * ChatPanel - main conversation view with floating top/bottom overlays.
 * The overlays are rendered above the scrollable message list so content can
 * move beneath the gaps between cards instead of being blocked by a container.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, FileJson, FileText, PanelLeftOpen } from 'lucide-react';
import { api } from '../api/client';
import { getCollapsedAgentMessagesForSession, useDebateStore } from '../stores/debateStore';
import { useForegroundDebateSelector } from '../hooks/useForegroundDebateSelector';
import { useSettingsStore, MESSAGE_WIDTH_VALUES } from '../stores/settingsStore';
import { DISPLAY_FONT_TOKENS } from '../config/display';
import MessageRow from './chat/MessageRow';
import DebateControls from './chat/DebateControls';
import RuntimeInspector from './chat/RuntimeInspector';
import StatusBanner from './chat/StatusBanner';
import RoundInsights from './chat/RoundInsights';
import {
    clampFloatingInspectorRect,
    createDefaultFloatingInspectorRect,
    FLOATING_INSPECTOR_RESIZE_HANDLES,
    interactionCursor,
    parseStoredFloatingInspectorRect,
    resizeFloatingInspectorRect,
} from '../utils/floatingInspectorLayout';
import {
    FLOATING_INSPECTOR_RESET_EVENT,
    FLOATING_INSPECTOR_STORAGE_KEY,
} from '../utils/floatingInspector';
import { isElementNearBottom } from '../utils/chatScroll';
import { resolveHistoryRowStart, revealFocusedHistoryRow } from '../utils/chatHistoryWindow';
import { toast } from '../utils/toast';
import {
    buildTranscriptViewModel,
    getTranscriptCollapseSummary,
    isTranscriptAgentMessageCollapsed,
} from '../utils/transcriptViewModel';
import type { DialogueGroupingState } from '../utils/groupDialogue';
import type { MarkdownExportCategory } from '../types';
import type {
    FloatingInspectorBounds,
    FloatingInspectorInteraction,
    FloatingInspectorRect,
    FloatingInspectorResizeHandle,
} from '../utils/floatingInspectorLayout';
import { computeVariableVirtualWindow } from '../utils/virtualWindow';

const INITIAL_HISTORY_ROW_WINDOW = 120;
const HISTORY_ROW_BATCH_SIZE = 80;
const HISTORY_ROW_PRELOAD_THRESHOLD = 240;
const CHAT_ROW_OVERSCAN = 5;
const DEFAULT_CHAT_ROW_HEIGHT = 320;

interface ChatPanelProps {
    isSidebarCollapsed: boolean;
    onExpandSidebar: () => void;
}

const MARKDOWN_EXPORT_OPTIONS: { value: MarkdownExportCategory; label: string }[] = [
    { value: 'group_discussion', label: '组内讨论' },
    { value: 'judge_messages', label: '裁判消息' },
    { value: 'jury_messages', label: '审判团消息' },
    { value: 'consensus_summary', label: '共识收敛消息' },
];

export default function ChatPanel({ isSidebarCollapsed, onExpandSidebar }: ChatPanelProps) {
    const currentSessionId = useDebateStore((state) => state.currentSession?.id ?? null);
    const currentTopic = useDebateStore((state) => state.currentSession?.topic ?? '');
    const debateMode = useDebateStore((state) => state.currentSession?.debate_mode ?? 'standard');
    const participants = useDebateStore((state) => state.currentSession?.participants);
    const currentTurn = useDebateStore((state) => state.currentSession?.current_turn ?? 0);
    const maxTurns = useDebateStore((state) => state.currentSession?.max_turns ?? 0);
    const modeArtifactsLength = useDebateStore((state) => state.currentSession?.mode_artifacts?.length ?? 0);
    const isDocumentVisible = useDebateStore((state) => state.isDocumentVisible);
    const visibilityResumeToken = useDebateStore((state) => state.visibilityResumeToken);
    const { displaySettings } = useSettingsStore();
    const dialogueHistory = useForegroundDebateSelector((state) => state.currentSession?.dialogue_history ?? []);
    const teamDialogueHistory = useForegroundDebateSelector((state) => state.currentSession?.team_dialogue_history ?? []);
    const juryDialogueHistory = useForegroundDebateSelector((state) => state.currentSession?.jury_dialogue_history ?? []);
    const visibleRuntimeEvents = useForegroundDebateSelector((state) => state.visibleRuntimeEvents);
    const replayEnabled = useForegroundDebateSelector((state) => state.replayEnabled);
    const focusedRuntimeEventId = useForegroundDebateSelector((state) => state.focusedRuntimeEventId);
    const collapsedAgentMessages = useDebateStore((state) => getCollapsedAgentMessagesForSession(state, currentSessionId));
    const toggleAgentMessageCollapsed = useDebateStore((state) => state.toggleAgentMessageCollapsed);
    const setAllAgentMessagesCollapsed = useDebateStore((state) => state.setAllAgentMessagesCollapsed);
    const hasCurrentSession = currentSessionId !== null;
    const isSophistryMode = debateMode === 'sophistry_experiment';
    const modeWarning =
        '诡辩实验模式会主动鼓励修辞操控、偷换定义和压力转移，也会积极抓对手的谬误。这里的输出不代表事实结论，搜索与评分都已关闭，请把它当成一场修辞实验。';

    const panelRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const topOverlayRef = useRef<HTMLDivElement>(null);
    const bottomOverlayRef = useRef<HTMLDivElement>(null);
    const overlayHeightsRef = useRef<{ top: number; bottom: number } | null>(null);
    const floatingInspectorInteractionRef = useRef<FloatingInspectorInteraction | null>(null);
    const floatingInspectorRectRef = useRef<FloatingInspectorRect | null>(null);
    const autoScrollEnabledRef = useRef(true);
    const pendingHistoryPrependScrollHeightRef = useRef<number | null>(null);
    const previousRowsLengthRef = useRef(0);
    const previousSessionIdRef = useRef<string | null | undefined>(undefined);
    const previousReplayEnabledRef = useRef<boolean | undefined>(undefined);
    const transcriptGroupingStateRef = useRef<DialogueGroupingState | null>(null);
    const measureObserversRef = useRef<Map<string, ResizeObserver>>(new Map());
    const measureCallbacksRef = useRef<Map<string, (node: HTMLDivElement | null) => void>>(new Map());
    const smoothScrollRestoreRef = useRef<number | null>(null);

    const [topOverlayHeight, setTopOverlayHeight] = useState(0);
    const [bottomOverlayHeight, setBottomOverlayHeight] = useState(0);
    const [floatingInspectorBounds, setFloatingInspectorBounds] = useState<FloatingInspectorBounds>({
        width: 0,
        height: 0,
    });
    const [floatingInspectorRect, setFloatingInspectorRect] = useState<FloatingInspectorRect | null>(null);
    const [floatingInspectorActive, setFloatingInspectorActive] = useState(false);
    const [floatingInspectorExpanded, setFloatingInspectorExpanded] = useState(false);
    const [exportingFormat, setExportingFormat] = useState<'markdown' | 'json' | null>(null);
    const [showMarkdownExportOptions, setShowMarkdownExportOptions] = useState(false);
    const [markdownExportCategories, setMarkdownExportCategories] = useState<MarkdownExportCategory[]>([]);
    const [historyRowStart, setHistoryRowStart] = useState(0);
    const [isWideLayout, setIsWideLayout] = useState(() => {
        if (typeof window === 'undefined') return true;
        return window.innerWidth >= 1280;
    });
    const [smoothScrollSuppressed, setSmoothScrollSuppressed] = useState(false);
    const [viewportHeight, setViewportHeight] = useState(0);
    const [scrollTop, setScrollTop] = useState(0);
    const [rowHeights, setRowHeights] = useState<Record<string, number>>({});
    const floatingInspectorWidth = floatingInspectorBounds.width;
    const floatingInspectorHeight = floatingInspectorBounds.height;

    useEffect(() => {
        transcriptGroupingStateRef.current = null;
        setRowHeights({});
        autoScrollEnabledRef.current = true;
        pendingHistoryPrependScrollHeightRef.current = null;
    }, [currentSessionId]);

    useEffect(() => {
        transcriptGroupingStateRef.current = null;
    }, [participants, replayEnabled]);

    useEffect(() => {
        if (!isDocumentVisible) {
            return;
        }

        setSmoothScrollSuppressed(true);
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

    const focusedRuntimeEvent = useMemo(
        () => (
            focusedRuntimeEventId
                ? visibleRuntimeEvents.find((event) => event.event_id === focusedRuntimeEventId) ?? null
                : null
        ),
        [focusedRuntimeEventId, visibleRuntimeEvents],
    );

    const visibleEventIds = useMemo(
        () => (replayEnabled ? new Set(visibleRuntimeEvents.map((event) => event.event_id)) : null),
        [replayEnabled, visibleRuntimeEvents],
    );

    const transcriptViewModel = useMemo(() => {
        const viewModel = buildTranscriptViewModel({
            dialogueHistory,
            teamDialogueHistory,
            juryDialogueHistory,
            participants,
            replayEnabled,
            visibleEventIds,
            focusedRuntimeEvent,
            previousGroupingState: replayEnabled ? null : transcriptGroupingStateRef.current,
        });

        transcriptGroupingStateRef.current = replayEnabled ? null : viewModel.groupingState;
        return viewModel;
    }, [
        dialogueHistory,
        focusedRuntimeEvent,
        juryDialogueHistory,
        participants,
        replayEnabled,
        teamDialogueHistory,
        visibleEventIds,
    ]);

    const rows = transcriptViewModel.rows;
    const transcriptCollapseSummary = useMemo(
        () => getTranscriptCollapseSummary(transcriptViewModel.rowViewModels, collapsedAgentMessages),
        [collapsedAgentMessages, transcriptViewModel.rowViewModels],
    );
    const bulkCollapseLabel = transcriptCollapseSummary.allCollapsed ? '展开辩手发言' : '折叠辩手发言';
    const handleToggleAllAgentMessages = useCallback(() => {
        if (!currentSessionId || !transcriptCollapseSummary.hasAgentRows) {
            return;
        }
        setAllAgentMessagesCollapsed(
            currentSessionId,
            transcriptCollapseSummary.keys,
            !transcriptCollapseSummary.allCollapsed,
        );
    }, [currentSessionId, setAllAgentMessagesCollapsed, transcriptCollapseSummary]);
    const toggleMarkdownExportCategory = useCallback((category: MarkdownExportCategory) => {
        setMarkdownExportCategories((current) => (
            current.includes(category)
                ? current.filter((value) => value !== category)
                : [...current, category]
        ));
    }, []);

    useEffect(() => {
        setShowMarkdownExportOptions(false);
    }, [currentSessionId]);

    useEffect(() => {
        const sessionId = currentSessionId;
        const rowsLength = rows.length;
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
    }, [currentSessionId, replayEnabled, rows.length]);

    const renderedRowViewModels = useMemo(
        () => (replayEnabled || historyRowStart <= 0
            ? transcriptViewModel.rowViewModels
            : transcriptViewModel.rowViewModels.slice(historyRowStart)),
        [historyRowStart, replayEnabled, transcriptViewModel.rowViewModels],
    );
    const hiddenHistoryRowCount = replayEnabled ? 0 : historyRowStart;
    const consensusEntries = transcriptViewModel.consensusEntries;
    const consensusFocused = transcriptViewModel.consensusFocused;

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
                setRowHeights((previous) => {
                    if (previous[key] === nextHeight) {
                        return previous;
                    }
                    return { ...previous, [key]: nextHeight };
                });
            };

            updateHeight();
            const observer = new ResizeObserver(updateHeight);
            observer.observe(node);
            observers.set(key, observer);
        };

        callbacks.set(key, callback);
        return callback;
    }, []);

    useEffect(() => {
        const activeKeys = new Set(renderedRowViewModels.map((viewModel) => viewModel.key));
        const callbacks = measureCallbacksRef.current;
        const observers = measureObserversRef.current;

        callbacks.forEach((_, key) => {
            if (activeKeys.has(key)) {
                return;
            }
            callbacks.delete(key);
            const observer = observers.get(key);
            if (observer) {
                observer.disconnect();
                observers.delete(key);
            }
        });

        setRowHeights((previous) => {
            const entries = Object.entries(previous).filter(([key]) => activeKeys.has(key));
            if (entries.length === Object.keys(previous).length) {
                return previous;
            }
            return Object.fromEntries(entries);
        });
    }, [renderedRowViewModels]);

    useEffect(() => () => {
        measureObserversRef.current.forEach((observer) => observer.disconnect());
        measureObserversRef.current.clear();
        measureCallbacksRef.current.clear();
    }, []);

    useLayoutEffect(() => {
        if (replayEnabled) return;
        if (!autoScrollEnabledRef.current) return;
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [dialogueHistory, teamDialogueHistory, juryDialogueHistory, currentTurn, replayEnabled]);

    useEffect(() => {
        const topElement = topOverlayRef.current;
        const bottomElement = bottomOverlayRef.current;

        const updateHeights = () => {
            setTopOverlayHeight(topElement?.offsetHeight ?? 0);
            setBottomOverlayHeight(bottomElement?.offsetHeight ?? 0);
        };

        updateHeights();
        window.addEventListener('resize', updateHeights);

        if (typeof ResizeObserver === 'undefined') {
            return () => window.removeEventListener('resize', updateHeights);
        }

        const observer = new ResizeObserver(() => updateHeights());
        if (topElement) observer.observe(topElement);
        if (bottomElement) observer.observe(bottomElement);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateHeights);
        };
    }, [currentSessionId]);

    useEffect(() => {
        overlayHeightsRef.current = null;
    }, [currentSessionId]);

    const stopFloatingInspectorInteraction = useCallback(() => {
        if (!floatingInspectorInteractionRef.current) return;

        floatingInspectorInteractionRef.current = null;
        setFloatingInspectorActive(false);
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
    }, [displaySettings.messageWidth, isWideLayout]);

    useEffect(() => {
        if (!isWideLayout) {
            setFloatingInspectorExpanded(false);
            stopFloatingInspectorInteraction();
            return;
        }
        if (floatingInspectorWidth <= 0 || floatingInspectorHeight <= 0) return;

        const bounds = {
            width: floatingInspectorWidth,
            height: floatingInspectorHeight,
        };

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
    }, [
        floatingInspectorHeight,
        floatingInspectorWidth,
        isWideLayout,
        stopFloatingInspectorInteraction,
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
    }, [bottomOverlayHeight, topOverlayHeight]);

    useLayoutEffect(() => {
        const previousScrollHeight = pendingHistoryPrependScrollHeightRef.current;
        const container = scrollRef.current;
        if (previousScrollHeight === null || !container) return;

        const scrollDelta = container.scrollHeight - previousScrollHeight;
        if (scrollDelta > 0) {
            container.scrollTop += scrollDelta;
        }
        pendingHistoryPrependScrollHeightRef.current = null;
    }, [renderedRowViewModels.length, virtualWindow.paddingBottom, virtualWindow.paddingTop]);

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
            target.scrollIntoView({
                block: 'center',
                behavior: smoothScrollSuppressed ? 'auto' : 'smooth',
            });
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
        container.scrollTo({
            top: targetScrollTop,
            behavior: smoothScrollSuppressed ? 'auto' : 'smooth',
        });
    }, [
        focusedRuntimeEventId,
        getRenderedRowTop,
        historyRowStart,
        replayEnabled,
        smoothScrollSuppressed,
        transcriptViewModel.focusedRowIndex,
        virtualItemHeights,
        virtualRows,
    ]);

    const startFloatingInspectorInteraction = (
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
    };

    const handleFloatingInspectorMoveStart = (event: ReactPointerEvent<HTMLElement>) => {
        const currentRect = floatingInspectorRectRef.current;
        if (!currentRect) return;

        startFloatingInspectorInteraction(event, {
            mode: 'move',
            startX: event.clientX,
            startY: event.clientY,
            startRect: currentRect,
            bounds: floatingInspectorBounds,
        });
    };

    const handleFloatingInspectorResizeStart =
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
            };

    const maxWidthValue = MESSAGE_WIDTH_VALUES[displaySettings.messageWidth];
    const panelMaxWidth = maxWidthValue;
    const scrollPaddingRight = '4px';
    const chatFontSizes = DISPLAY_FONT_TOKENS[displaySettings.fontSize].chat;

    const handleExport = async (format: 'markdown' | 'json') => {
        if (!hasCurrentSession || exportingFormat || !currentSessionId) return;

        const markdownCategories = ['debater_speeches', ...markdownExportCategories] as MarkdownExportCategory[];
        const normalizedMarkdownCategories = Array.from(new Set(markdownCategories));
        if (format !== 'markdown') {
            setShowMarkdownExportOptions(false);
        }

        setExportingFormat(format);
        try {
            if (format === 'markdown') {
                await api.sessions.exportMarkdown(currentSessionId, currentTopic, normalizedMarkdownCategories);
                toast('已导出 Markdown 辩论记录', 'success');
                setShowMarkdownExportOptions(false);
            } else {
                await api.sessions.exportJson(currentSessionId, currentTopic);
                toast('已导出 JSON 辩论数据', 'success');
            }
        } catch (error) {
            console.error('Failed to export session:', error);
            toast(error instanceof Error ? error.message : '导出失败', 'error');
        } finally {
            setExportingFormat(null);
        }
    };

    const selectedMarkdownExportCategoryCount = markdownExportCategories.length;
    const markdownExportButtonLabel = selectedMarkdownExportCategoryCount > 0
        ? `导出 Markdown +${selectedMarkdownExportCategoryCount}`
        : '导出 Markdown';
    const markdownExportOptionPanelVisible = hasCurrentSession && showMarkdownExportOptions;

    const loadOlderHistoryRows = () => {
        const container = scrollRef.current;
        if (!container || replayEnabled || hiddenHistoryRowCount <= 0) return;
        if (pendingHistoryPrependScrollHeightRef.current !== null) return;

        pendingHistoryPrependScrollHeightRef.current = container.scrollHeight;
        setHistoryRowStart((currentStart) => Math.max(0, currentStart - HISTORY_ROW_BATCH_SIZE));
    };

    const handleScroll = () => {
        const container = scrollRef.current;
        if (!container || replayEnabled) return;

        setScrollTop(container.scrollTop);
        setViewportHeight(container.clientHeight);
        autoScrollEnabledRef.current = isElementNearBottom(container);

        if (hiddenHistoryRowCount > 0 && container.scrollTop <= HISTORY_ROW_PRELOAD_THRESHOLD) {
            loadOlderHistoryRows();
        }
    };

    useEffect(() => {
        const container = scrollRef.current;
        if (!container) return;
        setViewportHeight(container.clientHeight);
        setScrollTop(container.scrollTop);
    }, [currentSessionId, renderedRowViewModels.length]);

    return (
        <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                background: isSophistryMode
                    ? 'linear-gradient(180deg, var(--mode-sophistry-bg) 0%, rgba(252, 250, 248, 0.92) 100%)'
                    : 'var(--bg-primary)',
                position: 'relative',
            }}
        >
            <div
                ref={panelRef}
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    maxWidth: panelMaxWidth,
                    margin: '0 auto',
                    width: '100%',
                    padding: '0 16px',
                    minHeight: 0,
                    position: 'relative',
                }}
            >
                <div
                    ref={topOverlayRef}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 16,
                        right: 16,
                        zIndex: 30,
                        pointerEvents: 'none',
                    }}
                >
                    <div
                        style={{
                            padding: '12px 0 8px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                flexWrap: 'wrap',
                                pointerEvents: 'auto',
                            }}
                        >
                            {isSidebarCollapsed && (
                                <motion.button
                                    whileHover={{ y: -1 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={onExpandSidebar}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        padding: '10px 12px',
                                        background: isSophistryMode ? 'var(--mode-sophistry-card)' : 'var(--bg-card)',
                                        color: isSophistryMode ? 'var(--mode-sophistry-accent)' : 'var(--text-secondary)',
                                        border: isSophistryMode
                                            ? '1px solid var(--mode-sophistry-border)'
                                            : '1px solid var(--border-subtle)',
                                        borderRadius: 'var(--radius-xl)',
                                        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                                        cursor: 'pointer',
                                        backdropFilter: 'blur(12px)',
                                        flexShrink: 0,
                                    }}
                                    title="展开历史栏"
                                >
                                    <PanelLeftOpen size={16} />
                                </motion.button>
                            )}

                            <motion.div
                                style={{
                                    padding: '12px 16px',
                                    background: isSophistryMode ? 'var(--mode-sophistry-card)' : 'var(--bg-card)',
                                    borderRadius: 'var(--radius-xl)',
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                                    border: isSophistryMode
                                        ? '1px solid var(--mode-sophistry-border)'
                                        : '1px solid var(--border-subtle)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: '12px',
                                    flexWrap: 'wrap',
                                    backdropFilter: 'blur(12px)',
                                    flex: 1,
                                    minWidth: 0,
                                }}
                            >
                                <h2
                                    style={{
                                        fontSize: chatFontSizes.topicTitle,
                                        fontWeight: 600,
                                        color: 'var(--text-primary)',
                                        letterSpacing: '-0.01em',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        flex: '1 1 240px',
                                        minWidth: 0,
                                        margin: 0,
                                    }}
                                >
                                    {hasCurrentSession ? currentTopic : 'Elenchus 辩论场'}
                                </h2>

                                {hasCurrentSession && (
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            flexWrap: 'wrap',
                                            flexShrink: 0,
                                        }}
                                    >
                                        <span
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                padding: '5px 12px',
                                                borderRadius: 'var(--radius-full)',
                                                background: isSophistryMode
                                                    ? 'rgba(184, 137, 70, 0.14)'
                                                    : 'var(--bg-tertiary)',
                                                color: isSophistryMode
                                                    ? 'var(--mode-sophistry-accent)'
                                                    : 'var(--text-secondary)',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                            }}
                                        >
                                            {isSophistryMode ? '诡辩实验模式' : '标准辩论'}
                                        </span>
                                        {transcriptCollapseSummary.hasAgentRows && (
                                            <motion.button
                                                whileHover={{ y: -1 }}
                                                whileTap={{ scale: 0.98 }}
                                                onClick={handleToggleAllAgentMessages}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    padding: '7px 12px',
                                                    background: 'var(--bg-tertiary)',
                                                    color: 'var(--text-secondary)',
                                                    border: '1px solid var(--border-subtle)',
                                                    borderRadius: 'var(--radius-full)',
                                                    cursor: 'pointer',
                                                    fontSize: '12px',
                                                    fontWeight: 600,
                                                }}
                                                title={bulkCollapseLabel}
                                            >
                                                {bulkCollapseLabel}
                                            </motion.button>
                                        )}

                                        <div style={{ position: 'relative' }}>
                                            <div
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    borderRadius: 'var(--radius-full)',
                                                    boxShadow: 'var(--shadow-xs)',
                                                }}
                                            >
                                                <motion.button
                                                    whileHover={{ y: -1 }}
                                                    whileTap={{ scale: 0.98 }}
                                                    onClick={() => {
                                                        void handleExport('markdown');
                                                    }}
                                                    disabled={Boolean(exportingFormat)}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        padding: '7px 12px',
                                                        background: 'var(--bg-tertiary)',
                                                        color: 'var(--text-secondary)',
                                                        border: '1px solid var(--border-subtle)',
                                                        borderRadius: 'var(--radius-full) 0 0 var(--radius-full)',
                                                        cursor: exportingFormat ? 'not-allowed' : 'pointer',
                                                        fontSize: '12px',
                                                        fontWeight: 600,
                                                        opacity: exportingFormat && exportingFormat !== 'markdown' ? 0.7 : 1,
                                                    }}
                                                    title="导出 Markdown 记录"
                                                >
                                                    <FileText size={14} />
                                                    {exportingFormat === 'markdown' ? '导出中...' : markdownExportButtonLabel}
                                                </motion.button>
                                                <motion.button
                                                    whileHover={{ y: -1 }}
                                                    whileTap={{ scale: 0.98 }}
                                                    onClick={() => setShowMarkdownExportOptions((current) => !current)}
                                                    disabled={!hasCurrentSession}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        padding: '7px 10px',
                                                        background: 'var(--bg-tertiary)',
                                                        color: 'var(--text-secondary)',
                                                        border: '1px solid var(--border-subtle)',
                                                        borderLeft: 'none',
                                                        borderRadius: '0 var(--radius-full) var(--radius-full) 0',
                                                        cursor: hasCurrentSession ? 'pointer' : 'default',
                                                        opacity: hasCurrentSession ? 1 : 0.6,
                                                    }}
                                                    title={markdownExportOptionPanelVisible ? '收起 Markdown 选项' : '展开 Markdown 选项'}
                                                >
                                                    <ChevronDown
                                                        size={14}
                                                        style={{
                                                            transform: markdownExportOptionPanelVisible ? 'rotate(180deg)' : 'rotate(0deg)',
                                                            transition: 'transform var(--transition-fast)',
                                                        }}
                                                    />
                                                </motion.button>
                                            </div>

                                            {markdownExportOptionPanelVisible && (
                                                <div
                                                    style={{
                                                        position: 'absolute',
                                                        top: 'calc(100% + 8px)',
                                                        right: 0,
                                                        minWidth: '220px',
                                                        padding: '12px',
                                                        borderRadius: 'var(--radius-xl)',
                                                        background: 'var(--bg-card)',
                                                        border: '1px solid var(--border-subtle)',
                                                        boxShadow: '0 10px 28px rgba(15, 23, 42, 0.14)',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '10px',
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                            Markdown 导出内容
                                                        </span>
                                                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                                            默认始终包含辩手发言，可额外附带讨论与评议内容。
                                                        </span>
                                                    </div>
                                                    <label
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '8px',
                                                            fontSize: '12px',
                                                            color: 'var(--text-secondary)',
                                                        }}
                                                    >
                                                        <input type="checkbox" checked readOnly />
                                                        <span>辩手发言（默认包含）</span>
                                                    </label>
                                                    {MARKDOWN_EXPORT_OPTIONS.map((option) => (
                                                        <label
                                                            key={option.value}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '8px',
                                                                fontSize: '12px',
                                                                color: 'var(--text-secondary)',
                                                                cursor: 'pointer',
                                                            }}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={markdownExportCategories.includes(option.value)}
                                                                onChange={() => toggleMarkdownExportCategory(option.value)}
                                                            />
                                                            <span>{option.label}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <motion.button
                                            whileHover={{ y: -1 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => {
                                                void handleExport('json');
                                            }}
                                            disabled={Boolean(exportingFormat)}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                padding: '7px 12px',
                                                background: 'var(--bg-tertiary)',
                                                color: 'var(--text-secondary)',
                                                border: '1px solid var(--border-subtle)',
                                                borderRadius: 'var(--radius-full)',
                                                cursor: exportingFormat ? 'not-allowed' : 'pointer',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                opacity: exportingFormat && exportingFormat !== 'json' ? 0.7 : 1,
                                            }}
                                            title="导出 JSON 原始数据"
                                        >
                                            <FileJson size={14} />
                                            {exportingFormat === 'json' ? '导出中...' : '导出 JSON'}
                                        </motion.button>

                                        <span
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                padding: '5px 12px',
                                                background: 'var(--bg-tertiary)',
                                                borderRadius: 'var(--radius-full)',
                                            }}
                                        >
                                            <span
                                                style={{
                                                    width: '6px',
                                                    height: '6px',
                                                    borderRadius: '50%',
                                                    background: 'var(--accent-emerald)',
                                                }}
                                            />
                                            <span
                                                style={{
                                                    fontSize: '12px',
                                                    color: 'var(--text-secondary)',
                                                    fontWeight: 500,
                                                }}
                                            >
                                                {currentTurn} / {maxTurns} 轮
                                            </span>
                                        </span>
                                    </div>
                                )}
                            </motion.div>

                            {hasCurrentSession && isSophistryMode && (
                                <div
                                    style={{
                                        pointerEvents: 'auto',
                                        padding: '12px 14px',
                                        borderRadius: 'var(--radius-xl)',
                                        background: 'var(--mode-sophistry-card)',
                                        border: '1px solid var(--mode-sophistry-border)',
                                        boxShadow: '0 6px 18px rgba(184, 137, 70, 0.08)',
                                    }}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '12px',
                                            flexWrap: 'wrap',
                                            marginBottom: '8px',
                                        }}
                                    >
                                        <span
                                            style={{
                                                fontSize: '13px',
                                                fontWeight: 700,
                                                color: 'var(--mode-sophistry-accent)',
                                            }}
                                        >
                                            模式提示
                                        </span>
                                        <span
                                            style={{
                                                fontSize: '12px',
                                                color: 'var(--text-secondary)',
                                                padding: '4px 10px',
                                                borderRadius: 'var(--radius-full)',
                                                background: 'rgba(184, 137, 70, 0.10)',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            观察报告 {modeArtifactsLength} 条
                                        </span>
                                    </div>
                                    <div
                                        style={{
                                            fontSize: '12px',
                                            lineHeight: 1.6,
                                            color: 'var(--text-secondary)',
                                            overflow: 'hidden',
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical',
                                        }}
                                    >
                                        {modeWarning}
                                    </div>
                                    <div
                                        style={{
                                            display: 'flex',
                                            gap: '8px',
                                            flexWrap: 'wrap',
                                            marginTop: '8px',
                                        }}
                                    >
                                        {['搜索已禁用', '无裁判评分', '输出观察报告'].map((label) => (
                                            <span
                                                key={label}
                                                style={{
                                                    padding: '4px 10px',
                                                    borderRadius: 'var(--radius-full)',
                                                    background: 'rgba(184, 137, 70, 0.10)',
                                                    color: 'var(--mode-sophistry-accent)',
                                                    fontSize: '12px',
                                                    fontWeight: 600,
                                                }}
                                            >
                                                {label}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div style={{ pointerEvents: 'auto' }}>
                                <StatusBanner />
                            </div>
                        </div>
                    </div>
                </div>

                <div
                    style={{
                        flex: '1 1 0',
                        minHeight: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '14px',
                    }}
                >
                    {!isWideLayout && (
                        <div style={{ flex: '0 0 auto', minWidth: 0 }}>
                            <RuntimeInspector key="inline-inspector" />
                        </div>
                    )}

                    <div
                        ref={scrollRef}
                        onScroll={handleScroll}
                        style={{
                            flex: '1 1 0',
                            minWidth: 0,
                            minHeight: 0,
                            overflowY: 'auto',
                            paddingTop: `${topOverlayHeight + 12}px`,
                            paddingRight: scrollPaddingRight,
                            paddingLeft: '4px',
                            paddingBottom: `${bottomOverlayHeight + 32}px`,
                            display: 'flex',
                            flexDirection: 'column',
                            scrollBehavior: smoothScrollSuppressed ? 'auto' : 'smooth',
                            gap: '10px',
                        }}
                    >
                        {hiddenHistoryRowCount > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '8px' }}>
                                <button
                                    type="button"
                                    onClick={loadOlderHistoryRows}
                                    style={{
                                        border: '1px solid var(--border-subtle)',
                                        background: 'var(--bg-card)',
                                        color: 'var(--text-secondary)',
                                        borderRadius: 'var(--radius-full)',
                                        padding: '10px 14px',
                                        fontSize: '12px',
                                        cursor: 'pointer',
                                        boxShadow: 'var(--shadow-xs)',
                                    }}
                                >
                                    {`已折叠更早的 ${hiddenHistoryRowCount} 条消息，向上滚动或点击继续加载`}
                                </button>
                            </div>
                        )}

                        <div style={{ height: `${virtualWindow.paddingTop}px`, flexShrink: 0 }} />
                        {virtualRows.map((viewModel, index) => {
                            const renderedIndex = virtualWindow.startIndex + index;
                            const rowFocused = viewModel.focus.agent || viewModel.focus.judge || viewModel.focus.system;
                            const animated = rowFocused || renderedIndex >= Math.max(0, renderedRowViewModels.length - 3);

                            return (
                                <div key={viewModel.key} ref={setMeasuredRow(viewModel.key)}>
                                    <div data-row-focused={rowFocused ? 'true' : 'false'}>
                                        <MessageRow
                                            agentEntry={viewModel.row.agent}
                                            judgeEntry={viewModel.row.judge}
                                            systemEntry={viewModel.row.system}
                                            highlightAgent={viewModel.focus.agent}
                                            highlightJudge={viewModel.focus.judge}
                                            highlightSystem={viewModel.focus.system}
                                            insightSections={viewModel.insightSections}
                                            animated={animated}
                                            agentCollapsed={isTranscriptAgentMessageCollapsed(viewModel.agentCollapseKey, collapsedAgentMessages)}
                                            onToggleAgentCollapsed={viewModel.agentCollapseKey && currentSessionId
                                                ? () => toggleAgentMessageCollapsed(currentSessionId, viewModel.agentCollapseKey as string)
                                                : undefined}
                                        />
                                    </div>
                                    {!!viewModel.jurySections.length && (
                                        <div data-row-focused={viewModel.juryFocused ? 'true' : 'false'}>
                                            <RoundInsights sections={viewModel.jurySections} />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        <div style={{ height: `${virtualWindow.paddingBottom}px`, flexShrink: 0 }} />

                        {!!consensusEntries.length && (
                            <div data-row-focused={consensusFocused ? 'true' : 'false'}>
                                <RoundInsights
                                    sections={[
                                        {
                                            key: 'consensus-summary',
                                            title: '辩论结束后的共识收敛',
                                            accent: 'var(--accent-cyan)',
                                            entries: consensusEntries,
                                        },
                                    ]}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {isWideLayout && floatingInspectorRect && (
                    <div
                        style={{
                            position: 'absolute',
                            left: `${floatingInspectorRect.x}px`,
                            top: `${floatingInspectorRect.y}px`,
                            zIndex: 26,
                            width: floatingInspectorExpanded ? `${floatingInspectorRect.width}px` : 'auto',
                            height: floatingInspectorExpanded ? `${floatingInspectorRect.height}px` : 'auto',
                            pointerEvents: 'auto',
                        }}
                    >
                        <div
                            style={{
                                position: 'relative',
                                width: floatingInspectorExpanded ? '100%' : 'auto',
                                height: floatingInspectorExpanded ? '100%' : 'auto',
                                overflow: 'visible',
                            }}
                        >
                            <div
                                onPointerDown={handleFloatingInspectorMoveStart}
                                title="拖动运行观察器"
                                style={{
                                    position: 'absolute',
                                    top: floatingInspectorExpanded ? '8px' : '-10px',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    zIndex: 3,
                                    width: '52px',
                                    height: '16px',
                                    borderRadius: '999px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '4px',
                                    cursor:
                                        floatingInspectorActive
                                        && floatingInspectorInteractionRef.current?.mode === 'move'
                                            ? 'grabbing'
                                            : 'grab',
                                    border: '1px solid var(--border-subtle)',
                                    background: 'var(--glass-bg)',
                                    backdropFilter: 'blur(10px)',
                                    boxShadow: floatingInspectorExpanded
                                        ? '0 6px 18px rgba(15, 23, 42, 0.12)'
                                        : '0 2px 8px rgba(15, 23, 42, 0.10)',
                                    userSelect: 'none',
                                    touchAction: 'none',
                                }}
                            >
                                {[0, 1, 2].map((dot) => (
                                    <span
                                        key={`floating-grip-${dot}`}
                                        style={{
                                            width: '4px',
                                            height: '4px',
                                            borderRadius: '999px',
                                            background: 'var(--text-muted)',
                                        }}
                                    />
                                ))}
                            </div>
                            {floatingInspectorExpanded && FLOATING_INSPECTOR_RESIZE_HANDLES.map((handle) => (
                                <div
                                    key={handle.key}
                                    onPointerDown={handleFloatingInspectorResizeStart(handle.key)}
                                    style={{
                                        position: 'absolute',
                                        zIndex: 2,
                                        touchAction: 'none',
                                        ...handle.style,
                                    }}
                                />
                            ))}

                            <div
                                style={{
                                    width: floatingInspectorExpanded ? '100%' : 'auto',
                                    height: floatingInspectorExpanded ? '100%' : 'auto',
                                    borderRadius: 'var(--radius-lg)',
                                    overflow: floatingInspectorExpanded ? 'hidden' : 'visible',
                                    boxSizing: 'border-box',
                                    boxShadow: floatingInspectorExpanded
                                        ? (
                                            floatingInspectorActive
                                                ? '0 20px 48px rgba(15, 23, 42, 0.18)'
                                                : '0 14px 34px rgba(15, 23, 42, 0.12)'
                                        )
                                        : 'none',
                                }}
                            >
                                <RuntimeInspector
                                    key="floating-inspector"
                                    defaultExpanded={floatingInspectorExpanded}
                                    fillHeight={floatingInspectorExpanded}
                                    onExpandedChange={(expanded) => {
                                        setFloatingInspectorExpanded(expanded);
                                        if (!expanded) {
                                            setFloatingInspectorActive(false);
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                )}

                <div
                    ref={bottomOverlayRef}
                    style={{
                        position: 'absolute',
                        left: 16,
                        right: 16,
                        bottom: 0,
                        zIndex: 30,
                        pointerEvents: 'none',
                    }}
                >
                    <div
                        style={{
                            padding: '8px 0 12px',
                            display: 'flex',
                            justifyContent: 'center',
                            pointerEvents: 'auto',
                        }}
                    >
                        <DebateControls />
                    </div>
                </div>
            </div>
        </motion.section>
    );
}
