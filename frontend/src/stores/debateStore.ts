/**
 * Zustand store — single source of truth for all debate state.
 * Runtime state is updated through an event-reducer style `applyRuntimeEvent`.
 */

import { create } from 'zustand';
import type {
    DialogueEntry,
    Session,
    SessionListItem,
    TurnScore,
    SearchResult,
    DebatePhase,
    RuntimeEvent,
} from '../types';
import { clampReplayCursor, deriveRuntimeViewState, getVisibleRuntimeEvents } from '../utils/replay';
import { repairKnownMojibakeText, repairTextTree } from '../utils/textRepair';

const MAX_SAFE_CONTENT_LENGTH = 50000;
// Keep the in-memory retention aligned with the existing 10k replay/timeline baseline.
const MAX_RUNTIME_EVENTS = 10_000;

// ── Store shape ─────────────────────────────────────────────────

interface DebateState {
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
    setSessions: (sessions: SessionListItem[]) => void;
    setCurrentSession: (session: Session | null) => void;

    // Actions — connection
    setConnected: (connected: boolean) => void;
    setDebating: (debating: boolean) => void;
    setPhase: (phase: DebatePhase, status?: string, node?: string) => void;

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

function sanitizeIncomingContent(content: unknown): string {
    const text = repairKnownMojibakeText(typeof content === 'string' ? content : '');
    if (!text) return text;

    if (text.includes('Scoring failed, so a neutral fallback score was used.')) {
        return '评分解析失败，本轮暂按中性分处理。';
    }

    if (text.startsWith('data: {')) {
        return '[已过滤异常的流式响应数据]';
    }

    if (looksLikeHtmlDocument(text)) {
        return '[Provider endpoint returned HTML instead of model output. Check API Base URL (usually ending with /v1).]';
    }

    if (text.length > MAX_SAFE_CONTENT_LENGTH) {
        return `${text.slice(0, MAX_SAFE_CONTENT_LENGTH)}\n\n[内容过长，已截断以保护界面]`;
    }

    return text;
}

function looksLikeHtmlDocument(text: string): boolean {
    const normalized = text.trimStart().toLowerCase();
    if (!normalized) return false;

    if (normalized.startsWith('<!doctype html') || normalized.startsWith('<html')) {
        return true;
    }

    return normalized.includes('<html') && normalized.includes('</html>') && normalized.includes('<body');
}

function getPayloadString(payload: Record<string, unknown>, key: string): string | undefined {
    const value = payload[key];
    return typeof value === 'string' ? value : undefined;
}

function getPayloadNumber(payload: Record<string, unknown>, key: string): number | undefined {
    const value = payload[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getPayloadCitations(payload: Record<string, unknown>): string[] {
    const value = payload.citations;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string');
}

function sameCitations(a: string[] = [], b: string[] = []): boolean {
    if (a.length !== b.length) return false;
    return a.every((item, index) => item === b[index]);
}

function sameDialogueContent(a: DialogueEntry, b: DialogueEntry): boolean {
    const aScores = JSON.stringify(a.scores ?? null);
    const bScores = JSON.stringify(b.scores ?? null);
    return (
        a.role === b.role &&
        (a.turn ?? -1) === (b.turn ?? -1) &&
        (a.target_role ?? '') === (b.target_role ?? '') &&
        (a.discussion_kind ?? '') === (b.discussion_kind ?? '') &&
        (a.team_side ?? '') === (b.team_side ?? '') &&
        (a.team_round ?? -1) === (b.team_round ?? -1) &&
        (a.team_member_index ?? -1) === (b.team_member_index ?? -1) &&
        (a.team_specialty ?? '') === (b.team_specialty ?? '') &&
        (a.jury_round ?? -1) === (b.jury_round ?? -1) &&
        (a.jury_member_index ?? -1) === (b.jury_member_index ?? -1) &&
        (a.jury_perspective ?? '') === (b.jury_perspective ?? '') &&
        a.agent_name === b.agent_name &&
        a.content === b.content &&
        sameCitations(a.citations, b.citations) &&
        aScores === bScores
    );
}

function appendDialogueWithDedupe(history: DialogueEntry[], entry: DialogueEntry): DialogueEntry[] {
    if (entry.role === 'judge' && entry.turn !== undefined) {
        const duplicatedJudge = history.some(
            (item) =>
                item.role === 'judge' &&
                item.turn === entry.turn &&
                (item.target_role ?? '') === (entry.target_role ?? '') &&
                sameDialogueContent(item, entry),
        );
        if (duplicatedJudge) {
            return history;
        }
    }

    const lastEntry = history[history.length - 1];
    if (lastEntry && sameDialogueContent(lastEntry, entry)) {
        return history;
    }

    return [...history, entry];
}

function coerceSearchResults(payload: Record<string, unknown>): SearchResult[] {
    const value = payload.results;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is SearchResult => typeof item === 'object' && item !== null) as SearchResult[];
}

function sanitizeDialogueEntry(entry: DialogueEntry): DialogueEntry {
    return {
        ...entry,
        content: sanitizeIncomingContent(entry.content),
        agent_name: repairKnownMojibakeText(entry.agent_name),
    };
}

function sanitizeRuntimeEvent(event: RuntimeEvent): RuntimeEvent {
    return {
        ...event,
        payload: repairTextTree(event.payload) as Record<string, unknown>,
    };
}

function sanitizeSession(session: Session | null): Session | null {
    if (!session) return null;
    return {
        ...session,
        dialogue_history: (session.dialogue_history ?? []).map(sanitizeDialogueEntry),
        team_dialogue_history: (session.team_dialogue_history ?? []).map(sanitizeDialogueEntry),
        jury_dialogue_history: (session.jury_dialogue_history ?? []).map(sanitizeDialogueEntry),
        team_config: session.team_config ?? { agents_per_team: 0, discussion_rounds: 0 },
        jury_config: session.jury_config ?? { agents_per_jury: 0, discussion_rounds: 0 },
        reasoning_config: session.reasoning_config ?? {
            steelman_enabled: true,
            counterfactual_enabled: true,
            consensus_enabled: true,
        },
    };
}

function sortRuntimeEvents(a: RuntimeEvent, b: RuntimeEvent): number {
    const aSeq = a.seq >= 0 ? a.seq : Number.MAX_SAFE_INTEGER;
    const bSeq = b.seq >= 0 ? b.seq : Number.MAX_SAFE_INTEGER;
    if (aSeq !== bSeq) {
        return aSeq - bSeq;
    }

    const aTime = Date.parse(a.timestamp);
    const bTime = Date.parse(b.timestamp);
    const safeATime = Number.isFinite(aTime) ? aTime : 0;
    const safeBTime = Number.isFinite(bTime) ? bTime : 0;
    if (safeATime !== safeBTime) {
        return safeATime - safeBTime;
    }

    return a.event_id.localeCompare(b.event_id);
}

function normalizeRuntimeEvents(events: RuntimeEvent[]): RuntimeEvent[] {
    const sorted = [...events]
        .map((event) => sanitizeRuntimeEvent(event))
        .sort(sortRuntimeEvents);
    const seenIds = new Set<string>();
    const unique: RuntimeEvent[] = [];

    for (const event of sorted) {
        if (seenIds.has(event.event_id)) continue;
        seenIds.add(event.event_id);
        unique.push(event);
    }

    return unique.length > MAX_RUNTIME_EVENTS ? unique.slice(-MAX_RUNTIME_EVENTS) : unique;
}

function computeLastEventSeq(events: RuntimeEvent[]): number {
    return events.reduce((maxSeq, event) => {
        if (event.seq >= 0 && event.seq > maxSeq) {
            return event.seq;
        }
        return maxSeq;
    }, -1);
}

function getSessionRuntimeFallback(session: Session | null): {
    isDebating: boolean;
    phase: DebatePhase;
    status: string;
    node: string;
} {
    if (!session) {
        return {
            isDebating: false,
            phase: 'idle',
            status: '',
            node: '',
        };
    }

    if (session.status === 'in_progress') {
        return {
            // Persisted "in_progress" means the session can be resumed,
            // not that a live runtime task still exists after a restart.
            isDebating: false,
            phase: 'idle',
            status: '',
            node: '',
        };
    }

    if (session.status === 'completed') {
        return {
            isDebating: false,
            phase: 'complete',
            status: '辩论已完成',
            node: '',
        };
    }

    if (session.status === 'error') {
        return {
            isDebating: false,
            phase: 'error',
            status: '会话发生错误',
            node: '',
        };
    }

    return {
        isDebating: false,
        phase: 'idle',
        status: '',
        node: '',
    };
}

// ── Store ───────────────────────────────────────────────────────

function toSessionListItem(session: Session | SessionListItem): SessionListItem {
    return {
        id: session.id,
        topic: session.topic,
        status: session.status,
        current_turn: session.current_turn,
        max_turns: session.max_turns,
        created_at: session.created_at,
    };
}

function getSessionCreatedAtValue(session: SessionListItem): number {
    const value = Date.parse(session.created_at);
    return Number.isFinite(value) ? value : 0;
}

function sortSessionListItems(a: SessionListItem, b: SessionListItem): number {
    const createdAtDiff = getSessionCreatedAtValue(b) - getSessionCreatedAtValue(a);
    if (createdAtDiff !== 0) {
        return createdAtDiff;
    }
    return a.id.localeCompare(b.id);
}

function upsertSessionListItem(
    sessions: SessionListItem[],
    session: Session | SessionListItem,
): SessionListItem[] {
    const nextItem = toSessionListItem(session);
    const existingIndex = sessions.findIndex((item) => item.id === nextItem.id);

    if (existingIndex < 0) {
        return [...sessions, nextItem].sort(sortSessionListItems);
    }

    const nextSessions = [...sessions];
    nextSessions[existingIndex] = nextItem;
    return nextSessions.sort(sortSessionListItems);
}

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
    ...initialState,

    // Session list
    setSessions: (sessions) => set({ sessions }),
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

            const patch: Partial<DebateState> = {
                runtimeEvents: trimmedEvents,
                visibleRuntimeEvents,
                lastEventSeq: event.seq >= 0 ? event.seq : state.lastEventSeq,
                replayCursor: nextReplayCursor,
                hasOlderRuntimeEvents: state.hasOlderRuntimeEvents || didTrim,
            };
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

            switch (event.type) {
                case 'system':
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
                    patch.streamingContent = `${state.streamingContent}${getPayloadString(payload, 'token') ?? ''}`;
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
            const lastEventSeq = computeLastEventSeq(safeEvents);
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
            const runtimeView = deriveRuntimeViewState(
                safeEvents,
                getSessionRuntimeFallback(state.currentSession),
            );
            return {
                runtimeEvents: safeEvents,
                visibleRuntimeEvents: safeEvents,
                lastEventSeq: computeLastEventSeq(safeEvents),
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
                lastEventSeq: computeLastEventSeq(mergedEvents),
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

    reset: () => set(initialState),
}));
