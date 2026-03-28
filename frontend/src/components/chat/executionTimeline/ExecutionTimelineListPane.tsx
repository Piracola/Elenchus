import type { RefObject } from 'react';
import type { RuntimeEvent } from '../../../types';
import {
    eventColor,
    FILTER_LABELS,
    FILTERS,
    formatTime,
    pillStyle,
    summarizeEvent,
    type TimelineFilter,
} from './shared';

type ExecutionTimelineListPaneProps = {
    listRef: RefObject<HTMLDivElement | null>;
    filter: TimelineFilter;
    searchQuery: string;
    visibleEvents: RuntimeEvent[];
    selectedEventId: string | null;
    debateMode: 'standard' | 'sophistry_experiment';
    canLoadOlder: boolean;
    historyLoading: boolean;
    pageCount: number;
    pageTotal: number;
    onFilterChange: (filter: TimelineFilter) => void;
    onSearchChange: (value: string) => void;
    onLoadOlder: () => void;
    onSelectEvent: (eventId: string) => void;
};

export function ExecutionTimelineListPane({
    listRef,
    filter,
    searchQuery,
    visibleEvents,
    selectedEventId,
    debateMode,
    canLoadOlder,
    historyLoading,
    pageCount,
    pageTotal,
    onFilterChange,
    onSearchChange,
    onLoadOlder,
    onSelectEvent,
}: ExecutionTimelineListPaneProps) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
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
                        onClick={() => onFilterChange(item)}
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
                    onChange={(event) => onSearchChange(event.target.value)}
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

            <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px' }}>
                {canLoadOlder && (
                    <button
                        onClick={onLoadOlder}
                        disabled={historyLoading}
                        style={{
                            width: '100%',
                            border: 'none',
                            borderRadius: 'var(--radius-sm)',
                            marginBottom: '6px',
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

                {!visibleEvents.length && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '8px' }}>
                        当前筛选下暂无事件。
                    </div>
                )}

                {visibleEvents.map((event) => {
                    const active = event.event_id === selectedEventId;
                    return (
                        <button
                            key={event.event_id}
                            data-event-id={event.event_id}
                            onClick={() => onSelectEvent(event.event_id)}
                            style={{
                                width: '100%',
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
                                    {summarizeEvent(event, debateMode)}
                                </div>
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
