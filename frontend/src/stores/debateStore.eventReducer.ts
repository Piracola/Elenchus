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
} from '../utils/debateStoreHelpers';
import { clampReplayCursor, getVisibleRuntimeEvents } from '../utils/replay';
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

    const runtimeEvents = [...state.runtimeEvents, event];
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

    const payload = event.payload ?? {};
    const patch = createRecordedRuntimePatch(state, event);

    switch (event.type) {
        case 'system':
        case 'mode_notice':
            break;

        case 'status':
            patch.phase = (event.phase ?? getPayloadString(payload, 'phase') ?? 'processing') as DebateState['phase'];
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
            break;

        case 'team_discussion':
        case 'team_summary': {
            if (!state.currentSession) break;
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

            patch.currentSession = {
                ...state.currentSession,
                team_dialogue_history: appendDialogueWithDedupe(
                    state.currentSession.team_dialogue_history,
                    entry,
                ),
            };
            break;
        }

        case 'jury_discussion':
        case 'jury_summary':
        case 'consensus_summary': {
            if (!state.currentSession) break;
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

            patch.currentSession = {
                ...state.currentSession,
                jury_dialogue_history: appendDialogueWithDedupe(
                    state.currentSession.jury_dialogue_history,
                    entry,
                ),
            };
            break;
        }

        case 'speech_start':
            patch.isDebating = true;
            patch.streamingRole = getPayloadString(payload, 'role') ?? '';
            patch.streamingContent = '';
            break;

        case 'speech_token':
            break;

        case 'speech_cancel':
            patch.streamingRole = '';
            patch.streamingContent = '';
            break;

        case 'speech_end': {
            patch.streamingRole = '';
            patch.streamingContent = '';
            if (!state.currentSession) break;

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
            break;
        }

        case 'sophistry_round_report':
        case 'sophistry_final_report': {
            patch.streamingRole = '';
            patch.streamingContent = '';
            if (!state.currentSession) break;

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
            break;
        }

        case 'fact_check_start':
            patch.isDebating = true;
            patch.phase = 'fact_checking';
            patch.currentStatus = '正在核查事实...';
            patch.currentNode = 'tool_executor';
            break;

        case 'fact_check_result':
            patch.lastSearchResults = coerceSearchResults(payload);
            patch.searchResultCount = getPayloadNumber(payload, 'count') ?? 0;
            break;

        case 'judge_start':
            patch.isDebating = true;
            patch.phase = 'judging';
            patch.currentStatus = '裁判评估中...';
            patch.currentNode = 'judge';
            break;

        case 'judge_score': {
            if (!state.currentSession) break;
            const role = getPayloadString(payload, 'role');
            const turn = getPayloadNumber(payload, 'turn');
            const scoresRaw = payload.scores;
            if (!role || typeof scoresRaw !== 'object' || scoresRaw === null) {
                break;
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

            patch.currentSession = {
                ...state.currentSession,
                current_scores: {
                    ...state.currentSession.current_scores,
                    [role]: scores,
                },
                dialogue_history: appendDialogueWithDedupe(
                    state.currentSession.dialogue_history,
                    judgeEntry,
                ),
            };
            break;
        }

        case 'turn_complete': {
            if (!state.currentSession) break;
            patch.isDebating = true;
            const turn = getPayloadNumber(payload, 'turn');
            const cumulativeRaw = payload.cumulative_scores;
            patch.currentSession = {
                ...state.currentSession,
                current_turn: turn ?? state.currentSession.current_turn,
                cumulative_scores:
                    typeof cumulativeRaw === 'object' && cumulativeRaw !== null
                        ? (cumulativeRaw as Record<string, Record<string, number[]>>)
                        : state.currentSession.cumulative_scores,
            };
            break;
        }

        case 'debate_complete': {
            if (!state.currentSession) {
                patch.isDebating = false;
                patch.phase = 'complete';
                patch.currentStatus = '辩论已完成';
                break;
            }
            const totalTurns = getPayloadNumber(payload, 'total_turns') ?? state.currentSession.current_turn;
            const finalScoresRaw = payload.final_scores;
            const finalReportRaw = payload.final_report;
            patch.isDebating = false;
            patch.phase = 'complete';
            patch.currentStatus = '辩论已完成';
            patch.currentSession = {
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
            };
            break;
        }

        case 'error': {
            patch.phase = 'error';
            patch.currentStatus = sanitizeIncomingContent(getPayloadString(payload, 'content')) || '出现错误';
            patch.isDebating = false;
            if (!state.currentSession) break;
            const errorEntry: DialogueEntry = {
                role: 'error',
                content: patch.currentStatus,
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
            break;
        }

        case 'audience_message': {
            if (!state.currentSession) break;
            const audienceEntry: DialogueEntry = {
                role: 'audience',
                content: sanitizeIncomingContent(getPayloadString(payload, 'content')),
                timestamp: getPayloadString(payload, 'timestamp') ?? event.timestamp ?? new Date().toISOString(),
                citations: [],
                event_id: event.event_id,
                agent_name: '观众发言',
            };
            patch.currentSession = {
                ...state.currentSession,
                dialogue_history: appendDialogueWithDedupe(
                    state.currentSession.dialogue_history,
                    audienceEntry,
                ),
            };
            break;
        }

        case 'pong':
        default:
            break;
    }

    return patch;
}
