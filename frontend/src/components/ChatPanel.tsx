/**
 * ChatPanel - main conversation view with floating top/bottom overlays.
 * The overlays are rendered above the scrollable message list so content can
 * move beneath the gaps between cards instead of being blocked by a container.
 */

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { motion } from 'framer-motion';
import { FileJson, FileText } from 'lucide-react';
import { api } from '../api/client';
import { useDebateStore } from '../stores/debateStore';
import { useSettingsStore, MESSAGE_WIDTH_VALUES } from '../stores/settingsStore';
import MessageRow from './chat/MessageRow';
import DebateControls from './chat/DebateControls';
import RuntimeInspector from './chat/RuntimeInspector';
import StatusBanner from './chat/StatusBanner';
import RoundInsights from './chat/RoundInsights';
import { groupDialogue } from '../utils/groupDialogue';
import { resolveRowFocus } from '../utils/eventFocus';
import {
    eventMatchesTurn,
    buildSpeakerDiscussionMap,
    buildTurnDiscussionMap,
    sideLabel,
    speakerInsightKey,
} from '../utils/roundInsights';
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
import type { InsightSection } from './chat/RoundInsights';
import type {
    FloatingInspectorBounds,
    FloatingInspectorInteraction,
    FloatingInspectorRect,
    FloatingInspectorResizeHandle,
} from '../utils/floatingInspectorLayout';

