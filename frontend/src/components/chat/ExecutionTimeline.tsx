import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../../api/client';
import { useDebateStore } from '../../stores/debateStore';
import type { RuntimeEvent } from '../../types';
import { getEventNode } from '../../utils/eventFocus';
import { getLiveGraphNodeLabel } from '../../utils/liveGraph';
import { parseRuntimeEventsSnapshot, serializeRuntimeEventsSnapshot } from '../../utils/replaySnapshot';
import {
    buildTimelineSearchIndex,
    computeTimelinePageTotal,
    computeVirtualTimelineWindow,
    filterIndexedTimelineEvents,
    requiredPageCountForIndex,
    sliceTimelineTail,
    TIMELINE_PAGE_SIZE,
} from '../../utils/timelineWindow';
import { getRuntimeEventGroup } from '../../utils/runtimeEventDictionary';
import { toast } from '../../utils/toast';

type TimelineFilter = 'all' | 'status' | 'speech' | 'judge' | 'tool' | 'memory' | 'system' | 'error';
type ExecutionTimelineProps = { compact?: boolean };

const FILTERS: TimelineFilter[] = ['all', 'status', 'speech', 'judge', 'tool', 'memory', 'system', 'error'];
const TIMELINE_ROW_HEIGHT = 60;
const TIMELINE_OVERSCAN = 8;
const TIMELINE_LOAD_MORE_OFFSET = 38;
const FILTER_LABELS: Record<TimelineFilter, string> = {
    all: '全部',
    status: '状态',
    speech: '发言',
    judge: '评判',
    tool: '工具',
    memory: '记忆',
    system: '系统',
    error: '错误',
};

function eventColor(type: string): string {
    const group = getRuntimeEventGroup(type);
    if (group === 'speech') return 'var(--color-proposer)';
    if (group === 'judge') return 'var(--color-judge)';
    if (group === 'tool') return 'var(--accent-cyan)';
    if (group === 'memory') return 'var(--accent-amber)';
    if (group === 'error') return 'var(--accent-rose)';
    if (group === 'system') return 'var(--text-muted)';
    return 'var(--accent-indigo)';
}

function formatTime(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? '--:--:--'
        : date.toLocaleTimeString('zh-CN', { hour12: false });
}

