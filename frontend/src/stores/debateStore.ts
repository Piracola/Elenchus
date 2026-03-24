/**
 * Zustand store — single source of truth for all debate state.
 * Runtime state is updated through an event-reducer style `applyRuntimeEvent`.
 */

import { create } from 'zustand';
import type {
    DialogueEntry,
    ModeArtifact,
    Session,
    SessionListItem,
    TurnScore,
    SearchResult,
    DebatePhase,
    RuntimeEvent,
} from '../types';
import {
    appendDialogueWithDedupe,
    appendModeArtifact,
    coerceSearchResults,
    computeLastEventSeq,
    getPayloadCitations,
    getPayloadNumber,
    getPayloadString,
    getSessionRuntimeFallback,
    MAX_RUNTIME_EVENTS,
    normalizeRuntimeEvents,
    sanitizeIncomingContent,
    sanitizeRuntimeEvent,
    sanitizeSession,
    shouldRecordRuntimeEvent,
} from '../utils/debateStoreHelpers';
import { clampReplayCursor, deriveRuntimeViewState, getVisibleRuntimeEvents } from '../utils/replay';
import { upsertSessionListItem } from '../utils/sessionList';

// ── Store shape ─────────────────────────────────────────────────

export interface DebateState {
    // Session list (sidebar)
    sessions: SessionListItem[];
    currentSession: Session | null;

    // Runtime observability
    runtimeEvents: RuntimeEvent[];
    visibleRuntimeEvents: RuntimeEvent[];
    lastEventSeq: number;
    focusedRuntimeEventId: string | null;
    replayEnabled: boolean;
    replayCursor: number;
    hasOlderRuntimeEvents: boolean;
    isDocumentVisible: boolean;
    visibilityResumeToken: number;
    collapsedAgentMessagesBySession: Record<string, Record<string, boolean>>;

    // Real-time debate state
    isConnected: boolean;
    isDebating: boolean;
    phase: DebatePhase;
    currentStatus: string;
    currentNode: string;

    // Streaming speech buffer
    streamingRole: string;
    streamingContent: string;

    // Latest fact-check results
    lastSearchResults: SearchResult[];
    searchResultCount: number;

    // Actions — session list
    setSessions: (
        sessions: SessionListItem[] | ((current: SessionListItem[]) => SessionListItem[])
    ) => void;
    setCurrentSession: (session: Session | null) => void;

    // Actions — connection
    setConnected: (connected: boolean) => void;
    setDebating: (debating: boolean) => void;
    setPhase: (phase: DebatePhase, status?: string, node?: string) => void;
    markDocumentVisibility: (visible: boolean) => void;

    // Event reducer entrypoint
    applyRuntimeEvent: (event: RuntimeEvent) => void;
    setFocusedRuntimeEventId: (eventId: string | null) => void;
    setReplayEnabled: (enabled: boolean) => void;
    setReplayCursor: (cursor: number) => void;
    stepReplay: (offset: number) => void;
    exitReplay: () => void;
    loadRuntimeEventSnapshot: (events: RuntimeEvent[]) => void;
    hydrateRuntimeEvents: (events: RuntimeEvent[], hasOlderRuntimeEvents?: boolean) => void;
    prependRuntimeEvents: (events: RuntimeEvent[], hasOlderRuntimeEvents?: boolean) => void;
    toggleAgentMessageCollapsed: (sessionId: string, collapseKey: string) => void;
    setAllAgentMessagesCollapsed: (sessionId: string, collapseKeys: string[], collapsed: boolean) => void;
    clearSessionCollapsedAgentMessages: (sessionId: string) => void;

    // Actions — dialogue
    appendDialogueEntry: (entry: DialogueEntry) => void;
    startStreaming: (role: string) => void;
    appendStreamToken: (token: string) => void;
    endStreaming: (role: string, content: string, citations: string[], agentName?: string) => void;

    // Actions — scores
    updateCurrentScores: (role: string, scores: TurnScore) => void;
    updateCumulativeScores: (scores: Record<string, Record<string, number[]>>) => void;
    advanceTurn: (turn: number) => void;

    // Actions — search
    setSearchResults: (results: SearchResult[], count: number) => void;

    // Actions — completion
    completeDebate: (finalScores: Record<string, Record<string, number[]>>, totalTurns: number) => void;

    // Reset
    reset: () => void;
}

// ── Initial state ───────────────────────────────────────────────

