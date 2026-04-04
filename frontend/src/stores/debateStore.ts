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
import {
    appendDialogueWithDedupe,
    getSessionRuntimeFallback,
    sanitizeIncomingContent,
    sanitizeSession,
} from '../utils/debateStoreHelpers';
import { upsertSessionListItem } from '../utils/sessionList';
import {
    applyRuntimeEventPatch,
    createExitReplayPatch,
    createFocusedRuntimeEventPatch,
    createHydrateRuntimeEventsPatch,
    createLoadRuntimeEventSnapshotPatch,
    createPrependRuntimeEventsPatch,
    createReplayCursorPatch,
    createReplayEnabledPatch,
    createReplayStepPatch,
} from './debateStore.runtime';
import {
    patchCollapsedKey,
    patchCollapsedKeys,
    patchClearSessionCollapsedKeys,
} from './debateStore.collapsedState';

export interface DebateSessionSlice {
    sessions: SessionListItem[];
    currentSession: Session | null;
}

export interface DebateRuntimeSlice {
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
}

export interface DebateConnectionSlice {
    isConnected: boolean;
    isDebating: boolean;
    phase: DebatePhase;
    currentStatus: string;
    currentNode: string;
}

export interface DebateStreamingSlice {
    streamingRole: string;
    streamingContent: string;
}

export interface DebateSearchSlice {
    lastSearchResults: SearchResult[];
    searchResultCount: number;
}

export interface DebateActionSlice {
    setSessions: (
        sessions: SessionListItem[] | ((current: SessionListItem[]) => SessionListItem[])
    ) => void;
    setCurrentSession: (session: Session | null) => void;
    setConnected: (connected: boolean) => void;
    setDebating: (debating: boolean) => void;
    setPhase: (phase: DebatePhase, status?: string, node?: string) => void;
    markDocumentVisibility: (visible: boolean) => void;
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
    appendDialogueEntry: (entry: DialogueEntry) => void;
    startStreaming: (role: string) => void;
    appendStreamToken: (token: string) => void;
    endStreaming: (role: string, content: string, citations: string[], agentName?: string) => void;
    updateCurrentScores: (role: string, scores: TurnScore) => void;
    updateCumulativeScores: (scores: Record<string, Record<string, number[]>>) => void;
    advanceTurn: (turn: number) => void;
    setSearchResults: (results: SearchResult[], count: number) => void;
    completeDebate: (finalScores: Record<string, Record<string, number[]>>, totalTurns: number) => void;
    reset: () => void;
}

export interface DebateState
    extends DebateSessionSlice,
    DebateRuntimeSlice,
    DebateConnectionSlice,
    DebateStreamingSlice,
    DebateSearchSlice,
    DebateActionSlice {}

const initialSessionState: DebateSessionSlice = {
    sessions: [],
    currentSession: null,
};

const initialRuntimeState: DebateRuntimeSlice = {
    runtimeEvents: [],
    visibleRuntimeEvents: [],
    lastEventSeq: -1,
    focusedRuntimeEventId: null,
    replayEnabled: false,
    replayCursor: -1,
    hasOlderRuntimeEvents: false,
    isDocumentVisible: typeof document === 'undefined' ? true : document.visibilityState !== 'hidden',
    visibilityResumeToken: 0,
    collapsedAgentMessagesBySession: {},
};

const initialConnectionState: DebateConnectionSlice = {
    isConnected: false,
    isDebating: false,
    phase: 'idle',
    currentStatus: '',
    currentNode: '',
};

const initialStreamingState: DebateStreamingSlice = {
    streamingRole: '',
    streamingContent: '',
};

const initialSearchState: DebateSearchSlice = {
    lastSearchResults: [],
    searchResultCount: 0,
};

const initialState = {
    ...initialSessionState,
    ...initialRuntimeState,
    ...initialConnectionState,
    ...initialStreamingState,
    ...initialSearchState,
};

const EMPTY_COLLAPSED_AGENT_MESSAGES: Record<string, boolean> = {};

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

export function getCollapsedAgentMessagesForSession(
    state: DebateState,
    sessionId: string | null | undefined,
): Record<string, boolean> {
    if (!sessionId) {
        return EMPTY_COLLAPSED_AGENT_MESSAGES;
    }
    return state.collapsedAgentMessagesBySession[sessionId] ?? EMPTY_COLLAPSED_AGENT_MESSAGES;
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

    applyRuntimeEvent: (event) =>
        set((state) => withSyncedSessionList(state, applyRuntimeEventPatch(state, event))),
    setFocusedRuntimeEventId: (eventId) =>
        set((state) => createFocusedRuntimeEventPatch(state, eventId)),
    setReplayEnabled: (enabled) =>
        set((state) => createReplayEnabledPatch(state, enabled)),
    setReplayCursor: (cursor) =>
        set((state) => createReplayCursorPatch(state, cursor)),
    stepReplay: (offset) =>
        set((state) => createReplayStepPatch(state, offset)),
    exitReplay: () =>
        set((state) => createExitReplayPatch(state)),
    loadRuntimeEventSnapshot: (events) =>
        set((state) => createLoadRuntimeEventSnapshotPatch(state, events)),
    hydrateRuntimeEvents: (events, hasOlderRuntimeEvents = false) =>
        set((state) => createHydrateRuntimeEventsPatch(state, events, hasOlderRuntimeEvents)),
    prependRuntimeEvents: (events, hasOlderRuntimeEvents = false) =>
        set((state) => createPrependRuntimeEventsPatch(state, events, hasOlderRuntimeEvents)),

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

    setSearchResults: (results, count) =>
        set({ lastSearchResults: results, searchResultCount: count }),

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