function formatJson(value: unknown): string {
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

function summarizeEvent(event: RuntimeEvent): string {
    const content = event.payload.content;
    if (typeof content === 'string' && content.trim()) {
        return content.length > 64 ? `${content.slice(0, 64)}...` : content;
    }
    const role = event.payload.role;
    if (typeof role === 'string' && role) return role;
    const node = event.payload.node;
    if (typeof node === 'string' && node) return getLiveGraphNodeLabel(node);
    return event.type;
}

const pillStyle = {
    border: 'none',
    borderRadius: '999px',
    padding: '4px 10px',
    fontSize: '11px',
    cursor: 'pointer',
} as const;

export default function ExecutionTimeline({ compact = false }: ExecutionTimelineProps) {
    const {
        runtimeEvents,
        currentSession,
        replayEnabled,
        replayCursor,
        focusedRuntimeEventId,
        hasOlderRuntimeEvents,
        setFocusedRuntimeEventId,
        setReplayEnabled,
        setReplayCursor,
        stepReplay,
        exitReplay,
        loadRuntimeEventSnapshot,
        prependRuntimeEvents,
    } = useDebateStore();

    const [expanded, setExpanded] = useState(false);
    const [filter, setFilter] = useState<TimelineFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
    const [pageCount, setPageCount] = useState(1);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [snapshotLoading, setSnapshotLoading] = useState(false);
    const [listScrollTop, setListScrollTop] = useState(0);
    const [listViewportHeight, setListViewportHeight] = useState(0);

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);
    const deferredSearchQuery = useDeferredValue(searchQuery);

    const runtimeEventIndex = useMemo(() => {
        const map = new Map<string, number>();
        runtimeEvents.forEach((event, index) => map.set(event.event_id, index));
        return map;
    }, [runtimeEvents]);

    const typeFilteredEvents = useMemo(() => {
        if (filter === 'all') return runtimeEvents;
        return runtimeEvents.filter((event) => getRuntimeEventGroup(event.type) === filter);
    }, [filter, runtimeEvents]);
    const indexedTypeFilteredEvents = useMemo(
        () => buildTimelineSearchIndex(typeFilteredEvents),
        [typeFilteredEvents],
    );

    const filteredEvents = useMemo(
        () => filterIndexedTimelineEvents(indexedTypeFilteredEvents, deferredSearchQuery),
        [deferredSearchQuery, indexedTypeFilteredEvents],
    );
    const pageTotal = useMemo(
        () => computeTimelinePageTotal(filteredEvents.length, TIMELINE_PAGE_SIZE),
        [filteredEvents.length],
    );
    const visibleEvents = useMemo(
        () => sliceTimelineTail(filteredEvents, TIMELINE_PAGE_SIZE, pageCount),
        [filteredEvents, pageCount],
    );
    const canLoadOlder = pageCount < pageTotal || hasOlderRuntimeEvents;
    const virtualWindow = useMemo(
        () =>
            computeVirtualTimelineWindow(
                visibleEvents.length,
                Math.max(0, listScrollTop - (canLoadOlder ? TIMELINE_LOAD_MORE_OFFSET : 0)),
                listViewportHeight || 240,
                TIMELINE_ROW_HEIGHT,
                TIMELINE_OVERSCAN,
            ),
        [canLoadOlder, listScrollTop, listViewportHeight, visibleEvents.length],
    );
    const virtualEvents = useMemo(
        () => visibleEvents.slice(virtualWindow.startIndex, virtualWindow.endIndex),
        [virtualWindow.endIndex, virtualWindow.startIndex, visibleEvents],
    );

    useEffect(() => {
        setPageCount((prev) => Math.min(Math.max(1, prev), pageTotal));
    }, [pageTotal]);

    useEffect(() => {
        const element = listRef.current;
        if (!element) return;

        const updateMetrics = () => {
            setListViewportHeight(element.clientHeight);
            setListScrollTop(element.scrollTop);
        };

        updateMetrics();
        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', updateMetrics);
            return () => {
                window.removeEventListener('resize', updateMetrics);
            };
        }

        const observer = new ResizeObserver(() => updateMetrics());
        observer.observe(element);
        return () => observer.disconnect();
    }, [expanded, canLoadOlder]);

    useEffect(() => {
        if (!filteredEvents.length) {
            if (!replayEnabled) setSelectedEventId(null);
            return;
        }
        if (
            focusedRuntimeEventId &&
            focusedRuntimeEventId !== selectedEventId &&
            filteredEvents.some((event) => event.event_id === focusedRuntimeEventId)
        ) {
            setSelectedEventId(focusedRuntimeEventId);
            return;
        }
        if (
            replayEnabled &&
            selectedEventId &&
            !filteredEvents.some((event) => event.event_id === selectedEventId)
        ) {
            return;
        }
        if (!selectedEventId || !filteredEvents.some((event) => event.event_id === selectedEventId)) {
            setSelectedEventId(filteredEvents[filteredEvents.length - 1].event_id);
        }
    }, [filteredEvents, focusedRuntimeEventId, replayEnabled, selectedEventId]);

    useEffect(() => {
        if (!replayEnabled) return;
        if (replayCursor < 0 || replayCursor >= runtimeEvents.length) return;
        const cursorEventId = runtimeEvents[replayCursor].event_id;
        if (selectedEventId !== cursorEventId) setSelectedEventId(cursorEventId);
        if (focusedRuntimeEventId !== cursorEventId) setFocusedRuntimeEventId(cursorEventId);
    }, [
        focusedRuntimeEventId,
        replayCursor,
        replayEnabled,
        runtimeEvents,
        selectedEventId,
        setFocusedRuntimeEventId,
    ]);

    useEffect(() => {
        if (!selectedEventId) return;
        const selectedIndex = filteredEvents.findIndex((event) => event.event_id === selectedEventId);
        if (selectedIndex < 0) return;
        const requiredPages = requiredPageCountForIndex(
            filteredEvents.length,
            selectedIndex,
            TIMELINE_PAGE_SIZE,
        );
        if (requiredPages > pageCount) setPageCount(requiredPages);
    }, [filteredEvents, pageCount, selectedEventId]);

    useEffect(() => {
        const container = listRef.current;
        if (!expanded || !container || !selectedEventId) return;

        const selectedIndex = visibleEvents.findIndex((event) => event.event_id === selectedEventId);
        if (selectedIndex < 0) return;

        const offset = canLoadOlder ? TIMELINE_LOAD_MORE_OFFSET : 0;
        const rowTop = offset + selectedIndex * TIMELINE_ROW_HEIGHT;
        const rowBottom = rowTop + TIMELINE_ROW_HEIGHT;
        const viewportTop = container.scrollTop;
        const viewportBottom = viewportTop + container.clientHeight;

        if (rowTop < viewportTop) {
            container.scrollTop = Math.max(0, rowTop - TIMELINE_ROW_HEIGHT);
            setListScrollTop(container.scrollTop);
            return;
        }

        if (rowBottom > viewportBottom) {
            container.scrollTop = Math.max(
                0,
                rowBottom - container.clientHeight + TIMELINE_ROW_HEIGHT,
            );
            setListScrollTop(container.scrollTop);
        }
    }, [canLoadOlder, expanded, selectedEventId, visibleEvents]);

    const selectedEvent = useMemo(() => {
        if (!selectedEventId) return null;
        const index = runtimeEventIndex.get(selectedEventId);
        return index === undefined ? null : runtimeEvents[index] ?? null;
    }, [runtimeEventIndex, runtimeEvents, selectedEventId]);

    const handleSelectEvent = (eventId: string) => {
        setSelectedEventId(eventId);
        setFocusedRuntimeEventId(eventId);
        if (!replayEnabled) return;
        const targetIndex = runtimeEventIndex.get(eventId);
        if (targetIndex !== undefined) setReplayCursor(targetIndex);
    };

    const handleLoadOlder = async () => {
        const previousHeight = listRef.current?.scrollHeight ?? 0;
        const restoreScroll = () => {
            requestAnimationFrame(() => {
                const current = listRef.current;
                if (!current) return;
                current.scrollTop += Math.max(0, current.scrollHeight - previousHeight);
            });
        };

        if (pageCount < pageTotal) {
            setPageCount((prev) => Math.min(pageTotal, prev + 1));
            restoreScroll();
            return;
        }

        if (
            historyLoading ||
            !hasOlderRuntimeEvents ||
            !currentSession?.id ||
            !runtimeEvents.length
        ) {
            return;
        }

        const oldestSeq = runtimeEvents[0]?.seq;
        if (!(typeof oldestSeq === 'number' && oldestSeq > 0)) {
            return;
        }

        try {
            setHistoryLoading(true);
            const page = await api.sessions.listRuntimeEvents(currentSession.id, {
                beforeSeq: oldestSeq,
                limit: TIMELINE_PAGE_SIZE,
            });

            if (!page.events.length) {
                prependRuntimeEvents([], false);
                toast('没有更多历史事件了', 'info');
                return;
            }

            prependRuntimeEvents(page.events, page.has_more);
            setPageCount((prev) => prev + 1);
            restoreScroll();
        } catch (error) {
            toast(error instanceof Error ? error.message : '加载历史事件失败', 'error');
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleExport = async () => {
        if (!runtimeEvents.length) {
            if (!currentSession?.id) {
                toast('没有可导出的运行事件', 'info');
                return;
            }
        }

        try {
            setSnapshotLoading(true);
            if (currentSession?.id) {
                await api.sessions.exportRuntimeEventsSnapshot(currentSession.id, currentSession.topic);
                toast('完整回放快照已导出', 'success');
                return;
            }

            const snapshot = serializeRuntimeEventsSnapshot(runtimeEvents);
            const blob = new Blob([snapshot], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `runtime-events-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
            anchor.click();
            URL.revokeObjectURL(url);
            toast('回放快照已导出', 'success');
        } catch (error) {
            toast(error instanceof Error ? error.message : '导出失败', 'error');
        } finally {
            setSnapshotLoading(false);
        }
    };

    const handleLoadFullReplay = async () => {
        if (!currentSession?.id) {
            toast('当前会话不支持从后端装载整段回放', 'info');
            return;
        }

        try {
            setSnapshotLoading(true);
            const raw = await api.sessions.getRuntimeEventsSnapshot(currentSession.id);
            const parsedEvents = parseRuntimeEventsSnapshot(raw);
            loadRuntimeEventSnapshot(parsedEvents);
            setFilter('all');
            setSearchQuery('');
            setPageCount(1);
            setSelectedEventId(parsedEvents[parsedEvents.length - 1]?.event_id ?? null);
            toast(`已装载整段回放，共 ${parsedEvents.length} 条事件`, 'success');
        } catch (error) {
            if (error instanceof Error && error.message.includes('no usable events')) {
                toast('当前会话还没有可回放的历史事件', 'info');
                return;
            }
            toast(error instanceof Error ? error.message : '装载整段回放失败', 'error');
        } finally {
            setSnapshotLoading(false);
        }
    };

    const handleImportFile = async (file: File | null) => {
        if (!file) return;
        try {
            const raw = await file.text();
            const parsedEvents = parseRuntimeEventsSnapshot(raw);
            loadRuntimeEventSnapshot(parsedEvents);
            setFilter('all');
            setSearchQuery('');
            setPageCount(1);
            setSelectedEventId(parsedEvents[parsedEvents.length - 1]?.event_id ?? null);
            toast(`已导入 ${parsedEvents.length} 条事件`, 'success');
        } catch (error) {
            toast(error instanceof Error ? error.message : '导入失败', 'error');
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const replayProgress = replayEnabled
        ? `回放 ${Math.max(0, replayCursor + 1)} / ${runtimeEvents.length}`
        : `实时 ${runtimeEvents.length}`;
    const canReplayStep = replayEnabled && runtimeEvents.length > 0;
    const replayAtStart = replayCursor <= 0;
    const replayAtEnd = replayCursor >= runtimeEvents.length - 1;
    const selectedNodeLabel = getLiveGraphNodeLabel(getEventNode(selectedEvent));

    return (
        <div
            style={{
                flex: compact && !expanded ? '0 0 auto' : '1 1 100%',
                minWidth: compact && !expanded ? 'auto' : 0,
                maxWidth: '100%',
            }}
        >
            <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => setExpanded((prev) => !prev)}
                style={{
                    width: compact && !expanded ? 'auto' : '100%',
                    minWidth: compact && !expanded ? 'auto' : 0,
                    border: '1px solid var(--border-subtle)',
                    borderRadius: compact && !expanded ? '999px' : 'var(--radius-lg)',
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)',
                    padding: compact && !expanded ? '7px 11px' : '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    cursor: 'pointer',
                    boxShadow: compact ? '0 10px 30px rgba(15, 23, 42, 0.08)' : 'var(--shadow-xs)',
                    backdropFilter: compact ? 'blur(14px)' : undefined,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                        style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            background: 'var(--accent-indigo)',
                            boxShadow: '0 0 10px rgba(99, 102, 241, 0.45)',
                        }}
                    />
                    <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.01em' }}>
                        执行时间线
                    </span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{replayProgress}</span>
            </motion.button>

            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        initial={{ opacity: 0, y: -6, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 360 }}
                        exit={{ opacity: 0, y: -4, height: 0 }}
                        transition={{ duration: 0.22 }}
                        style={{
                            marginTop: '8px',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-lg)',
                            background: 'var(--bg-secondary)',
                            display: 'grid',
                            gridTemplateColumns: '1.2fr 1fr',
                            overflow: 'hidden',
                            boxShadow: '0 14px 34px rgba(15, 23, 42, 0.12)',
                            backdropFilter: 'blur(14px)',
                        }}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                            <div
                                style={{
                                    display: 'flex',
                                    gap: '6px',
                                    alignItems: 'center',
                                    padding: '10px 10px 8px',
                                    borderBottom: '1px solid var(--border-subtle)',
                                    background: 'var(--bg-card)',
                                    flexWrap: 'wrap',
                                }}
                            >
                                {FILTERS.map((item) => (
                                    <button
                                        key={item}
                                        onClick={() => {
                                            setFilter(item);
                                            setPageCount(1);
                                        }}
                                        style={{
                                            ...pillStyle,
                                            color: filter === item ? '#fff' : 'var(--text-secondary)',
                                            background: filter === item ? 'var(--accent-indigo)' : 'var(--bg-tertiary)',
                                        }}
                                    >
                                        {FILTER_LABELS[item]}
                                    </button>
                                ))}
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(event) => {
                                        setSearchQuery(event.target.value);
                                        setPageCount(1);
                                    }}
                                    placeholder="搜索事件..."
                                    style={{
                                        marginLeft: 'auto',
                                        minWidth: '140px',
                                        border: 'none',
                                        borderRadius: 'var(--radius-sm)',
                                        padding: '4px 8px',
                                        fontSize: '11px',
                                        color: 'var(--text-primary)',
                                        background: 'var(--bg-tertiary)',
                                        outline: 'none',
                                    }}
                                />
                            </div>

                            <div
                                ref={listRef}
                                onScroll={(event) => setListScrollTop(event.currentTarget.scrollTop)}
                                style={{ flex: 1, overflowY: 'auto', padding: '6px' }}
                            >
                                {canLoadOlder && (
                                    <button
                                        onClick={() => {
                                            void handleLoadOlder();
                                        }}
                                        disabled={historyLoading}
                                        style={{
                                            width: '100%',
                                            border: 'none',
                                            borderRadius: 'var(--radius-sm)',
                                            marginBottom: '6px',
                                            minHeight: `${TIMELINE_LOAD_MORE_OFFSET - 6}px`,
                                            padding: '6px 8px',
                                            fontSize: '11px',
                                            cursor: historyLoading ? 'not-allowed' : 'pointer',
                                            opacity: historyLoading ? 0.7 : 1,
                                            color: 'var(--text-secondary)',
                                            background: 'var(--bg-tertiary)',
                                        }}
                                    >
                                        {historyLoading
                                            ? '正在加载历史事件...'
                                            : `加载更早事件 (${pageCount}/${pageTotal})`}
                                    </button>
                                )}
                                {!filteredEvents.length && (
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '8px' }}>
                                        当前筛选下暂无事件。
                                    </div>
                                )}
                                {visibleEvents.length > 0 && (
                                    <div
                                        style={{
                                            paddingTop: `${virtualWindow.paddingTop}px`,
                                            paddingBottom: `${virtualWindow.paddingBottom}px`,
                                        }}
                                    >
                                        {virtualEvents.map((event) => {
                                            const active = event.event_id === selectedEventId;
                                            return (
                                                <button
                                                    key={event.event_id}
                                                    onClick={() => handleSelectEvent(event.event_id)}
                                                    style={{
                                                        width: '100%',
                                                        height: `${TIMELINE_ROW_HEIGHT - 4}px`,
                                                        display: 'grid',
                                                        gridTemplateColumns: '58px 1fr',
                                                        gap: '10px',
                                                        border: 'none',
                                                        borderRadius: 'var(--radius-md)',
                                                        marginBottom: '4px',
                                                        padding: '8px',
                                                        textAlign: 'left',
                                                        background: active ? 'var(--bg-card)' : 'transparent',
                                                        cursor: 'pointer',
                                                        color: 'var(--text-primary)',
                                                        boxSizing: 'border-box',
                                                    }}
                                                >
                                                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                                        {formatTime(event.timestamp)}
                                                    </span>
                                                    <span style={{ minWidth: 0 }}>
                                                        <span
                                                            style={{
                                                                fontSize: '11px',
                                                                color: eventColor(event.type),
                                                                fontWeight: 600,
                                                                display: 'inline-block',
                                                                marginRight: '6px',
                                                            }}
                                                        >
                                                            #{event.seq}
                                                        </span>
                                                        <span style={{ fontSize: '11px', fontWeight: 500 }}>{event.type}</span>
                                                        <div
                                                            style={{
                                                                fontSize: '11px',
                                                                color: 'var(--text-muted)',
                                                                marginTop: '2px',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap',
                                                            }}
                                                        >
                                                            {summarizeEvent(event)}
                                                        </div>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div
                            style={{
                                borderLeft: '1px solid var(--border-subtle)',
                                display: 'flex',
                                flexDirection: 'column',
                                minWidth: 0,
                                background: 'var(--bg-card)',
                            }}
                        >
                            <div
                                style={{
                                    padding: '10px',
                                    borderBottom: '1px solid var(--border-subtle)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    flexWrap: 'wrap',
                                }}
                            >
                                <button
                                    onClick={() => setReplayEnabled(!replayEnabled)}
                                    style={{
                                        ...pillStyle,
                                        color: replayEnabled ? '#fff' : 'var(--text-secondary)',
                                        background: replayEnabled ? 'var(--accent-cyan)' : 'var(--bg-tertiary)',
                                    }}
                                >
                                    {replayEnabled ? '回放已开' : '回放已关'}
                                </button>
                                <button
                                    onClick={() => stepReplay(-1)}
                                    disabled={!canReplayStep || replayAtStart}
                                    style={{
                                        ...pillStyle,
                                        borderRadius: 'var(--radius-sm)',
                                        opacity: canReplayStep && !replayAtStart ? 1 : 0.5,
                                        cursor: canReplayStep ? 'pointer' : 'not-allowed',
                                        color: 'var(--text-secondary)',
                                        background: 'var(--bg-tertiary)',
                                    }}
                                >
                                    上一步
                                </button>
                                <button
                                    onClick={() => stepReplay(1)}
                                    disabled={!canReplayStep || replayAtEnd}
                                    style={{
                                        ...pillStyle,
                                        borderRadius: 'var(--radius-sm)',
                                        opacity: canReplayStep && !replayAtEnd ? 1 : 0.5,
                                        cursor: canReplayStep ? 'pointer' : 'not-allowed',
                                        color: 'var(--text-secondary)',
                                        background: 'var(--bg-tertiary)',
                                    }}
                                >
                                    下一步
                                </button>
                                {replayEnabled && (
                                    <button
                                        onClick={exitReplay}
                                        style={{
                                            ...pillStyle,
                                            borderRadius: 'var(--radius-sm)',
                                            color: 'var(--text-secondary)',
                                            background: 'var(--bg-tertiary)',
                                        }}
                                    >
                                        返回实时
                                    </button>
                                )}
                                {currentSession?.id && (
                                    <button
                                        onClick={() => {
                                            void handleLoadFullReplay();
                                        }}
                                        disabled={snapshotLoading}
                                        style={{
                                            ...pillStyle,
                                            borderRadius: 'var(--radius-sm)',
                                            color: 'var(--text-secondary)',
                                            background: 'var(--bg-tertiary)',
                                            opacity: snapshotLoading ? 0.7 : 1,
                                            cursor: snapshotLoading ? 'not-allowed' : 'pointer',
                                        }}
                                    >
                                        {snapshotLoading ? '装载中...' : '整段回放'}
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        void handleExport();
                                    }}
                                    disabled={snapshotLoading}
                                    style={{
                                        ...pillStyle,
                                        marginLeft: 'auto',
                                        borderRadius: 'var(--radius-sm)',
                                        color: 'var(--text-secondary)',
                                        background: 'var(--bg-tertiary)',
                                        opacity: snapshotLoading ? 0.7 : 1,
                                        cursor: snapshotLoading ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    {snapshotLoading ? '处理中...' : '导出'}
                                </button>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{
                                        ...pillStyle,
                                        borderRadius: 'var(--radius-sm)',
                                        color: 'var(--text-secondary)',
                                        background: 'var(--bg-tertiary)',
                                    }}
                                >
                                    导入
                                </button>
                            </div>

                            {runtimeEvents.length > 0 && (
                                <div style={{ padding: '0 10px 8px' }}>
                                    <input
                                        type="range"
                                        min={0}
                                        max={Math.max(0, runtimeEvents.length - 1)}
                                        value={Math.max(0, replayCursor)}
                                        onChange={(event) => setReplayCursor(Number(event.target.value))}
                                        style={{ width: '100%' }}
                                    />
                                </div>
                            )}

                            <div
                                style={{
                                    flex: 1,
                                    overflowY: 'auto',
                                    padding: '10px',
                                    fontSize: '11px',
                                    color: 'var(--text-secondary)',
                                }}
                            >
                                {selectedEvent ? (
                                    <>
                                        <div style={{ marginBottom: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: 600, color: eventColor(selectedEvent.type) }}>
                                                {selectedEvent.type}
                                            </span>
                                            <span>序号: {selectedEvent.seq}</span>
                                            <span>{formatTime(selectedEvent.timestamp)}</span>
                                            {selectedNodeLabel && (
                                                <span
                                                    style={{
                                                        background: 'var(--bg-tertiary)',
                                                        borderRadius: '999px',
                                                        padding: '2px 8px',
                                                        color: 'var(--accent-indigo)',
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    节点: {selectedNodeLabel}
                                                </span>
                                            )}
                                        </div>
                                        <pre
                                            style={{
                                                margin: 0,
                                                whiteSpace: 'pre-wrap',
                                                wordBreak: 'break-word',
                                                background: 'var(--bg-tertiary)',
                                                borderRadius: 'var(--radius-md)',
                                                padding: '8px',
                                                color: 'var(--text-primary)',
                                            }}
                                        >
                                            {formatJson(selectedEvent.payload)}
                                        </pre>
                                    </>
                                ) : (
                                    <div style={{ color: 'var(--text-muted)' }}>未选择事件</div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    void handleImportFile(file);
                }}
            />
        </div>
    );
}
