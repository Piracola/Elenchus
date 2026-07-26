import type {
    DialogueEntry,
    ModeArtifact,
    RuntimeEvent,
    TokenUsageBucket,
    TokenUsageSummary,
    TurnScore,
} from '../types';
import {
    appendDialogueWithDedupe,
    appendModeArtifact,
    getPayloadCitations,
    getPayloadNumber,
    getPayloadString,
    MAX_RUNTIME_EVENTS,
    normalizeDialogueEntryMetadata,
    sanitizeIncomingContent,
    sanitizeRuntimeEvent,
    shouldRecordRuntimeEvent,
} from '../utils/agent/debateStoreHelpers';
import type { RunStatus } from '../types';
import {
    runStatusFallbackMessage,
    runStatusToProgress,
} from '../utils/runtime/runStatusPresentation';
import type { DebateState } from './debateStore';

function createRecordedRuntimePatch(
    state: DebateState,
    event: RuntimeEvent,
): Partial<DebateState> {
    const runId = event.run_id;
    const previousRunSeq = state.lastEventSeqByRun[runId] ?? -1;
    const nextSeq = event.seq >= 0 ? Math.max(previousRunSeq, event.seq) : previousRunSeq;
    const patch: Partial<DebateState> = {
        lastEventSeq: nextSeq,
        lastEventSeqByRun: {
            ...state.lastEventSeqByRun,
            [runId]: nextSeq,
        },
    };
    if (state.activeRun && runId && state.activeRun.id === runId && event.seq >= 0) {
        patch.activeRun = {
            ...state.activeRun,
            latest_seq: Math.max(state.activeRun.latest_seq ?? -1, event.seq),
        };
    }

    if (!shouldRecordRuntimeEvent(event)) {
        return patch;
    }

    const nextRuntimeEvents = state.runtimeEvents.concat(event);
    const didTrim = nextRuntimeEvents.length > MAX_RUNTIME_EVENTS;
    const trimmedEvents = didTrim
        ? nextRuntimeEvents.slice(-MAX_RUNTIME_EVENTS)
        : nextRuntimeEvents;

    patch.runtimeEvents = trimmedEvents;

    return patch;
}

function cloneNestedValue<T>(value: T): T {
    if (typeof structuredClone === 'function') {
        return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value)) as T;
}

// ── Event handler map (strategy pattern) ────────────────────────

type EventHandler = (state: DebateState, payload: Record<string, unknown>, event: RuntimeEvent) => Partial<DebateState>;

function handleSystem(): Partial<DebateState> {
    return {};
}

function isLifecycleRunning(status: string | undefined): boolean {
    return Boolean(status && ['pending', 'initializing', 'running', 'retrying', 'recovering', 'stopping'].includes(status));
}

function shouldApplyLiveProgress(state: DebateState): boolean {
    return !state.activeRun || isLifecycleRunning(state.activeRun.status);
}

function handleStatus(
    state: DebateState,
    payload: Record<string, unknown>,
    event: RuntimeEvent,
): Partial<DebateState> {
    if (!shouldApplyLiveProgress(state)) {
        return {};
    }
    const patch: Partial<DebateState> = {};
    patch.phase = event.phase ?? (payload.phase as DebateState['phase']) ?? getPayloadString(payload, 'phase') ?? 'processing';
    patch.isDebating =
        patch.phase !== 'idle' &&
        patch.phase !== 'complete' &&
        patch.phase !== 'error';
    patch.currentStatus = sanitizeIncomingContent(getPayloadString(payload, 'content')) || '';
    patch.currentNode = getPayloadString(payload, 'node') ?? '';
    return patch;
}

