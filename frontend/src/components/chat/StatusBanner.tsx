/**
 * StatusBanner - collapsible runtime status indicator.
 * Default state is collapsed to reduce top-bar space usage.
 */

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useRuntimeViewState } from '../../hooks/useDebateViewState';
import { getEventNode } from '../../utils/runtime/eventFocus';
import { getLiveGraphNodeLabel } from '../../utils/viz/liveGraph';
import { deriveRuntimeViewState } from '../../utils/runtime/replay';

const PHASE_LABELS: Record<string, string> = {
    idle: '空闲',
    initializing: '初始化',
    context: '上下文',
    preparing: '准备',
    speaking: '发言',
    fact_checking: '核查',
    judging: '评估',
    advancing: '推进',
    processing: '处理中',
    complete: '完成',
    error: '错误',
};

export default function StatusBanner() {
    const {
        sessionStatus,
        isDebating,
        phase,
        currentStatus,
        currentNode,
        runtimeEventCount,
        visibleRuntimeEvents,
        focusedRuntimeEventId,
        replayEnabled,
        replayCursor,
    } = useRuntimeViewState();
    const [expanded, setExpanded] = useState(false);

    const focusedEvent = useMemo(
        () => (
            focusedRuntimeEventId
                ? visibleRuntimeEvents.find((event) => event.event_id === focusedRuntimeEventId) ?? null
                : null
        ),
        [focusedRuntimeEventId, visibleRuntimeEvents],
    );
    const liveFocusedEvent = replayEnabled ? focusedEvent : null;
    const latestVisibleEvent = useMemo(
        () => (visibleRuntimeEvents.length ? visibleRuntimeEvents[visibleRuntimeEvents.length - 1] : null),
        [visibleRuntimeEvents],
    );
    const replayEvent = focusedEvent ?? latestVisibleEvent;
    const replayView = useMemo(
        () => (
            replayEnabled
                ? deriveRuntimeViewState(visibleRuntimeEvents, {
                    phase,
                    status: currentStatus,
                    node: currentNode,
                    isDebating,
                })
                : null
        ),
        [currentNode, currentStatus, isDebating, phase, replayEnabled, visibleRuntimeEvents],
    );
    const replayCursorDisplay = Math.max(0, replayCursor + 1);
    const sessionIsRunning = isDebating;
    const resumableSession = !sessionIsRunning && sessionStatus === 'in_progress';
    const displayStatus = useMemo(
        () => (
            liveFocusedEvent
                ? `定位事件 #${liveFocusedEvent.seq} · ${liveFocusedEvent.type}`
                : replayEnabled
                    ? `回放 ${replayCursorDisplay}/${runtimeEventCount}${replayEvent ? ` · ${replayEvent.type}` : ''}`
                    : (
                        currentStatus
                        || (sessionIsRunning
                            ? '辩论进行中...'
                            : (resumableSession ? '历史进度已恢复，可继续辩论' : ''))
                    )
        ),
        [currentStatus, liveFocusedEvent, replayEnabled, replayCursorDisplay, replayEvent, resumableSession, runtimeEventCount, sessionIsRunning],
    );
    const focusedNodeLabel = useMemo(
        () => getLiveGraphNodeLabel(getEventNode(liveFocusedEvent ?? replayEvent)),
        [liveFocusedEvent, replayEvent],
    );

    const hasStatus = useMemo(
        () => (
            Boolean(displayStatus)
            || sessionIsRunning
            || !((!isDebating || phase === 'idle' || phase === 'complete') && !liveFocusedEvent && !replayEnabled)
        ),
        [displayStatus, isDebating, liveFocusedEvent, phase, replayEnabled, sessionIsRunning],
    );

    if (!hasStatus) {
        return null;
    }

    if (!expanded) {
        return (
            <button
                onClick={() => setExpanded(true)}
                style={{
                    border: 'none',
                    borderRadius: '999px',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    padding: '4px 8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    flexShrink: 0,
                }}
                title="展开状态栏"
            >
                <motion.span
                    animate={{ scale: [1, 1.2, 1], opacity: [1, 0.6, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                    style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: replayEnabled || liveFocusedEvent
                            ? 'var(--accent-indigo)'
                            : 'var(--accent-cyan)',
                    }}
                />
                <span style={{ fontSize: '11px', fontWeight: 600 }}>状态</span>
            </button>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexShrink: 0,
                maxWidth: '420px',
            }}
        >
            <motion.div
                animate={{ scale: [1, 1.2, 1], opacity: [1, 0.6, 1] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: replayEnabled || liveFocusedEvent
                        ? 'var(--accent-indigo)'
                        : 'var(--accent-cyan)',
                    flexShrink: 0,
                }}
            />
            <span
                style={{
                    color: 'var(--text-secondary)',
                    fontSize: '11px',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                }}
                title={displayStatus}
            >
                {displayStatus}
            </span>
            {replayEnabled && replayView && (
                <span
                    style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        color: 'var(--accent-cyan)',
                        background: 'var(--bg-tertiary)',
                        borderRadius: '999px',
                        padding: '2px 8px',
                    }}
                >
                    {PHASE_LABELS[replayView.phase] ?? replayView.phase}
                </span>
            )}
            {focusedNodeLabel && (
                <span
                    style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        color: 'var(--accent-indigo)',
                        background: 'var(--bg-tertiary)',
                        borderRadius: '999px',
                        padding: '2px 8px',
                    }}
                >
                    {focusedNodeLabel}
                </span>
            )}
            <button
                onClick={() => setExpanded(false)}
                style={{
                    marginLeft: 'auto',
                    border: 'none',
                    borderRadius: '999px',
                    width: '18px',
                    height: '18px',
                    cursor: 'pointer',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-secondary)',
                    fontSize: '11px',
                    lineHeight: 1,
                    flexShrink: 0,
                }}
                title="收起状态栏"
            >
                ×
            </button>
        </motion.div>
    );
}
