import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../../api/client';
import { useRuntimeActions, useRuntimeViewState } from '../../hooks/useDebateViewState';
import { getEventNode } from '../../utils/eventFocus';
import { getLiveGraphNodeLabel } from '../../utils/liveGraph';
import { parseRuntimeEventsSnapshot, serializeRuntimeEventsSnapshot } from '../../utils/replaySnapshot';
import {
    buildTimelineSearchIndex,
    computeTimelinePageTotal,
    filterIndexedTimelineEvents,
    sliceTimelineTail,
    TIMELINE_PAGE_SIZE,
} from '../../utils/timelineWindow';
import { getRuntimeEventGroup } from '../../utils/runtimeEventDictionary';
import { toast } from '../../utils/toast';
import { ExecutionTimelineDetailPane } from './executionTimeline/ExecutionTimelineDetailPane';
import { ExecutionTimelineListPane } from './executionTimeline/ExecutionTimelineListPane';
import type { ExecutionTimelineProps, TimelineFilter } from './executionTimeline/shared';

async function readJsonFileWithEncodingFallback(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();

    for (const label of ['utf-8', 'gb18030']) {
        try {
            return new TextDecoder(label, { fatal: true }).decode(buffer);
        } catch {
            continue;
        }
    }

    return new TextDecoder().decode(buffer);
}