function handleRunStatusChanged(
    state: DebateState,
    payload: Record<string, unknown>,
): Partial<DebateState> {
    const nextStatus = getPayloadString(payload, 'status');
    const currentStatus = sanitizeIncomingContent(getPayloadString(payload, 'content')) || '';
    const patch: Partial<DebateState> = {};

    if (state.activeRun && nextStatus) {
        patch.activeRun = {
            ...state.activeRun,
            status: nextStatus as typeof state.activeRun.status,
            last_status_message: currentStatus || state.activeRun.last_status_message,
            last_error_message:
                nextStatus === 'failed'
                    ? (currentStatus || state.activeRun.last_error_message || null)
                    : nextStatus === 'stalled'
                        ? null
                        : state.activeRun.last_error_message,
        };
    }

    // Terminal and winding-down statuses share their presentation rules with
    // the run-summary path so both cannot disagree.
    if (nextStatus && nextStatus !== 'running') {
        const progress = runStatusToProgress(nextStatus as RunStatus);
        const fallback = runStatusFallbackMessage(nextStatus as RunStatus);
        if (fallback || progress.phase !== 'initializing') {
            patch.isDebating = progress.isDebating;
            patch.phase = progress.phase;
            patch.currentStatus = currentStatus || fallback;
        }
    }

    if (state.currentSession && nextStatus) {
        patch.currentSession = {
            ...state.currentSession,
            status:
                nextStatus === 'completed'
                    ? 'completed'
                    : nextStatus === 'failed' || nextStatus === 'stalled'
                        ? (nextStatus === 'stalled' ? 'pending' : 'error')
                        : nextStatus === 'cancelled'
                            ? 'pending'
                            : 'in_progress',
        };
    }

    return patch;
}

function handleConsensusSummary(
    state: DebateState,
    payload: Record<string, unknown>,
    event: RuntimeEvent,
): Partial<DebateState> {
    if (!state.currentSession) return {};
    const entry: DialogueEntry = {
        role: getPayloadString(payload, 'role') ?? 'consensus_summary',
        agent_name: getPayloadString(payload, 'agent_name') ?? '共识收敛员',
        content: sanitizeIncomingContent(getPayloadString(payload, 'content')),
        citations: getPayloadCitations(payload),
        timestamp: event.timestamp || new Date().toISOString(),
        event_id: event.event_id,
        turn: getPayloadNumber(payload, 'turn'),
        discussion_kind: getPayloadString(payload, 'discussion_kind') ?? 'consensus',
    };

    return {
        streamingRole: '',
        streamingContent: '',
        streamingEntry: null,
        currentSession: {
            ...state.currentSession,
            dialogue_history: appendDialogueWithDedupe(
                state.currentSession.dialogue_history,
                entry,
            ),
        },
    };
}

function handleSpeechStart(
    state: DebateState,
    payload: Record<string, unknown>,
): Partial<DebateState> {
    if (!shouldApplyLiveProgress(state)) {
        return {};
    }
    const role = getPayloadString(payload, 'role') ?? '';
    return {
        isDebating: true,
        streamingRole: role,
        streamingContent: '',
        streamingEntry: {
            role,
            agent_name: getPayloadString(payload, 'agent_name') ?? role,
            content: '',
            citations: [],
            timestamp: '',
            turn: getPayloadNumber(payload, 'turn'),
        },
    };
}

function handleGroupDiscussion(
    state: DebateState,
    payload: Record<string, unknown>,
    event: RuntimeEvent,
): Partial<DebateState> {
    if (!state.currentSession) return {};
    const entry: DialogueEntry = {
        role: getPayloadString(payload, 'role') ?? 'group_discussion',
        agent_name: getPayloadString(payload, 'agent_name') ?? '组内讨论',
        content: sanitizeIncomingContent(getPayloadString(payload, 'content')),
        citations: getPayloadCitations(payload),
        timestamp: event.timestamp || new Date().toISOString(),
        event_id: event.event_id,
        turn: getPayloadNumber(payload, 'turn'),
        discussion_kind: getPayloadString(payload, 'discussion_kind') ?? 'group_discussion',
    };
    const discussionRound = getPayloadNumber(payload, 'discussion_round');
    if (discussionRound !== undefined) {
        entry.discussion_round = discussionRound;
    }

    return {
        currentSession: {
            ...state.currentSession,
            dialogue_history: appendDialogueWithDedupe(
                state.currentSession.dialogue_history,
                entry,
            ),
        },
    };
}

