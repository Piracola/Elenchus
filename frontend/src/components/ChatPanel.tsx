/**
 * ChatPanel - main conversation view with floating top/bottom overlays.
 * The overlays are rendered above the scrollable message list so content can
 * move beneath the gaps between cards instead of being blocked by a container.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { FileJson, FileText } from 'lucide-react';
import { api } from '../api/client';
import { useDebateStore } from '../stores/debateStore';
import { useSettingsStore, MESSAGE_WIDTH_VALUES } from '../stores/settingsStore';
import type { DialogueEntry } from '../types';
import MessageRow from './chat/MessageRow';
import DebateControls from './chat/DebateControls';
import LiveGraph from './chat/LiveGraph';
import MemoryPanel from './chat/MemoryPanel';
import ExecutionTimeline from './chat/ExecutionTimeline';
import StatusBanner from './chat/StatusBanner';
import { groupDialogue } from '../utils/groupDialogue';
import { resolveRowFocus } from '../utils/eventFocus';
import { toast } from '../utils/toast';

export default function ChatPanel() {
    const {
        currentSession,
        visibleRuntimeEvents,
        replayEnabled,
        focusedRuntimeEventId,
        streamingRole,
        streamingContent,
    } = useDebateStore();
    const { displaySettings } = useSettingsStore();

    const scrollRef = useRef<HTMLDivElement>(null);
    const topOverlayRef = useRef<HTMLDivElement>(null);
    const bottomOverlayRef = useRef<HTMLDivElement>(null);
    const overlayHeightsRef = useRef<{ top: number; bottom: number } | null>(null);

    const [topOverlayHeight, setTopOverlayHeight] = useState(0);
    const [bottomOverlayHeight, setBottomOverlayHeight] = useState(0);
    const [exportingFormat, setExportingFormat] = useState<'markdown' | 'json' | null>(null);

    useEffect(() => {
        if (replayEnabled) return;
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [currentSession?.dialogue_history, currentSession?.current_turn, replayEnabled, streamingContent]);

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
            return () => {
                window.removeEventListener('resize', updateHeights);
            };
        }

        const observer = new ResizeObserver(() => updateHeights());
        if (topElement) observer.observe(topElement);
        if (bottomElement) observer.observe(bottomElement);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateHeights);
        };
    }, [currentSession?.id]);

    useEffect(() => {
        overlayHeightsRef.current = null;
    }, [currentSession?.id]);

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

    const rows = useMemo(() => {
        const visibleEventIds = new Set(visibleRuntimeEvents.map((event) => event.event_id));
        const fullHistory = currentSession?.dialogue_history || [];
        const history = replayEnabled
            ? fullHistory.filter((entry) => !entry.event_id || visibleEventIds.has(entry.event_id))
            : fullHistory;
        const allEntries: DialogueEntry[] = [...history];

        if (!replayEnabled && streamingRole && !['system', 'error'].includes(streamingRole)) {
            const lastHistoryEntry = history[history.length - 1];
            const isStreamingDuplicate =
                lastHistoryEntry &&
                lastHistoryEntry.role === streamingRole &&
                lastHistoryEntry.content === streamingContent;

            if (!isStreamingDuplicate) {
                allEntries.push({
                    role: streamingRole,
                    content: streamingContent,
                    citations: [],
                    timestamp: '',
                    agent_name: streamingRole,
                } as DialogueEntry);
            }
        }

        return groupDialogue(allEntries, currentSession?.participants);
    }, [
        currentSession?.dialogue_history,
        currentSession?.participants,
        replayEnabled,
        streamingContent,
        streamingRole,
        visibleRuntimeEvents,
    ]);

    const focusedRuntimeEvent = useMemo(
        () =>
            focusedRuntimeEventId
                ? visibleRuntimeEvents.find((event) => event.event_id === focusedRuntimeEventId) ?? null
                : null,
        [focusedRuntimeEventId, visibleRuntimeEvents],
    );

    useEffect(() => {
        if (!focusedRuntimeEventId) return;
        const container = scrollRef.current;
        if (!container) return;
        const target = container.querySelector('[data-row-focused="true"]') as HTMLElement | null;
        target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, [focusedRuntimeEventId, rows]);

    const maxWidthValue = MESSAGE_WIDTH_VALUES[displaySettings.messageWidth];

    const handleExport = async (format: 'markdown' | 'json') => {
        if (!currentSession || exportingFormat) return;

        setExportingFormat(format);
        try {
            if (format === 'markdown') {
                await api.sessions.exportMarkdown(currentSession.id, currentSession.topic);
                toast('已导出 Markdown 辩论记录', 'success');
            } else {
                await api.sessions.exportJson(currentSession.id, currentSession.topic);
                toast('已导出 JSON 辩论数据', 'success');
            }
        } catch (error) {
            console.error('Failed to export session:', error);
            toast(error instanceof Error ? error.message : '导出失败', 'error');
        } finally {
            setExportingFormat(null);
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
                background: 'var(--bg-primary)',
                position: 'relative',
            }}
        >
            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    maxWidth: maxWidthValue,
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
                                    background: 'var(--bg-card)',
                                    borderRadius: 'var(--radius-xl)',
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                                    border: '1px solid var(--border-subtle)',
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
                                    {currentSession ? currentSession.topic : 'Elenchus 辩论场'}
                                </h2>
                                {currentSession && (
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            flexWrap: 'wrap',
                                            flexShrink: 0,
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
                                                {currentSession.current_turn} / {currentSession.max_turns} 轮
                                            </span>
                                        </span>
                                    </div>
                                )}
                            </motion.div>
                            <div style={{ pointerEvents: 'auto' }}>
                                <StatusBanner />
                            </div>
                        </div>

                        <div
                            style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                alignItems: 'flex-start',
                                gap: '8px',
                                pointerEvents: 'auto',
                            }}
                        >
                            <LiveGraph compact />
                            <MemoryPanel compact />
                            <ExecutionTimeline compact />
                        </div>
                    </div>
                </div>

                <div
                    ref={scrollRef}
                    style={{
                        flex: '1 1 0',
                        minHeight: 0,
                        overflowY: 'auto',
                        paddingTop: topOverlayHeight + 12,
                        paddingRight: '4px',
                        paddingBottom: bottomOverlayHeight + 28,
                        paddingLeft: '4px',
                        display: 'flex',
                        flexDirection: 'column',
                        scrollBehavior: 'smooth',
                        gap: '10px',
                    }}
                >
                    {rows.map((row, idx) => {
                        const agentKey = row.agent?.timestamp || `agent-${idx}`;
                        const judgeKey = row.judge?.timestamp || `judge-${idx}`;
                        const focusState = resolveRowFocus(row, focusedRuntimeEvent);

                        return (
                            <MessageRow
                                key={`${agentKey}-${judgeKey}`}
                                agentEntry={row.agent}
                                judgeEntry={row.judge}
                                systemEntry={row.system}
                                highlightAgent={focusState.agent}
                                highlightJudge={focusState.judge}
                                highlightSystem={focusState.system}
                            />
                        );
                    })}
                </div>

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
