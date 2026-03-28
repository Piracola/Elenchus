import type { RuntimeEvent } from '../../../types';
import { eventColor, formatJson, formatTime, pillStyle } from './shared';

type ExecutionTimelineDetailPaneProps = {
    currentSessionId: string | null;
    runtimeEvents: RuntimeEvent[];
    replayEnabled: boolean;
    replayCursor: number;
    selectedEvent: RuntimeEvent | null;
    selectedNodeLabel: string;
    replayProgress: string;
    canReplayStep: boolean;
    replayAtStart: boolean;
    replayAtEnd: boolean;
    snapshotLoading: boolean;
    onReplayEnabledChange: (enabled: boolean) => void;
    onStepReplay: (offset: number) => void;
    onExitReplay: () => void;
    onLoadFullReplay: () => void;
    onExport: () => void;
    onImport: () => void;
    onReplayCursorChange: (cursor: number) => void;
};

export function ExecutionTimelineDetailPane({
    currentSessionId,
    runtimeEvents,
    replayEnabled,
    replayCursor,
    selectedEvent,
    selectedNodeLabel,
    replayProgress,
    canReplayStep,
    replayAtStart,
    replayAtEnd,
    snapshotLoading,
    onReplayEnabledChange,
    onStepReplay,
    onExitReplay,
    onLoadFullReplay,
    onExport,
    onImport,
    onReplayCursorChange,
}: ExecutionTimelineDetailPaneProps) {
    return (
        <div
            style={{
                borderLeft: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
                minHeight: 0,
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
                    onClick={() => onReplayEnabledChange(!replayEnabled)}
                    style={{
                        ...pillStyle,
                        color: replayEnabled ? '#fff' : 'var(--text-secondary)',
                        background: replayEnabled ? 'var(--accent-cyan)' : 'var(--bg-tertiary)',
                    }}
                >
                    {replayEnabled ? '回放已开' : '回放已关'}
                </button>
                <button
                    onClick={() => onStepReplay(-1)}
                    disabled={!canReplayStep || replayAtStart}
                    style={{
                        ...pillStyle,
                        opacity: canReplayStep && !replayAtStart ? 1 : 0.5,
                        cursor: canReplayStep ? 'pointer' : 'not-allowed',
                        color: 'var(--text-secondary)',
                        background: 'var(--bg-tertiary)',
                    }}
                >
                    上一步
                </button>
                <button
                    onClick={() => onStepReplay(1)}
                    disabled={!canReplayStep || replayAtEnd}
                    style={{
                        ...pillStyle,
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
                        onClick={onExitReplay}
                        style={{
                            ...pillStyle,
                            color: 'var(--text-secondary)',
                            background: 'var(--bg-tertiary)',
                        }}
                    >
                        返回实时
                    </button>
                )}
                {currentSessionId && (
                    <button
                        onClick={onLoadFullReplay}
                        disabled={snapshotLoading}
                        style={{
                            ...pillStyle,
                            color: 'var(--text-secondary)',
                            background: 'var(--bg-tertiary)',
                            opacity: snapshotLoading ? 0.7 : 1,
                            cursor: snapshotLoading ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {snapshotLoading ? '加载中...' : '整段回放'}
                    </button>
                )}
                <button
                    onClick={onExport}
                    disabled={snapshotLoading}
                    style={{
                        ...pillStyle,
                        marginLeft: 'auto',
                        color: 'var(--text-secondary)',
                        background: 'var(--bg-tertiary)',
                        opacity: snapshotLoading ? 0.7 : 1,
                        cursor: snapshotLoading ? 'not-allowed' : 'pointer',
                    }}
                >
                    {snapshotLoading ? '处理中...' : '导出'}
                </button>
                <button
                    onClick={onImport}
                    style={{
                        ...pillStyle,
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
                        onChange={(event) => onReplayCursorChange(Number(event.target.value))}
                        style={{ width: '100%' }}
                    />
                </div>
            )}

            <div
                style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    padding: '10px',
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                }}
            >
                <div style={{ marginBottom: '8px', color: 'var(--text-muted)' }}>{replayProgress}</div>
                {selectedEvent ? (
                    <>
                        <div style={{ marginBottom: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, color: eventColor(selectedEvent.type) }}>
                                {selectedEvent.type}
                            </span>
                            <span>序号：{selectedEvent.seq}</span>
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
                                    节点：{selectedNodeLabel}
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
    );
}