function handleSpeechToken(
    state: DebateState,
    payload: Record<string, unknown>,
): Partial<DebateState> {
    if (!shouldApplyLiveProgress(state)) {
        return {};
    }
    const token = sanitizeIncomingContent(getPayloadString(payload, 'token')) ?? '';
    return token ? { streamingContent: state.streamingContent + token } : {};
}

function handleSpeechCancel(state: DebateState): Partial<DebateState> {
    if (!shouldApplyLiveProgress(state)) {
        return {};
    }
    return { streamingRole: '', streamingContent: '', streamingEntry: null };
}

function handleSpeechEnd(
    state: DebateState,
    payload: Record<string, unknown>,
    event: RuntimeEvent,
): Partial<DebateState> {
    const patch: Partial<DebateState> = { streamingRole: '', streamingContent: '', streamingEntry: null };
    if (!state.currentSession) return patch;

    const entry: DialogueEntry = {
        role: getPayloadString(payload, 'role') ?? '',
        agent_name: getPayloadString(payload, 'agent_name') ?? getPayloadString(payload, 'role') ?? '',
        content: sanitizeIncomingContent(getPayloadString(payload, 'content')),
        citations: getPayloadCitations(payload),
        metadata: normalizeDialogueEntryMetadata(
            typeof payload.metadata === 'object' && payload.metadata !== null
                ? (payload.metadata as DialogueEntry['metadata'])
                : undefined,
        ),
        timestamp: event.timestamp || new Date().toISOString(),
        event_id: event.event_id,
        turn: getPayloadNumber(payload, 'turn'),
    };

    patch.currentSession = {
        ...state.currentSession,
        dialogue_history: appendDialogueWithDedupe(state.currentSession.dialogue_history, entry),
    };
    return patch;
}

function handleSophistryReport(
    state: DebateState,
    payload: Record<string, unknown>,
    event: RuntimeEvent,
): Partial<DebateState> {
    const patch: Partial<DebateState> = { streamingRole: '', streamingContent: '', streamingEntry: null };
    if (!state.currentSession) return patch;

    const reportRaw = payload.report;
    const artifact = typeof reportRaw === 'object' && reportRaw !== null
        ? (reportRaw as ModeArtifact)
        : null;
    const entry: DialogueEntry = {
        role: getPayloadString(payload, 'role') ?? event.type,
        agent_name: getPayloadString(payload, 'agent_name') ?? '观察报告',
        content: sanitizeIncomingContent(getPayloadString(payload, 'content')),
        citations: getPayloadCitations(payload),
        timestamp: event.timestamp || new Date().toISOString(),
        event_id: event.event_id,
        turn: getPayloadNumber(payload, 'turn'),
        source_turn: getPayloadNumber(payload, 'source_turn'),
        source_roles: Array.isArray(payload.source_roles)
            ? payload.source_roles.filter((item): item is string => typeof item === 'string')
            : undefined,
    };

    patch.currentSession = {
        ...state.currentSession,
        dialogue_history: appendDialogueWithDedupe(
            state.currentSession.dialogue_history,
            entry,
        ),
        mode_artifacts: artifact
            ? appendModeArtifact(state.currentSession.mode_artifacts ?? [], cloneNestedValue(artifact))
            : (state.currentSession.mode_artifacts ?? []),
        current_mode_report: event.type === 'sophistry_round_report'
            ? (artifact ? cloneNestedValue(artifact) : state.currentSession.current_mode_report ?? null)
            : (state.currentSession.current_mode_report ?? null),
        final_mode_report: event.type === 'sophistry_final_report'
            ? (artifact ? cloneNestedValue(artifact) : state.currentSession.final_mode_report ?? null)
            : (state.currentSession.final_mode_report ?? null),
    };
    return patch;
}

