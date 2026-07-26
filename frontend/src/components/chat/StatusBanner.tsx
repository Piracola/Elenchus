import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, CheckCircle2, CircleDashed, Loader2, PauseCircle } from 'lucide-react';
import type { DebatePhase, RunStatus } from '../../types';
import { useRuntimeViewState } from '../../hooks/useDebateViewState';
import { TRANSITION } from '../../config/motion';

const NODE_LABELS: Record<string, string> = {
    manage_context: '整理上下文',
    set_speaker: '切换发言',
    speaker: '辩手发言',
    tool_executor: '事实核查',
    judge: '裁判评分',
    advance_turn: '推进回合',
    consensus: '生成共识',
    sophistry_speaker: '诡辩发言',
    sophistry_observer: '观察报告',
    sophistry_postmortem: '实验总览',
    end: '收束完成',
};

const PHASE_LABELS: Record<DebatePhase, string> = {
    idle: '空闲',
    initializing: '准备',
    context: '整理',
    preparing: '准备',
    speaking: '生成回复',
    fact_checking: '核查',
    judging: '评估',
    advancing: '推进',
    processing: '处理',
    complete: '完成',
    error: '异常',
};

type StatusTone = 'idle' | 'running' | 'paused' | 'complete' | 'error';

type StatusViewModel = {
    tone: StatusTone;
    phaseLabel: string;
    nodeLabel: string;
    message: string;
    title: string;
    show: boolean;
};

function getNodeLabel(nodeId: string | null | undefined): string {
    if (!nodeId) return '';
    return NODE_LABELS[nodeId] ?? nodeId;
}

function getPhaseLabel(phase: DebatePhase): string {
    return PHASE_LABELS[phase] ?? '处理';
}

function getFallbackMessage({
    phase,
    isDebating,
    resumableSession,
}: {
    phase: DebatePhase;
    isDebating: boolean;
    resumableSession: boolean;
}): string {
    if (resumableSession) return '历史进度已恢复，可以继续辩论';
    if (phase === 'complete') return '辩论已完成';
    if (phase === 'error') return '运行中断，请查看最新消息';
    if (!isDebating) return '';
    if (phase === 'speaking') return '正在生成消息';
    if (phase === 'fact_checking') return '正在核查事实';
    if (phase === 'judging') return '正在评估本轮表现';
    if (phase === 'context') return '正在整理上下文';
    return '系统正在处理';
}

function getTone({
    phase,
    isDebating,
    resumableSession,
}: {
    phase: DebatePhase;
    isDebating: boolean;
    resumableSession: boolean;
}): StatusTone {
    if (phase === 'error') return 'error';
    if (phase === 'complete') return 'complete';
    if (resumableSession) return 'paused';
    if (isDebating) return 'running';
    return 'idle';
}

function buildStatusViewModel({
    sessionStatus,
    runStatus,
    isDebating,
    phase,
    currentStatus,
    currentNode,
}: {
    sessionStatus: string | null;
    runStatus: RunStatus | null;
    isDebating: boolean;
    phase: DebatePhase;
    currentStatus: string;
    currentNode: string;
}): StatusViewModel {
    const resumableSession = !isDebating && (
        runStatus === 'stalled' || (!runStatus && sessionStatus === 'in_progress')
    );
    const tone = getTone({ phase, isDebating, resumableSession });
    const message = currentStatus || getFallbackMessage({ phase, isDebating, resumableSession });
    const nodeLabel = getNodeLabel(currentNode);
    const phaseLabel = getPhaseLabel(phase);
    const show = Boolean(message) || isDebating || resumableSession || phase === 'error' || phase === 'complete';
    const titleParts = [phaseLabel, nodeLabel, message].filter(Boolean);

    return {
        tone,
        phaseLabel,
        nodeLabel,
        message,
        title: titleParts.join(' · '),
        show,
    };
}