const INITIAL_HISTORY_ROW_WINDOW = 120;
const HISTORY_ROW_BATCH_SIZE = 80;
const HISTORY_ROW_PRELOAD_THRESHOLD = 240;
export default function ChatPanel() {
    const currentSessionId = useDebateStore((state) => state.currentSession?.id ?? null);
    const currentTopic = useDebateStore((state) => state.currentSession?.topic ?? '');
    const debateMode = useDebateStore((state) => state.currentSession?.debate_mode ?? 'standard');
    const participants = useDebateStore((state) => state.currentSession?.participants);
    const dialogueHistory = useDebateStore((state) => state.currentSession?.dialogue_history ?? []);
    const teamDialogueHistory = useDebateStore((state) => state.currentSession?.team_dialogue_history ?? []);
    const juryDialogueHistory = useDebateStore((state) => state.currentSession?.jury_dialogue_history ?? []);
    const currentTurn = useDebateStore((state) => state.currentSession?.current_turn ?? 0);
    const maxTurns = useDebateStore((state) => state.currentSession?.max_turns ?? 0);
    const modeArtifactsLength = useDebateStore((state) => state.currentSession?.mode_artifacts?.length ?? 0);
    const visibleRuntimeEvents = useDebateStore((state) => state.visibleRuntimeEvents);
    const replayEnabled = useDebateStore((state) => state.replayEnabled);
    const focusedRuntimeEventId = useDebateStore((state) => state.focusedRuntimeEventId);
    const { displaySettings } = useSettingsStore();
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
    const [historyRowStart, setHistoryRowStart] = useState(0);
    const [isWideLayout, setIsWideLayout] = useState(() => {
        if (typeof window === 'undefined') return true;
        return window.innerWidth >= 1280;
    });
    const floatingInspectorWidth = floatingInspectorBounds.width;
    const floatingInspectorHeight = floatingInspectorBounds.height;

    useEffect(() => {
        autoScrollEnabledRef.current = true;
        pendingHistoryPrependScrollHeightRef.current = null;
    }, [currentSessionId]);

    useLayoutEffect(() => {
        if (replayEnabled) return;
        if (!autoScrollEnabledRef.current) return;
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [
        dialogueHistory,
        teamDialogueHistory,
        juryDialogueHistory,
        currentTurn,
        replayEnabled,
    ]);

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
                    prev &&
                    prev.x === nextRect.x &&
                    prev.y === nextRect.y &&
                    prev.width === nextRect.width &&
                    prev.height === nextRect.height
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

    const visibleEventIds = useMemo(
        () => (replayEnabled ? new Set(visibleRuntimeEvents.map((event) => event.event_id)) : null),
        [replayEnabled, visibleRuntimeEvents],
    );

    const rows = useMemo(() => {
        const history = replayEnabled && visibleEventIds
            ? dialogueHistory.filter((entry) => !entry.event_id || visibleEventIds.has(entry.event_id))
            : dialogueHistory;

        return groupDialogue(history, participants);
    }, [
        dialogueHistory,
        participants,
        replayEnabled,
        visibleEventIds,
    ]);


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


    const renderedRows = useMemo(
        () => (replayEnabled || historyRowStart <= 0 ? rows : rows.slice(historyRowStart)),
        [historyRowStart, replayEnabled, rows],
    );
    const hiddenHistoryRowCount = replayEnabled ? 0 : historyRowStart;

    const visibleTeamDiscussion = useMemo(() => {
        if (!replayEnabled || !visibleEventIds) {
            return teamDialogueHistory;
        }

        return teamDialogueHistory.filter((entry) => !entry.event_id || visibleEventIds.has(entry.event_id));
    }, [
        teamDialogueHistory,
        replayEnabled,
        visibleEventIds,
    ]);

    const visibleJuryDiscussion = useMemo(() => {
        if (!replayEnabled || !visibleEventIds) {
            return juryDialogueHistory;
        }

        return juryDialogueHistory.filter((entry) => !entry.event_id || visibleEventIds.has(entry.event_id));
    }, [
        juryDialogueHistory,
        replayEnabled,
        visibleEventIds,
    ]);


    const teamDiscussionMap = useMemo(
        () => buildSpeakerDiscussionMap(visibleTeamDiscussion),
        [visibleTeamDiscussion],
    );
    const juryDiscussionMap = useMemo(
        () => buildTurnDiscussionMap(visibleJuryDiscussion),
        [visibleJuryDiscussion],
    );
    const consensusEntries = useMemo(
        () => visibleJuryDiscussion.filter((entry) => entry.role === 'consensus_summary'),
        [visibleJuryDiscussion],
    );

    const focusedRuntimeEvent = useMemo(
        () =>
            focusedRuntimeEventId
                ? visibleRuntimeEvents.find((event) => event.event_id === focusedRuntimeEventId) ?? null
                : null,
        [focusedRuntimeEventId, visibleRuntimeEvents],
    );
    const consensusFocused = focusedRuntimeEvent?.type === 'consensus_summary';

    const focusedRowIndex = useMemo(() => {
        if (!focusedRuntimeEvent) {
            return -1;
        }

        return rows.findIndex((row) => {
            const focusState = resolveRowFocus(row, focusedRuntimeEvent);
            return focusState.agent || focusState.judge || focusState.system;
        });
    }, [focusedRuntimeEvent, rows]);

    useLayoutEffect(() => {
        const previousScrollHeight = pendingHistoryPrependScrollHeightRef.current;
        const container = scrollRef.current;
        if (previousScrollHeight === null || !container) return;

        const scrollDelta = container.scrollHeight - previousScrollHeight;
        if (scrollDelta > 0) {
            container.scrollTop += scrollDelta;
        }
        pendingHistoryPrependScrollHeightRef.current = null;
    }, [renderedRows.length]);

    useEffect(() => {
        if (replayEnabled || !focusedRuntimeEventId || focusedRowIndex < 0) {
            return;
        }

        setHistoryRowStart((currentStart) => revealFocusedHistoryRow(currentStart, focusedRowIndex));
    }, [focusedRowIndex, focusedRuntimeEventId, replayEnabled]);

    useEffect(() => {
        if (!focusedRuntimeEventId) return;
        const container = scrollRef.current;
        if (!container) return;
        const target = container.querySelector('[data-row-focused="true"]') as HTMLElement | null;
        target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, [focusedRuntimeEventId, renderedRows]);

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

    const handleExport = async (format: 'markdown' | 'json') => {
        if (!hasCurrentSession || exportingFormat || !currentSessionId) return;

        setExportingFormat(format);
        try {
            if (format === 'markdown') {
                await api.sessions.exportMarkdown(currentSessionId, currentTopic);
                toast('已导出 Markdown 辩论记录', 'success');
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
        autoScrollEnabledRef.current = isElementNearBottom(container);

        if (hiddenHistoryRowCount > 0 && container.scrollTop <= HISTORY_ROW_PRELOAD_THRESHOLD) {
            loadOlderHistoryRows();
        }
    };

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
                                        fontSize: '15px',
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
                                                borderRadius: 'var(--radius-full)',
                                                cursor: exportingFormat ? 'not-allowed' : 'pointer',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                opacity: exportingFormat && exportingFormat !== 'markdown' ? 0.7 : 1,
                                            }}
                                            title="导出 Markdown 记录"
                                        >
                                            <FileText size={14} />
                                            {exportingFormat === 'markdown' ? '导出中...' : '导出 Markdown'}
                                        </motion.button>

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
                            scrollBehavior: 'smooth',
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
                        {(() => {
                            return renderedRows.map((row, idx) => {
                                const turn = row.turn ?? row.agent?.turn ?? row.judge?.turn;
                                const agentRole = row.agent?.role;
                                const focusState = resolveRowFocus(row, focusedRuntimeEvent);
                                const sections: InsightSection[] = [];
                                const teamKey = speakerInsightKey(turn, agentRole);
                                const teamEntries = teamKey ? teamDiscussionMap.get(teamKey) ?? [] : [];
                                if (teamEntries.length) {
                                    sections.push({
                                        key: `team-${teamKey}`,
                                        title: `${sideLabel(agentRole)}组内讨论`,
                                        accent: agentRole === 'opposer' ? 'var(--color-opposer)' : 'var(--color-proposer)',
                                        entries: teamEntries,
                                    });
                                }

                                const agentKey = row.agent?.timestamp || `agent-${idx}`;
                                const judgeKey = row.judge?.timestamp || `judge-${idx}`;
                                const nextRow = renderedRows[idx + 1];
                                const nextTurn = nextRow?.turn ?? nextRow?.agent?.turn ?? nextRow?.judge?.turn;
                                const isLastRowOfTurn = turn !== undefined && nextTurn !== turn;
                                const juryEntries = isLastRowOfTurn && turn !== undefined
                                    ? juryDiscussionMap.get(turn) ?? []
                                    : [];
                                const safeTurn = turn ?? 0;
                                const juryFocused =
                                    turn !== undefined
                                    && (
                                        focusedRuntimeEvent?.type === 'jury_discussion'
                                        || focusedRuntimeEvent?.type === 'jury_summary'
                                    )
                                    && eventMatchesTurn(focusedRuntimeEvent, turn);

                                return (
                                    <Fragment key={`${agentKey}-${judgeKey}`}>
                                        <div
                                            data-row-focused={focusState.agent || focusState.judge || focusState.system ? 'true' : 'false'}
                                        >
                                            <MessageRow
                                                agentEntry={row.agent}
                                                judgeEntry={row.judge}
                                                systemEntry={row.system}
                                                highlightAgent={focusState.agent}
                                                highlightJudge={focusState.judge}
                                                highlightSystem={focusState.system}
                                                insightSections={sections}
                                            />
                                        </div>
                                        {!!juryEntries.length && (
                                            <div data-row-focused={juryFocused ? 'true' : 'false'}>
                                                <RoundInsights
                                                    sections={[
                                                        {
                                                            key: `jury-${safeTurn}`,
                                                            title: `第 ${safeTurn + 1} 轮陪审团评议`,
                                                            accent: 'var(--accent-indigo)',
                                                            entries: juryEntries,
                                                        },
                                                    ]}
                                                />
                                            </div>
                                        )}
                                    </Fragment>
                                );
                            });
                        })()}

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
                                        floatingInspectorActive &&
                                        floatingInspectorInteractionRef.current?.mode === 'move'
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