function handleJudgeScore(
    state: DebateState,
    payload: Record<string, unknown>,
    event: RuntimeEvent,
): Partial<DebateState> {
    if (!state.currentSession) return {};
    const role = getPayloadString(payload, 'role');
    const turn = getPayloadNumber(payload, 'turn');
    const scoresRaw = payload.scores;
    if (!role || typeof scoresRaw !== 'object' || scoresRaw === null) {
        return {};
    }
    const scores = scoresRaw as TurnScore;
    const judgeEntry: DialogueEntry = {
        role: 'judge',
        target_role: role,
        turn,
        agent_name: '裁判组视角',
        content: sanitizeIncomingContent(scores.overall_comment),
        scores,
        timestamp: event.timestamp || new Date().toISOString(),
        citations: [],
        event_id: event.event_id,
    };

    return {
        currentSession: {
            ...state.currentSession,
            current_scores: {
                ...state.currentSession.current_scores,
                [role]: cloneNestedValue(scores),
            },
            dialogue_history: appendDialogueWithDedupe(
                state.currentSession.dialogue_history,
                judgeEntry,
            ),
        },
    };
}

function handleTurnComplete(
    state: DebateState,
    payload: Record<string, unknown>,
): Partial<DebateState> {
    const livePatch = shouldApplyLiveProgress(state) ? { isDebating: true } : {};
    if (!state.currentSession) return livePatch;
    const turn = getPayloadNumber(payload, 'turn');
    const cumulativeRaw = payload.cumulative_scores;
    return {
        ...livePatch,
        currentSession: {
            ...state.currentSession,
            current_turn: turn ?? state.currentSession.current_turn,
            cumulative_scores:
                typeof cumulativeRaw === 'object' && cumulativeRaw !== null
                    ? cloneNestedValue(cumulativeRaw as Record<string, Record<string, number[]>>)
                    : state.currentSession.cumulative_scores,
        },
    };
}

function handleDebateComplete(
    state: DebateState,
    payload: Record<string, unknown>,
): Partial<DebateState> {
    if (!state.currentSession) {
        return { isDebating: false, phase: 'complete', currentStatus: '辩论已完成' };
    }
    const totalTurns = getPayloadNumber(payload, 'total_turns') ?? state.currentSession.current_turn;
    const finalScoresRaw = payload.final_scores;
    const finalReportRaw = payload.final_report;
    return {
        isDebating: false,
        phase: 'complete',
        currentStatus: '辩论已完成',
        activeRun: state.activeRun
            ? {
                ...state.activeRun,
                status: 'completed',
                current_turn: totalTurns,
                last_status_message: '辩论已完成',
            }
            : state.activeRun,
        currentSession: {
            ...state.currentSession,
            status: 'completed',
            current_turn: totalTurns,
            cumulative_scores:
                typeof finalScoresRaw === 'object' && finalScoresRaw !== null
                    ? cloneNestedValue(finalScoresRaw as Record<string, Record<string, number[]>>)
                    : state.currentSession.cumulative_scores,
            final_mode_report:
                typeof finalReportRaw === 'object' && finalReportRaw !== null
                    ? cloneNestedValue(finalReportRaw as Record<string, unknown>)
                    : (state.currentSession.final_mode_report ?? null),
        },
    };
}

function handleError(
    state: DebateState,
    payload: Record<string, unknown>,
    event: RuntimeEvent,
): Partial<DebateState> {
    const currentStatus = sanitizeIncomingContent(getPayloadString(payload, 'content')) || '出现错误';
    const patch: Partial<DebateState> = {
        phase: 'error',
        currentStatus,
        isDebating: false,
    };
    if (state.activeRun) {
        patch.activeRun = {
            ...state.activeRun,
            status: 'failed',
            last_status_message: currentStatus,
            last_error_message: currentStatus,
        };
    }
    if (!state.currentSession) return patch;

    const errorEntry: DialogueEntry = {
        role: 'error',
        content: currentStatus,
        timestamp: event.timestamp || new Date().toISOString(),
        citations: [],
        event_id: event.event_id,
        agent_name: '系统错误',
    };
    patch.currentSession = {
        ...state.currentSession,
        status: 'error',
        dialogue_history: appendDialogueWithDedupe(
            state.currentSession.dialogue_history,
            errorEntry,
        ),
    };
    return patch;
}

