/**
 * StatusBanner - collapsible runtime status indicator.
 * Default state is collapsed to reduce top-bar space usage.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useDebateStore } from '../../stores/debateStore';
import { getEventNode } from '../../utils/eventFocus';
import { getLiveGraphNodeLabel } from '../../utils/liveGraph';
import { deriveRuntimeViewState } from '../../utils/replay';

const PHASE_LABELS: Record<string, string> = {
    idle: '空闲',
    speaking: '发言',
    fact_checking: '核查',
    judging: '评估',
    advancing: '推进',
    complete: '完成',
    error: '错误',
};

export default function StatusBanner() {
    const {
        isDebating,
        phase,
        currentStatus,
        currentNode,
        runtimeEvents,
        visibleRuntimeEvents,
        focusedRuntimeEventId,
        replayEnabled,
        replayCursor,
    } = useDebateStore();
    const [expanded, setExpanded] = useState(false);

    const focusedEvent = focusedRuntimeEventId
        ? visibleRuntimeEvents.find((event) => event.event_id === focusedRuntimeEventId) ?? null
        : null;
    const latestVisibleEvent = visibleRuntimeEvents.length
        ? visibleRuntimeEvents[visibleRuntimeEvents.length - 1]
        : null;
    const replayEvent = focusedEvent ?? latestVisibleEvent;
    const replayView = replayEnabled
        ? deriveRuntimeViewState(visibleRuntimeEvents, {
            phase,
            status: currentStatus,
            node: currentNode,
            isDebating,
        })
        : null;
    const replayCursorDisplay = Math.max(0, replayCursor + 1);
    const displayStatus = focusedEvent
        ? `定位事件 #${focusedEvent.seq} · ${focusedEvent.type}`
        : replayEnabled
            ? `回放 ${replayCursorDisplay}/${runtimeEvents.length}${replayEvent ? ` · ${replayEvent.type}` : ''}`
            : currentStatus;
    const focusedNodeLabel = getLiveGraphNodeLabel(getEventNode(focusedEvent ?? replayEvent));

    const hasStatus =
        !((!isDebating || phase === 'idle' || phase === 'complete') && !focusedEvent && !replayEnabled);

    useEffect(() => {
        if (!hasStatus) {
            setExpanded(false);
        }
    }, [hasStatus]);

    if (!hasStatus) {
        return null;
    }

    if (!expanded) {
        return (
            <button
                onClick={() => setExpanded(true)}
                style={{
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '999px',
                    background: 'var(--bg-card)',
                    color: 'var(--text-secondary)',
                    padding: '7px 10px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '7px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                    backdropFilter: 'blur(12px)',
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
                        background: replayEnabled || focusedEvent
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
                padding: '10px 12px',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-xl)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                border: '1px solid var(--border-subtle)',
                boxShadow: focusedEvent
                    ? '0 4px 20px rgba(99, 102, 241, 0.16)'
                    : '0 4px 20px rgba(0,0,0,0.08)',
                backdropFilter: 'blur(12px)',
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
                    background: replayEnabled || focusedEvent
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