const initialState = {
    sessions: [] as SessionListItem[],
    currentSession: null as Session | null,
    runtimeEvents: [] as RuntimeEvent[],
    visibleRuntimeEvents: [] as RuntimeEvent[],
    lastEventSeq: -1,
    focusedRuntimeEventId: null as string | null,
    replayEnabled: false,
    replayCursor: -1,
    hasOlderRuntimeEvents: false,
    isDocumentVisible: typeof document === 'undefined' ? true : document.visibilityState !== 'hidden',
    visibilityResumeToken: 0,
    collapsedAgentMessagesBySession: {} as Record<string, Record<string, boolean>>,
    isConnected: false,
    isDebating: false,
    phase: 'idle' as DebatePhase,
    currentStatus: '',
    currentNode: '',
    streamingRole: '',
    streamingContent: '',
    lastSearchResults: [] as SearchResult[],
    searchResultCount: 0,
};

function pruneCollapsedState(
    state: Record<string, Record<string, boolean>>,
    sessionId: string,
    collapseKeys: string[],
    collapsed: boolean,
): Record<string, Record<string, boolean>> {
    const existing = state[sessionId] ?? {};
    if (!collapseKeys.length) {
        return state;
    }

    const nextSessionState = { ...existing };
    for (const key of collapseKeys) {
        if (!key) continue;
        if (collapsed) {
            nextSessionState[key] = true;
        } else {
            delete nextSessionState[key];
        }
    }

    if (Object.keys(nextSessionState).length === 0) {
        return Object.fromEntries(
            Object.entries(state).filter(([key]) => key !== sessionId),
        );
    }

    return {
        ...state,
        [sessionId]: nextSessionState,
    };
}

function toggleCollapsedState(
    state: Record<string, Record<string, boolean>>,
    sessionId: string,
    collapseKey: string,
): Record<string, Record<string, boolean>> {
    if (!sessionId || !collapseKey) {
        return state;
    }
    const existing = state[sessionId] ?? {};
    const nextSessionState = { ...existing };
    if (nextSessionState[collapseKey]) {
        delete nextSessionState[collapseKey];
    } else {
        nextSessionState[collapseKey] = true;
    }

    if (Object.keys(nextSessionState).length === 0) {
        return Object.fromEntries(
            Object.entries(state).filter(([key]) => key !== sessionId),
        );
    }

    return {
        ...state,
        [sessionId]: nextSessionState,
    };
}

function clearCollapsedStateForSession(
    state: Record<string, Record<string, boolean>>,
    sessionId: string,
): Record<string, Record<string, boolean>> {
    if (!sessionId || !state[sessionId]) {
        return state;
    }
    return Object.fromEntries(
        Object.entries(state).filter(([key]) => key !== sessionId),
    );
}

function createInitialState() {
    return {
        ...initialState,
        sessions: [],
        currentSession: null,
        runtimeEvents: [],
        visibleRuntimeEvents: [],
        focusedRuntimeEventId: null,
        collapsedAgentMessagesBySession: {},
        lastSearchResults: [],
    };
}

const EMPTY_COLLAPSED_AGENT_MESSAGES: Record<string, boolean> = {};

function uniqueCollapseKeys(collapseKeys: string[]): string[] {
    return Array.from(new Set(collapseKeys.filter(Boolean)));
}

export function getCollapsedAgentMessagesForSession(
    state: DebateState,
    sessionId: string | null | undefined,
): Record<string, boolean> {
    if (!sessionId) {
        return EMPTY_COLLAPSED_AGENT_MESSAGES;
    }
    return state.collapsedAgentMessagesBySession[sessionId] ?? EMPTY_COLLAPSED_AGENT_MESSAGES;
}

function patchCollapsedKeys(
    state: DebateState,
    sessionId: string,
    collapseKeys: string[],
    collapsed: boolean,
): Partial<DebateState> {
    return {
        collapsedAgentMessagesBySession: pruneCollapsedState(
            state.collapsedAgentMessagesBySession,
            sessionId,
            uniqueCollapseKeys(collapseKeys),
            collapsed,
        ),
    };
}

function patchCollapsedKey(
    state: DebateState,
    sessionId: string,
    collapseKey: string,
): Partial<DebateState> {
    return {
        collapsedAgentMessagesBySession: toggleCollapsedState(
            state.collapsedAgentMessagesBySession,
            sessionId,
            collapseKey,
        ),
    };
}

function patchClearSessionCollapsedKeys(
    state: DebateState,
    sessionId: string,
): Partial<DebateState> {
    return {
        collapsedAgentMessagesBySession: clearCollapsedStateForSession(
            state.collapsedAgentMessagesBySession,
            sessionId,
        ),
    };
}

const storeInitialState = createInitialState();