function handleAudienceMessage(
    state: DebateState,
    payload: Record<string, unknown>,
    event: RuntimeEvent,
): Partial<DebateState> {
    if (!state.currentSession) return {};
    const audienceEntry: DialogueEntry = {
        role: 'audience',
        content: sanitizeIncomingContent(getPayloadString(payload, 'content')),
        timestamp: getPayloadString(payload, 'timestamp') ?? event.timestamp ?? new Date().toISOString(),
        citations: [],
        event_id: event.event_id,
        agent_name: '观众发言',
    };
    return {
        currentSession: {
            ...state.currentSession,
            dialogue_history: appendDialogueWithDedupe(
                state.currentSession.dialogue_history,
                audienceEntry,
            ),
        },
    };
}

const EMPTY_TOKEN_BUCKET: TokenUsageBucket = {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    calls: 0,
};

function addToBucket(
    bucket: TokenUsageBucket | undefined,
    input: number,
    output: number,
    total: number,
): TokenUsageBucket {
    const base = bucket ?? EMPTY_TOKEN_BUCKET;
    return {
        input_tokens: base.input_tokens + input,
        output_tokens: base.output_tokens + output,
        total_tokens: base.total_tokens + total,
        calls: base.calls + 1,
    };
}

function handleTokenUsage(
    state: DebateState,
    payload: Record<string, unknown>,
): Partial<DebateState> {
    const input = getPayloadNumber(payload, 'input_tokens') ?? 0;
    const output = getPayloadNumber(payload, 'output_tokens') ?? 0;
    const total = getPayloadNumber(payload, 'total_tokens') ?? input + output;
    if (input <= 0 && output <= 0 && total <= 0) return {};

    const roleKey =
        getPayloadString(payload, 'role')
        || getPayloadString(payload, 'node')
        || 'other';
    const previous: TokenUsageSummary = state.tokenUsage ?? {
        total: EMPTY_TOKEN_BUCKET,
        by_role: {},
    };
    return {
        tokenUsage: {
            total: addToBucket(previous.total, input, output, total),
            by_role: {
                ...previous.by_role,
                [roleKey]: addToBucket(previous.by_role[roleKey], input, output, total),
            },
        },
    };
}

// ── Event handler registry ─────────────────────────────────────

const eventHandlers: Record<string, EventHandler> = {
    system: handleSystem,
    mode_notice: handleSystem,
    status: handleStatus,
    run_status_changed: handleRunStatusChanged,
    consensus_summary: handleConsensusSummary,
    group_discussion: handleGroupDiscussion,
    speech_start: handleSpeechStart,
    speech_token: handleSpeechToken,
    speech_cancel: handleSpeechCancel,
    speech_end: handleSpeechEnd,
    sophistry_round_report: handleSophistryReport,
    sophistry_final_report: handleSophistryReport,
    judge_score: handleJudgeScore,
    turn_complete: handleTurnComplete,
    debate_complete: handleDebateComplete,
    token_usage: handleTokenUsage,
    error: handleError,
    audience_message: handleAudienceMessage,
};

export function applyRuntimeEventPatch(
    state: DebateState,
    rawEvent: RuntimeEvent,
): Partial<DebateState> {
    const event = sanitizeRuntimeEvent(rawEvent);
    if (event.type === 'pong') {
        return {};
    }

    if (!event.run_id) {
        return {};
    }

    if (state.currentSession && event.session_id && event.session_id !== state.currentSession.id) {
        return {};
    }

    if (state.activeRunId && event.run_id && event.run_id !== state.activeRunId) {
        return {};
    }

    // Only events that actually enter the ring buffer need the duplicate scan.
    // Streaming tokens are never recorded, so scanning for them once per token
    // was an O(n) walk over up to MAX_RUNTIME_EVENTS entries per keystroke.
    if (
        shouldRecordRuntimeEvent(event)
        && state.runtimeEvents.some((item) => item.event_id === event.event_id)
    ) {
        return {};
    }

    const runId = event.run_id;
    const previousSeq = state.lastEventSeqByRun[runId] ?? -1;
    if (event.seq >= 0 && event.seq <= previousSeq) {
        return {};
    }

    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const patch = createRecordedRuntimePatch(state, event);

    const handler = eventHandlers[event.type];
    if (handler) {
        Object.assign(patch, handler(state, payload, event));
    }

    return patch;
}