export default function ExecutionTimeline({
    compact = false,
    embedded = false,
    fillHeight = false,
}: ExecutionTimelineProps) {
    const {
        runtimeEvents,
        currentSessionId,
        currentTopic,
        debateMode,
        replayEnabled,
        replayCursor,
        focusedRuntimeEventId,
        hasOlderRuntimeEvents,
    } = useRuntimeViewState();
    const {
        setFocusedRuntimeEventId,
        setReplayEnabled,
        setReplayCursor,
        stepReplay,
        exitReplay,
        loadRuntimeEventSnapshot,
        prependRuntimeEvents,
    } = useRuntimeActions();

    const [expanded, setExpanded] = useState(embedded);
    const [filter, setFilter] = useState<TimelineFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
    const [pageCount, setPageCount] = useState(1);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [snapshotLoading, setSnapshotLoading] = useState(false);

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);
    const deferredSearchQuery = useDeferredValue(searchQuery);

    const runtimeEventIndex = useMemo(() => {
        const map = new Map<string, number>();
        runtimeEvents.forEach((event, index) => map.set(event.event_id, index));
        return map;
    }, [runtimeEvents]);

    const indexedRuntimeEvents = useMemo(
        () => buildTimelineSearchIndex(runtimeEvents),
        [runtimeEvents],
    );

    const typeFilteredEntries = useMemo(() => {
        if (filter === 'all') {
            return indexedRuntimeEvents;
        }
        return indexedRuntimeEvents.filter((entry) => getRuntimeEventGroup(entry.event.type) === filter);
    }, [filter, indexedRuntimeEvents]);

    const filteredEvents = useMemo(
        () => filterIndexedTimelineEvents(typeFilteredEntries, deferredSearchQuery),
        [deferredSearchQuery, typeFilteredEntries],
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

    useEffect(() => {
        setPageCount((prev) => Math.min(Math.max(1, prev), pageTotal));
    }, [pageTotal]);

    useEffect(() => {
        if (!filteredEvents.length) {
            if (!replayEnabled) setSelectedEventId(null);
            return;
        }

        if (
            focusedRuntimeEventId &&
            filteredEvents.some((event) => event.event_id === focusedRuntimeEventId)
        ) {
            setSelectedEventId(focusedRuntimeEventId);
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
        if (!selectedEventId || !expanded) return;
        const container = listRef.current;
        if (!container) return;

        const target = container.querySelector(`[data-event-id="${selectedEventId}"]`) as HTMLButtonElement | null;
        target?.scrollIntoView({ block: 'nearest' });
    }, [expanded, selectedEventId, visibleEvents]);

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
        if (pageCount < pageTotal) {
            setPageCount((prev) => Math.min(pageTotal, prev + 1));
            return;
        }

        if (historyLoading || !hasOlderRuntimeEvents || !currentSessionId || !runtimeEvents.length) {
            return;
        }

        const oldestSeq = runtimeEvents[0]?.seq;
        if (!(typeof oldestSeq === 'number' && oldestSeq > 0)) {
            return;
        }

        try {
            setHistoryLoading(true);
            const page = await api.sessions.listRuntimeEvents(currentSessionId, {
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
        } catch (error) {
            toast(error instanceof Error ? error.message : '加载历史事件失败', 'error');
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleExport = async () => {
        if (!runtimeEvents.length && !currentSessionId) {
            toast('没有可导出的运行事件', 'info');
            return;
        }

        try {
            setSnapshotLoading(true);

            if (currentSessionId) {
                await api.sessions.exportRuntimeEventsSnapshot(currentSessionId, currentTopic);
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
        if (!currentSessionId) {
            toast('当前会话不支持从后端装载整段回放', 'info');
            return;
        }

        try {
            setSnapshotLoading(true);
            const raw = await api.sessions.getRuntimeEventsSnapshot(currentSessionId);
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
            const raw = await readJsonFileWithEncodingFallback(file);
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
    const selectedNodeLabel = getLiveGraphNodeLabel(
        getEventNode(selectedEvent),
        debateMode,
    );

    const timelineContent = (
        <motion.div
            initial={embedded ? false : { opacity: 0, y: -6, height: 0 }}
            animate={embedded ? { opacity: 1 } : { opacity: 1, y: 0, height: 360 }}
            exit={embedded ? undefined : { opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.22 }}
            style={{
                marginTop: embedded ? 0 : '8px',
                border: embedded ? 'none' : '1px solid var(--border-subtle)',
                borderRadius: embedded ? 0 : 'var(--radius-lg)',
                background: embedded ? 'transparent' : 'var(--bg-secondary)',
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
                overflow: 'hidden',
                boxShadow: embedded ? 'none' : '0 14px 34px rgba(15, 23, 42, 0.12)',
                backdropFilter: embedded ? undefined : 'blur(14px)',
                minHeight: embedded ? 0 : 360,
                height: embedded ? (fillHeight ? '100%' : 360) : 360,
            }}
        >
            <ExecutionTimelineListPane
                listRef={listRef}
                filter={filter}
                searchQuery={searchQuery}
                visibleEvents={visibleEvents}
                selectedEventId={selectedEventId}
                debateMode={debateMode}
                canLoadOlder={canLoadOlder}
                historyLoading={historyLoading}
                pageCount={pageCount}
                pageTotal={pageTotal}
                onFilterChange={(nextFilter) => {
                    setFilter(nextFilter);
                    setPageCount(1);
                }}
                onSearchChange={(value) => {
                    setSearchQuery(value);
                    setPageCount(1);
                }}
                onLoadOlder={() => {
                    void handleLoadOlder();
                }}
                onSelectEvent={handleSelectEvent}
            />

            <ExecutionTimelineDetailPane
                currentSessionId={currentSessionId}
                runtimeEvents={runtimeEvents}
                replayEnabled={replayEnabled}
                replayCursor={replayCursor}
                selectedEvent={selectedEvent}
                selectedNodeLabel={selectedNodeLabel}
                replayProgress={replayProgress}
                canReplayStep={canReplayStep}
                replayAtStart={replayAtStart}
                replayAtEnd={replayAtEnd}
                snapshotLoading={snapshotLoading}
                onReplayEnabledChange={setReplayEnabled}
                onStepReplay={stepReplay}
                onExitReplay={exitReplay}
                onLoadFullReplay={() => {
                    void handleLoadFullReplay();
                }}
                onExport={() => {
                    void handleExport();
                }}
                onImport={() => fileInputRef.current?.click()}
                onReplayCursorChange={setReplayCursor}
            />
        </motion.div>
    );

    return (
        <div
            style={{
                flex: compact && !expanded && !embedded ? '0 0 auto' : '1 1 100%',
                minWidth: compact && !expanded && !embedded ? 'auto' : 0,
                maxWidth: '100%',
                ...(embedded && fillHeight ? { height: '100%', minHeight: 0 } : {}),
            }}
        >
            {!embedded && (
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
            )}

            {embedded ? timelineContent : (
                <AnimatePresence initial={false}>
                    {expanded && timelineContent}
                </AnimatePresence>
            )}

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