function resetStoreState() {
    return createInitialState();
}

function finalizePatch(_state: DebateState, patch: Partial<DebateState>): Partial<DebateState> {
    return patch;
}

function noMutationResult(): Partial<DebateState> {
    return {};
}

// ── Store ───────────────────────────────────────────────────────

function withSyncedSessionList(
    state: DebateState,
    patch: Partial<DebateState>,
): Partial<DebateState> {
    if (patch.currentSession) {
        patch.sessions = upsertSessionListItem(state.sessions, patch.currentSession);
    }
    return patch;
}

export const useDebateStore = create<DebateState>((set) => ({
    ...storeInitialState,

    // Session list
    setSessions: (sessions) =>
        set((state) => ({
            sessions: typeof sessions === 'function' ? sessions(state.sessions) : sessions,
        })),
    setCurrentSession: (session) =>
        set((state) => {
            const safeSession = sanitizeSession(session);
            const runtimeFallback = getSessionRuntimeFallback(safeSession);
            const changedSession = state.currentSession?.id !== session?.id;
            if (!changedSession) {
                return withSyncedSessionList(state, { currentSession: safeSession });
            }
            return withSyncedSessionList(state, {
                currentSession: safeSession,
                runtimeEvents: [],
                visibleRuntimeEvents: [],
                lastEventSeq: -1,
                focusedRuntimeEventId: null,
                replayEnabled: false,
                replayCursor: -1,
                hasOlderRuntimeEvents: false,
                streamingRole: '',
                streamingContent: '',
                isDebating: runtimeFallback.isDebating,
                phase: runtimeFallback.phase,
                currentStatus: runtimeFallback.status,
                currentNode: runtimeFallback.node,
            });
        }),

    // Connection / debate flow
    setConnected: (connected) => set({ isConnected: connected }),
    setDebating: (debating) => set({ isDebating: debating }),
    setPhase: (phase, status = '', node = '') =>
        set({ phase, currentStatus: status, currentNode: node }),
    markDocumentVisibility: (visible) =>
        set((state) => {
            if (state.isDocumentVisible === visible) {
                return {};
            }
            return {
                isDocumentVisible: visible,
                visibilityResumeToken: visible ? state.visibilityResumeToken + 1 : state.visibilityResumeToken,
            };
        }),

    // Event reducer
    applyRuntimeEvent: (rawEvent) =>
        set((state) => {
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
            const shouldRecordEvent = shouldRecordRuntimeEvent(event);
            const patch: Partial<DebateState> = {
                lastEventSeq: event.seq >= 0 ? Math.max(state.lastEventSeq, event.seq) : state.lastEventSeq,
            };

            if (shouldRecordEvent) {
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
            }

            switch (event.type) {
                case 'system':
                case 'mode_notice':
                    break;

                case 'status':
                    patch.phase = (event.phase ?? getPayloadString(payload, 'phase') ?? 'processing') as DebatePhase;
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

            return withSyncedSessionList(state, patch);
        }),
    setFocusedRuntimeEventId: (eventId) =>
        set((state) => {
            if (!state.replayEnabled) {
                return { focusedRuntimeEventId: eventId };
            }

            if (!eventId) {
                return { focusedRuntimeEventId: null };
            }

            const index = state.runtimeEvents.findIndex((event) => event.event_id === eventId);
            if (index < 0) {
                return { focusedRuntimeEventId: eventId };
            }

            const replayCursor = clampReplayCursor(index, state.runtimeEvents.length);
            return {
                focusedRuntimeEventId: eventId,
                replayCursor,
                visibleRuntimeEvents: getVisibleRuntimeEvents(state.runtimeEvents, true, replayCursor),
            };
        }),
    setReplayEnabled: (enabled) =>
        set((state) => {
            if (!enabled) {
                const realtimeCursor = clampReplayCursor(
                    state.runtimeEvents.length - 1,
                    state.runtimeEvents.length,
                );
                return {
                    replayEnabled: false,
                    replayCursor: realtimeCursor,
                    visibleRuntimeEvents: state.runtimeEvents,
                };
            }

            let replayCursor = state.replayCursor;
            if (state.focusedRuntimeEventId) {
                const focusedIndex = state.runtimeEvents.findIndex(
                    (event) => event.event_id === state.focusedRuntimeEventId,
                );
                if (focusedIndex >= 0) {
                    replayCursor = focusedIndex;
                }
            }
            if (replayCursor < 0) {
                replayCursor = state.runtimeEvents.length - 1;
            }

            replayCursor = clampReplayCursor(replayCursor, state.runtimeEvents.length);
            return {
                replayEnabled: true,
                replayCursor,
                visibleRuntimeEvents: getVisibleRuntimeEvents(state.runtimeEvents, true, replayCursor),
                focusedRuntimeEventId:
                    replayCursor >= 0 ? state.runtimeEvents[replayCursor].event_id : null,
            };
        }),
    setReplayCursor: (cursor) =>
        set((state) => {
            const replayCursor = clampReplayCursor(cursor, state.runtimeEvents.length);
            return {
                replayEnabled: true,
                replayCursor,
                visibleRuntimeEvents: getVisibleRuntimeEvents(state.runtimeEvents, true, replayCursor),
                focusedRuntimeEventId:
                    replayCursor >= 0 ? state.runtimeEvents[replayCursor].event_id : null,
            };
        }),
    stepReplay: (offset) =>
        set((state) => {
            const baselineCursor = state.replayEnabled
                ? state.replayCursor
                : state.runtimeEvents.length - 1;
            const replayCursor = clampReplayCursor(
                baselineCursor + offset,
                state.runtimeEvents.length,
            );
            return {
                replayEnabled: true,
                replayCursor,
                visibleRuntimeEvents: getVisibleRuntimeEvents(state.runtimeEvents, true, replayCursor),
                focusedRuntimeEventId:
                    replayCursor >= 0 ? state.runtimeEvents[replayCursor].event_id : null,
            };
        }),
    exitReplay: () =>
        set((state) => {
            const replayCursor = clampReplayCursor(
                state.runtimeEvents.length - 1,
                state.runtimeEvents.length,
            );
            return {
                replayEnabled: false,
                replayCursor,
                visibleRuntimeEvents: state.runtimeEvents,
                focusedRuntimeEventId: null,
            };
        }),
    loadRuntimeEventSnapshot: (events) =>
        set((state) => {
            const safeEvents = normalizeRuntimeEvents(events);
            const replayCursor = clampReplayCursor(safeEvents.length - 1, safeEvents.length);
            const lastEventSeq = computeLastEventSeq(events);
            const runtimeView = deriveRuntimeViewState(
                safeEvents,
                getSessionRuntimeFallback(state.currentSession),
            );
            return {
                runtimeEvents: safeEvents,
                visibleRuntimeEvents: getVisibleRuntimeEvents(safeEvents, true, replayCursor),
                lastEventSeq,
                replayEnabled: true,
                replayCursor,
                focusedRuntimeEventId: replayCursor >= 0 ? safeEvents[replayCursor].event_id : null,
                hasOlderRuntimeEvents: false,
                streamingRole: '',
                streamingContent: '',
                isDebating: runtimeView.isDebating,
                phase: runtimeView.phase,
                currentStatus: runtimeView.status,
                currentNode: runtimeView.node,
            };
        }),
    hydrateRuntimeEvents: (events, hasOlderRuntimeEvents = false) =>
        set((state) => {
            const safeEvents = normalizeRuntimeEvents(events);
            const replayCursor = clampReplayCursor(safeEvents.length - 1, safeEvents.length);
            const runtimeFallback = getSessionRuntimeFallback(state.currentSession);
            const shouldUseHistoricalLiveState = state.currentSession?.status !== 'in_progress';
            const runtimeView = shouldUseHistoricalLiveState
                ? deriveRuntimeViewState(safeEvents, runtimeFallback)
                : runtimeFallback;
            return {
                runtimeEvents: safeEvents,
                visibleRuntimeEvents: safeEvents,
                lastEventSeq: computeLastEventSeq(events),
                replayEnabled: false,
                replayCursor,
                focusedRuntimeEventId: null,
                hasOlderRuntimeEvents,
                streamingRole: '',
                streamingContent: '',
                isDebating: runtimeView.isDebating,
                phase: runtimeView.phase,
                currentStatus: runtimeView.status,
                currentNode: runtimeView.node,
            };
        }),
    prependRuntimeEvents: (events, hasOlderRuntimeEvents = false) =>
        set((state) => {
            const mergedEvents = normalizeRuntimeEvents([...events, ...state.runtimeEvents]);
            const focusedEventId =
                state.focusedRuntimeEventId ??
                (state.replayEnabled && state.replayCursor >= 0
                    ? state.runtimeEvents[state.replayCursor]?.event_id ?? null
                    : null);

            let replayCursor = state.replayEnabled
                ? clampReplayCursor(state.replayCursor, mergedEvents.length)
                : clampReplayCursor(mergedEvents.length - 1, mergedEvents.length);
            let focusedRuntimeEventId = state.focusedRuntimeEventId;

            if (state.replayEnabled) {
                if (focusedEventId) {
                    const focusedIndex = mergedEvents.findIndex(
                        (event) => event.event_id === focusedEventId,
                    );
                    if (focusedIndex >= 0) {
                        replayCursor = focusedIndex;
                        focusedRuntimeEventId = focusedEventId;
                    } else {
                        focusedRuntimeEventId =
                            replayCursor >= 0 ? mergedEvents[replayCursor]?.event_id ?? null : null;
                    }
                } else {
                    focusedRuntimeEventId =
                        replayCursor >= 0 ? mergedEvents[replayCursor]?.event_id ?? null : null;
                }
            } else if (
                focusedRuntimeEventId &&
                !mergedEvents.some((event) => event.event_id === focusedRuntimeEventId)
            ) {
                focusedRuntimeEventId = null;
            }

            return {
                runtimeEvents: mergedEvents,
                visibleRuntimeEvents: getVisibleRuntimeEvents(
                    mergedEvents,
                    state.replayEnabled,
                    replayCursor,
                ),
                lastEventSeq: Math.max(state.lastEventSeq, computeLastEventSeq(events)),
                replayCursor,
                focusedRuntimeEventId,
                hasOlderRuntimeEvents,
            };
        }),

    // Dialogue
    appendDialogueEntry: (entry) =>
        set((state) => {
            if (!state.currentSession) {
                return {};
            }
            return {
                currentSession: {
                    ...state.currentSession,
                    dialogue_history: appendDialogueWithDedupe(state.currentSession.dialogue_history, entry),
                },
            };
        }),

    startStreaming: (role) => set({ streamingRole: role, streamingContent: '' }),

    appendStreamToken: (token) =>
        set((state) => ({ streamingContent: state.streamingContent + token })),

    endStreaming: (role, content, citations, agentName) =>
        set((state) => {
            if (!state.currentSession) {
                return { streamingRole: '', streamingContent: '' };
            }

            const entry: DialogueEntry = {
                role,
                agent_name: agentName || role,
                content: sanitizeIncomingContent(content),
                citations,
                timestamp: new Date().toISOString(),
            };
            return {
                streamingRole: '',
                streamingContent: '',
                currentSession: {
                    ...state.currentSession,
                    dialogue_history: appendDialogueWithDedupe(state.currentSession.dialogue_history, entry),
                },
            };
        }),

    // Scores
    updateCurrentScores: (role, scores) =>
        set((state) => ({
            currentSession: state.currentSession
                ? {
                    ...state.currentSession,
                    current_scores: {
                        ...state.currentSession.current_scores,
                        [role]: scores,
                    },
                }
                : null,
        })),

    updateCumulativeScores: (scores) =>
        set((state) =>
            withSyncedSessionList(state, {
                currentSession: state.currentSession
                    ? { ...state.currentSession, cumulative_scores: scores }
                    : null,
            }),
        ),

    advanceTurn: (turn) =>
        set((state) =>
            withSyncedSessionList(state, {
                currentSession: state.currentSession
                    ? { ...state.currentSession, current_turn: turn }
                    : null,
            }),
        ),

    // Search
    setSearchResults: (results, count) =>
        set({ lastSearchResults: results, searchResultCount: count }),

    // Completion
    completeDebate: (finalScores, totalTurns) =>
        set((state) => ({
            isDebating: false,
            phase: 'complete',
            currentStatus: '辩论已完成',
            currentSession: state.currentSession
                ? {
                    ...state.currentSession,
                    status: 'completed',
                    current_turn: totalTurns,
                    cumulative_scores: finalScores,
                }
                : null,
        })),

    toggleAgentMessageCollapsed: (sessionId, collapseKey) =>
        set((state) => {
            if (!sessionId || !collapseKey) {
                return noMutationResult();
            }
            return finalizePatch(state, patchCollapsedKey(state, sessionId, collapseKey));
        }),

    setAllAgentMessagesCollapsed: (sessionId, collapseKeys, collapsed) =>
        set((state) => {
            if (!sessionId || collapseKeys.length === 0) {
                return noMutationResult();
            }
            return finalizePatch(state, patchCollapsedKeys(state, sessionId, collapseKeys, collapsed));
        }),

    clearSessionCollapsedAgentMessages: (sessionId) =>
        set((state) => {
            if (!sessionId) {
                return noMutationResult();
            }
            return finalizePatch(state, patchClearSessionCollapsedKeys(state, sessionId));
        }),

    reset: () => set(resetStoreState()),
}));
