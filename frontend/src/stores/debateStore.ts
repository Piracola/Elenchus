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
    RunSummary,
    TokenUsageSummary,
} from '../types';
import {
    appendDialogueWithDedupe,
    getSessionRuntimeFallback,
    sanitizeIncomingContent,
    sanitizeSession,
} from '../utils/agent/debateStoreHelpers';
import { upsertSessionListItem } from '../utils/session/sessionList';
import {
    applyRuntimeEventPatch,
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
    activeRun: RunSummary | null;
    activeRunId: string | null;
    runtimeEvents: RuntimeEvent[];
    lastEventSeq: number;
    lastEventSeqByRun: Record<string, number>;
    isDocumentVisible: boolean;
    visibilityResumeToken: number;
    collapsedAgentMessagesBySession: Record<string, Record<string, boolean>>;
    tokenUsage: TokenUsageSummary | null;
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
    streamingEntry: DialogueEntry | null;
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
    setActiveRun: (run: RunSummary | null) => void;
    setConnected: (connected: boolean) => void;
    setDebating: (debating: boolean) => void;
    setPhase: (phase: DebatePhase, status?: string, node?: string) => void;
    markDocumentVisibility: (visible: boolean) => void;
    applyRuntimeEvent: (event: RuntimeEvent) => void;
    toggleAgentMessageCollapsed: (sessionId: string, collapseKey: string) => void;
    setAllAgentMessagesCollapsed: (sessionId: string, collapseKeys: string[], collapsed: boolean) => void;
    clearSessionCollapsedAgentMessages: (sessionId: string) => void;
    updateCurrentSessionAgentConfigs: (agentConfigs: Session['agent_configs']) => void;
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
    activeRun: null,
    activeRunId: null,
    runtimeEvents: [],
    lastEventSeq: -1,
    lastEventSeqByRun: {},
    isDocumentVisible: typeof document === 'undefined' ? true : document.visibilityState !== 'hidden',
    visibilityResumeToken: 0,
    collapsedAgentMessagesBySession: {},
    tokenUsage: null,
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
    streamingEntry: null,
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
        activeRun: null,
        activeRunId: null,
        runtimeEvents: [],
        lastEventSeqByRun: {},
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

function deriveConnectionStateFromRun(run: RunSummary | null): Pick<DebateState, 'isDebating' | 'phase' | 'currentStatus' | 'currentNode'> {
    const status = run?.status ?? null;
    if (!status) {
        return {
            isDebating: false,
            phase: 'idle',
            currentStatus: '',
            currentNode: '',
        };
    }

    if (status === 'completed') {
        return {
            isDebating: false,
            phase: 'complete',
            currentStatus: run?.last_status_message || '辩论已完成',
            currentNode: '',
        };
    }

    if (status === 'failed') {
        return {
            isDebating: false,
            phase: 'error',
            currentStatus: run?.last_error_message || run?.last_status_message || '运行中断',
            currentNode: '',
        };
    }

    if (status === 'stalled') {
        return {
            isDebating: false,
            phase: 'idle',
            currentStatus: run?.last_error_message || run?.last_status_message || '',
            currentNode: '',
        };
    }

    if (status === 'cancelled') {
        return {
            isDebating: false,
            phase: 'idle',
            currentStatus: run?.last_status_message || '',
            currentNode: '',
        };
    }

    return {
        isDebating: true,
        phase: status === 'stopping'
            ? 'processing'
            : status === 'running'
                ? 'processing'
                : 'initializing',
        currentStatus: run?.last_status_message || '',
        currentNode: '',
    };
}

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
                activeRun: null,
                activeRunId: null,
                runtimeEvents: [],
                lastEventSeq: -1,
                streamingRole: '',
                streamingContent: '',
                streamingEntry: null,
                isDebating: runtimeFallback.isDebating,
                phase: runtimeFallback.phase,
                currentStatus: runtimeFallback.status,
                currentNode: runtimeFallback.node,
                tokenUsage: safeSession?.token_usage ?? null,
            });
        }),

    setActiveRun: (run) =>
        set((state) => {
            const changedRun = state.activeRunId !== run?.id;
            const connectionState = deriveConnectionStateFromRun(run);
            const runLatestSeq = run?.id ? Math.max(state.lastEventSeqByRun[run.id] ?? -1, run.latest_seq ?? -1) : -1;
            return {
                activeRun: run,
                activeRunId: run?.id ?? null,
                runtimeEvents: changedRun ? [] : state.runtimeEvents,
                lastEventSeq: runLatestSeq,
                lastEventSeqByRun: run?.id
                    ? {
                        ...state.lastEventSeqByRun,
                        [run.id]: runLatestSeq,
                    }
                    : state.lastEventSeqByRun,
                streamingRole: changedRun ? '' : state.streamingRole,
                streamingContent: changedRun ? '' : state.streamingContent,
                streamingEntry: changedRun ? null : state.streamingEntry,
                isDebating: connectionState.isDebating,
                phase: connectionState.phase,
                currentStatus: connectionState.currentStatus,
                currentNode: connectionState.currentNode,
            };
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

    updateCurrentSessionAgentConfigs: (agentConfigs) =>
        set((state) => (
            state.currentSession
                ? {
                    currentSession: {
                        ...state.currentSession,
                        agent_configs: agentConfigs,
                    },
                }
                : {}
        )),

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

    startStreaming: (role) => set({ streamingRole: role, streamingContent: '', streamingEntry: null }),
    appendStreamToken: (token) =>
        set((state) => ({ streamingContent: state.streamingContent + token })),
    endStreaming: (role, content, citations, agentName) =>
        set((state) => {
            if (!state.currentSession) {
                return { streamingRole: '', streamingContent: '', streamingEntry: null };
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
                streamingEntry: null,
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
