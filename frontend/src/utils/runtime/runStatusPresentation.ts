import type { DebatePhase, RunStatus } from '../../types';

export type RunProgressPresentation = {
    isDebating: boolean;
    phase: DebatePhase;
};

/**
 * Single source of truth for "what does this run status mean on screen".
 *
 * Both the run-summary path (setActiveRun) and the live event path
 * (run_status_changed) go through here; they previously disagreed about
 * `stopping`, so the UI flipped between "debating" and "stopping" depending on
 * which path last wrote the state.
 */
export function runStatusToProgress(status: RunStatus | null | undefined): RunProgressPresentation {
    switch (status) {
        case null:
        case undefined:
            return { isDebating: false, phase: 'idle' };
        case 'completed':
            return { isDebating: false, phase: 'complete' };
        case 'failed':
            return { isDebating: false, phase: 'error' };
        case 'stalled':
        case 'cancelled':
            return { isDebating: false, phase: 'idle' };
        case 'stopping':
            // The task is winding down: keep a progress phase but stop treating
            // the run as live so intervention affordances settle.
            return { isDebating: false, phase: 'processing' };
        case 'running':
            return { isDebating: true, phase: 'processing' };
        default:
            return { isDebating: true, phase: 'initializing' };
    }
}

/** Default status text per run status, used when no message came with the run. */
export function runStatusFallbackMessage(status: RunStatus | null | undefined): string {
    switch (status) {
        case 'completed':
            return '辩论已完成';
        case 'failed':
            return '运行中断，请查看最新消息';
        case 'stalled':
            return '历史进度已恢复，可以继续辩论';
        case 'cancelled':
            return '辩论已停止';
        case 'stopping':
            return '正在停止辩论...';
        default:
            return '';
    }
}