function getToneStyles(tone: StatusTone) {
    if (tone === 'error') {
        return {
            color: 'var(--accent-rose)',
            background: 'var(--accent-rose-alpha)',
            border: 'color-mix(in srgb, var(--accent-rose) 28%, var(--border-subtle))',
        };
    }
    if (tone === 'complete') {
        return {
            color: 'var(--accent-emerald)',
            background: 'var(--accent-emerald-alpha)',
            border: 'color-mix(in srgb, var(--accent-emerald) 28%, var(--border-subtle))',
        };
    }
    if (tone === 'paused') {
        return {
            color: 'var(--accent-amber)',
            background: 'var(--accent-amber-alpha)',
            border: 'color-mix(in srgb, var(--accent-amber) 30%, var(--border-subtle))',
        };
    }
    if (tone === 'running') {
        return {
            color: 'var(--accent-cyan)',
            background: 'color-mix(in srgb, var(--accent-cyan) 12%, var(--bg-secondary))',
            border: 'color-mix(in srgb, var(--accent-cyan) 30%, var(--border-subtle))',
        };
    }
    return {
        color: 'var(--text-muted)',
        background: 'var(--bg-tertiary)',
        border: 'var(--border-subtle)',
    };
}

function StatusIcon({ tone }: { tone: StatusTone }) {
    const reducedMotion = useReducedMotion();
    if (tone === 'error') return <AlertCircle size={13} />;
    if (tone === 'complete') return <CheckCircle2 size={13} />;
    if (tone === 'paused') return <PauseCircle size={13} />;
    if (tone === 'running') {
        return (
            <Loader2
                size={13}
                style={{
                    animation: reducedMotion ? 'none' : 'spin 1s linear infinite',
                }}
            />
        );
    }
    return <CircleDashed size={13} />;
}

export default function StatusBanner() {
    const {
        sessionStatus,
        runStatus,
        isDebating,
        phase,
        currentStatus,
        currentNode,
    } = useRuntimeViewState();

    const viewModel = useMemo(
        () => buildStatusViewModel({
            sessionStatus,
            runStatus,
            isDebating,
            phase,
            currentStatus,
            currentNode,
        }),
        [currentNode, currentStatus, isDebating, phase, runStatus, sessionStatus],
    );

    const toneStyles = getToneStyles(viewModel.tone);
    const isRunning = viewModel.tone === 'running';

    // The live region is rendered unconditionally: a region inserted at the same
    // moment its text appears is not reliably announced, and the visual banner
    // does come and go. The banner's own spans are hidden from the reader so the
    // phase, node, and message arrive as one sentence instead of three.
    const liveRegion = (
        <span className="sr-only" role="status" aria-live="polite">
            {viewModel.show ? viewModel.title : ''}
        </span>
    );

    if (!viewModel.show) {
        return liveRegion;
    }

    return (
        <>
        {liveRegion}
        <motion.div
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            transition={TRANSITION.normal}
            title={viewModel.title}
            aria-hidden="true"
            style={{
                height: 30,
                minWidth: 0,
                maxWidth: 520,
                display: 'inline-grid',
                gridTemplateColumns: 'auto minmax(0, auto) auto minmax(0, 1fr)',
                alignItems: 'center',
                columnGap: 7,
                padding: '0 10px',
                borderRadius: 'var(--radius-full)',
                border: `1px solid ${toneStyles.border}`,
                background: toneStyles.background,
                color: toneStyles.color,
                boxShadow: isRunning ? '0 0 0 1px color-mix(in srgb, var(--accent-cyan) 8%, transparent)' : 'none',
                overflow: 'hidden',
            }}
        >
            <span
                style={{
                    width: 16,
                    height: 16,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                }}
            >
                <StatusIcon tone={viewModel.tone} />
            </span>

            <span
                style={{
                    color: 'var(--text-primary)',
                    fontSize: 11,
                    fontWeight: 700,
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                }}
            >
                {viewModel.phaseLabel}
            </span>

            {viewModel.nodeLabel && (
                <span
                    style={{
                        color: toneStyles.color,
                        fontSize: 10,
                        fontWeight: 700,
                        lineHeight: 1,
                        padding: '3px 6px',
                        borderRadius: 'var(--radius-full)',
                        background: 'color-mix(in srgb, currentColor 11%, transparent)',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {viewModel.nodeLabel}
                </span>
            )}

            <span
                style={{
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: 'var(--text-secondary)',
                    fontSize: 11,
                    fontWeight: 500,
                    lineHeight: 1.2,
                }}
            >
                {viewModel.message}
            </span>
        </motion.div>
        </>
    );
}
