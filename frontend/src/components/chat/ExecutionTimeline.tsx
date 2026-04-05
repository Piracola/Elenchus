import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRuntimeActions, useRuntimeViewState } from '../../hooks/useDebateViewState';
import { getEventNode } from '../../utils/eventFocus';
import { getLiveGraphNodeLabel } from '../../utils/liveGraph';
import {
    buildTimelineSearchIndex,
    computeTimelinePageTotal,
    filterIndexedTimelineEvents,
    sliceTimelineTail,
    TIMELINE_PAGE_SIZE,
} from '../../utils/timelineWindow';
import { getRuntimeEventGroup } from '../../utils/runtimeEventDictionary';
import { ExecutionTimelineDetailPane } from './executionTimeline/ExecutionTimelineDetailPane';
import { ExecutionTimelineListPane } from './executionTimeline/ExecutionTimelineListPane';
import type { ExecutionTimelineProps, TimelineFilter } from './executionTimeline/shared';
import { useTimelineActions } from './executionTimeline/useTimelineActions';

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
    } = useRuntimeActions();

    const [expanded, setExpanded] = useState(embedded);
    const [filter, setFilter] = useState<TimelineFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
    const [pageCount, setPageCount] = useState(1);
    const [isDraggingSlider, setIsDraggingSlider] = useState(false);

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
            // 过滤掉心跳事件（heartbeat），避免刷屏
            return indexedRuntimeEvents.filter(
                (entry) => !(entry.event.payload && typeof entry.event.payload === 'object' && 'heartbeat' in entry.event.payload),
            );
        }
        const entries = indexedRuntimeEvents.filter(
            (entry) => getRuntimeEventGroup(entry.event.type) === filter,
        );
        // 同样过滤心跳事件
        return entries.filter(
            (entry) => !(entry.event.payload && (entry.event.payload as any).heartbeat),
        );
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

    const handleFilterReset = () => {
        setFilter('all');
        setSearchQuery('');
        setPageCount(1);
        setSelectedEventId(null);
    };

    const {
        historyLoading,
        snapshotLoading,
        fileInputRef,
        handleLoadOlder,
        handleExport,
        handleLoadFullReplay,
        handleImportFile,
    } = useTimelineActions(pageCount, pageTotal, currentTopic, handleFilterReset);

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
        // 拖动滑块时不同步选中事件，避免闪烁
        if (!replayEnabled || isDraggingSlider) return;
        if (replayCursor < 0 || replayCursor >= runtimeEvents.length) return;

        const cursorEventId = runtimeEvents[replayCursor].event_id;
        if (selectedEventId !== cursorEventId) setSelectedEventId(cursorEventId);
        if (focusedRuntimeEventId !== cursorEventId) setFocusedRuntimeEventId(cursorEventId);
    }, [
        focusedRuntimeEventId,
        isDraggingSlider,
        replayCursor,
        replayEnabled,
        runtimeEvents,
        selectedEventId,
        setFocusedRuntimeEventId,
    ]);

    // 退出回放时，选中最新事件
    useEffect(() => {
        if (!replayEnabled && filteredEvents.length > 0) {
            const latestEvent = filteredEvents[filteredEvents.length - 1];
            if (selectedEventId !== latestEvent.event_id) {
                setSelectedEventId(latestEvent.event_id);
            }
        }
    }, [replayEnabled, filteredEvents, selectedEventId]);

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

        const targetIndex = runtimeEventIndex.get(eventId);
        if (targetIndex === undefined) return;

        // 点击事件时自动进入回放模式
        if (!replayEnabled) {
            setReplayEnabled(true);
        }
        setReplayCursor(targetIndex);
    };

    // 处理滑块拖动结束时的同步
    const handleSliderDragEnd = () => {
        setIsDraggingSlider(false);
        // 拖动结束时，同步选中事件
        if (replayEnabled && replayCursor >= 0 && replayCursor < runtimeEvents.length) {
            const cursorEventId = runtimeEvents[replayCursor].event_id;
            setSelectedEventId(cursorEventId);
            setFocusedRuntimeEventId(cursorEventId);
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
                    if (pageCount < pageTotal) {
                        setPageCount((prev) => Math.min(pageTotal, prev + 1));
                    } else {
                        void handleLoadOlder();
                    }
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
                onSliderDragStart={() => setIsDraggingSlider(true)}
                onSliderDragEnd={handleSliderDragEnd}
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
