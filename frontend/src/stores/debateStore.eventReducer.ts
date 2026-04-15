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
    sanitizeIncomingContent,
    sanitizeRuntimeEvent,
    shouldRecordRuntimeEvent,
} from '../utils/agent/debateStoreHelpers';
import { clampReplayCursor, getVisibleRuntimeEvents } from '../utils/runtime/replay';
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

    // Push instead of spread-copy to avoid O(n) array duplication
    const runtimeEvents = state.runtimeEvents;
    runtimeEvents.push(event);
    const didTrim = runtimeEvents.length > MAX_RUNTIME_EVENTS;
    const trimmedEvents = didTrim
        ? runtimeEvents.slice(-MAX_RUNTIME_EVENTS)
        : runtimeEvents;
    const nextReplayCursor = state.replayEnabled
        ? clampReplayCursor(state.replayCursor, trimmedEvents.length)
        : clampReplayCursor(trimmedEvents.length - 1, trimmedEvents.length);
    const visibleRuntimeEvents = getVisibleRuntimeEvents(
        trimmedEvents,
        state.replayEnabled,
        nextReplayCursor,
    );

    patch.runtimeEvents = trimmedEvents;
    patch.visibleRuntimeEvents = visibleRuntimeEvents;
    patch.replayCursor = nextReplayCursor;
    patch.hasOlderRuntimeEvents = state.hasOlderRuntimeEvents || didTrim;

    if (
        state.focusedRuntimeEventId &&
        !trimmedEvents.some((item) => item.event_id === state.focusedRuntimeEventId)
    ) {
        patch.focusedRuntimeEventId =
            state.replayEnabled && nextReplayCursor >= 0
                ? trimmedEvents[nextReplayCursor].event_id
                : null;
    } else if (state.replayEnabled && !state.focusedRuntimeEventId && nextReplayCursor >= 0) {
        patch.focusedRuntimeEventId = trimmedEvents[nextReplayCursor].event_id;
    }

    return patch;
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

function handleTeamDiscussion(
    state: DebateState,
    payload: Record<string, unknown>,
    event: RuntimeEvent,
): Partial<DebateState> {
    if (!state.currentSession) return {};
    const entry: DialogueEntry = {
        role: getPayloadString(payload, 'role') ?? (event.type === 'team_summary' ? 'team_summary' : 'team_member'),
        agent_name: getPayloadString(payload, 'agent_name') ?? '',
        content: sanitizeIncomingContent(getPayloadString(payload, 'content')),
        citations: getPayloadCitations(payload),
        timestamp: event.timestamp || new Date().toISOString(),
        event_id: event.event_id,
        turn: getPayloadNumber(payload, 'turn'),
        discussion_kind: getPayloadString(payload, 'discussion_kind'),
        team_side: getPayloadString(payload, 'team_side'),
        team_round: getPayloadNumber(payload, 'team_round'),
        team_member_index: getPayloadNumber(payload, 'team_member_index'),
        team_specialty: getPayloadString(payload, 'team_specialty'),
        source_role: getPayloadString(payload, 'source_role'),
    };

    return {
        currentSession: {
            ...state.currentSession,
            team_dialogue_history: appendDialogueWithDedupe(
                state.currentSession.team_dialogue_history,
                entry,
            ),
        },
    };
}

function handleJuryDiscussion(
    state: DebateState,
    payload: Record<string, unknown>,
    event: RuntimeEvent,
): Partial<DebateState> {
    if (!state.currentSession) return {};
    const fallbackRole =
        event.type === 'jury_summary'
            ? 'jury_summary'
            : event.type === 'consensus_summary'
                ? 'consensus_summary'
                : 'jury_member';
    const entry: DialogueEntry = {
        role: getPayloadString(payload, 'role') ?? fallbackRole,
        agent_name: getPayloadString(payload, 'agent_name') ?? '',
        content: sanitizeIncomingContent(getPayloadString(payload, 'content')),
        citations: getPayloadCitations(payload),
        timestamp: event.timestamp || new Date().toISOString(),
        event_id: event.event_id,
        turn: getPayloadNumber(payload, 'turn'),
        discussion_kind: getPayloadString(payload, 'discussion_kind'),
        jury_round: getPayloadNumber(payload, 'jury_round'),
        jury_member_index: getPayloadNumber(payload, 'jury_member_index'),
        jury_perspective: getPayloadString(payload, 'jury_perspective'),
    };

    return {
        currentSession: {
            ...state.currentSession,
            jury_dialogue_history: appendDialogueWithDedupe(
                state.currentSession.jury_dialogue_history,
                entry,
            ),
        },
    };
}

function handleSpeechStart(
    _state: DebateState,
    payload: Record<string, unknown>,
): Partial<DebateState> {
    return {
        isDebating: true,
        streamingRole: getPayloadString(payload, 'role') ?? '',
        streamingContent: '',
    };
}

function handleSpeechToken(
    state: DebateState,
    payload: Record<string, unknown>,
): Partial<DebateState> {
    const token = getPayloadString(payload, 'token') ?? '';
    return token ? { streamingContent: state.streamingContent + token } : {};
}

function handleSpeechCancel(): Partial<DebateState> {
    return { streamingRole: '', streamingContent: '' };
}

function handleSpeechEnd(
    state: DebateState,
    payload: Record<string, unknown>,
    event: RuntimeEvent,
): Partial<DebateState> {
    const patch: Partial<DebateState> = { streamingRole: '', streamingContent: '' };
    if (!state.currentSession) return patch;

    const entry: DialogueEntry = {
        role: getPayloadString(payload, 'role') ?? '',
        agent_name: getPayloadString(payload, 'agent_name') ?? getPayloadString(payload, 'role') ?? '',
        content: sanitizeIncomingContent(getPayloadString(payload, 'content')),
        citations: getPayloadCitations(payload),
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
    const patch: Partial<DebateState> = { streamingRole: '', streamingContent: '' };
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
            ? appendModeArtifact(state.currentSession.mode_artifacts ?? [], artifact)
            : (state.currentSession.mode_artifacts ?? []),
        current_mode_report: event.type === 'sophistry_round_report'
            ? (artifact ?? state.currentSession.current_mode_report ?? null)
            : (state.currentSession.current_mode_report ?? null),
        final_mode_report: event.type === 'sophistry_final_report'
            ? (artifact ?? state.currentSession.final_mode_report ?? null)
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
                [role]: scores,
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
                    ? (cumulativeRaw as Record<string, Record<string, number[]>>)
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
                    ? (finalScoresRaw as Record<string, Record<string, number[]>>)
                    : state.currentSession.cumulative_scores,
            final_mode_report:
                typeof finalReportRaw === 'object' && finalReportRaw !== null
                    ? (finalReportRaw as Record<string, unknown>)
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
    team_discussion: handleTeamDiscussion,
    team_summary: handleTeamDiscussion,
    jury_discussion: handleJuryDiscussion,
    jury_summary: handleJuryDiscussion,
    consensus_summary: handleJuryDiscussion,
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
