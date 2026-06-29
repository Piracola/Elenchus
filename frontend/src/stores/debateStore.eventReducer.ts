import type {
    DialogueEntry,
    ModeArtifact,
    RuntimeEvent,
    TurnScore,
} from '../types';
import {
    appendDialogueWithDedupe,
    appendModeArtifact,
    coerceSearchResults,
    getPayloadCitations,
    getPayloadNumber,
    getPayloadString,
    MAX_RUNTIME_EVENTS,
    normalizeDialogueEntryMetadata,
    sanitizeIncomingContent,
    sanitizeRuntimeEvent,
    shouldRecordRuntimeEvent,
} from '../utils/agent/debateStoreHelpers';
import type { DebateState } from './debateStore';

function createRecordedRuntimePatch(
    state: DebateState,
    event: RuntimeEvent,
): Partial<DebateState> {
    const patch: Partial<DebateState> = {
        lastEventSeq: event.seq >= 0 ? Math.max(state.lastEventSeq, event.seq) : state.lastEventSeq,
    };

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

function handleStatus(
    state: DebateState,
    payload: Record<string, unknown>,
): Partial<DebateState> {
    const patch: Partial<DebateState> = {};
    patch.phase = (payload.phase as DebateState['phase']) ?? getPayloadString(payload, 'phase') ?? 'processing';
    patch.isDebating =
        patch.phase !== 'idle' &&
        patch.phase !== 'complete' &&
        patch.phase !== 'error';
    patch.currentStatus = sanitizeIncomingContent(getPayloadString(payload, 'content')) || '';
    patch.currentNode = getPayloadString(payload, 'node') ?? '';
    if (state.currentSession && state.currentSession.status !== 'in_progress') {
        patch.currentSession = {
            ...state.currentSession,
            status: 'in_progress',
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
    _state: DebateState,
    payload: Record<string, unknown>,
): Partial<DebateState> {
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

function handleSpeechToken(
    state: DebateState,
    payload: Record<string, unknown>,
): Partial<DebateState> {
    const token = sanitizeIncomingContent(getPayloadString(payload, 'token')) ?? '';
    return token ? { streamingContent: state.streamingContent + token } : {};
}

function handleSpeechCancel(): Partial<DebateState> {
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

function handleFactCheckStart(): Partial<DebateState> {
    return {
        isDebating: true,
        phase: 'fact_checking',
        currentStatus: '正在核查事实...',
        currentNode: 'tool_executor',
    };
}

function handleFactCheckResult(
    _state: DebateState,
    payload: Record<string, unknown>,
): Partial<DebateState> {
    return {
        lastSearchResults: coerceSearchResults(payload),
        searchResultCount: getPayloadNumber(payload, 'count') ?? 0,
    };
}

function handleJudgeStart(): Partial<DebateState> {
    return {
        isDebating: true,
        phase: 'judging',
        currentStatus: '裁判评估中...',
        currentNode: 'judge',
    };
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
    if (!state.currentSession) return { isDebating: true };
    const turn = getPayloadNumber(payload, 'turn');
    const cumulativeRaw = payload.cumulative_scores;
    return {
        isDebating: true,
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

// ── Event handler registry ─────────────────────────────────────

const eventHandlers: Record<string, EventHandler> = {
    system: handleSystem,
    mode_notice: handleSystem,
    status: handleStatus,
    consensus_summary: handleConsensusSummary,
    speech_start: handleSpeechStart,
    speech_token: handleSpeechToken,
    speech_cancel: handleSpeechCancel,
    speech_end: handleSpeechEnd,
    sophistry_round_report: handleSophistryReport,
    sophistry_final_report: handleSophistryReport,
    fact_check_start: handleFactCheckStart,
    fact_check_result: handleFactCheckResult,
    judge_start: handleJudgeStart,
    judge_score: handleJudgeScore,
    turn_complete: handleTurnComplete,
    debate_complete: handleDebateComplete,
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

    if (state.currentSession && event.session_id && event.session_id !== state.currentSession.id) {
        return {};
    }

    if (state.runtimeEvents.some((item) => item.event_id === event.event_id)) {
        return {};
    }

    if (event.seq >= 0 && event.seq <= state.lastEventSeq) {
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
