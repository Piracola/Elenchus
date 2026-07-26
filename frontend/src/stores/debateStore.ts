/**
 * Zustand store — single source of truth for all debate state.
 * Runtime state is updated through an event-reducer style `applyRuntimeEvent`.
 */

import { create } from 'zustand';
import type {
    DialogueEntry,
    Session,
    SessionListItem,
    DebatePhase,
    RuntimeEvent,
    RunSummary,
    TokenUsageSummary,
} from '../types';
import {
    getSessionRuntimeFallback,
    sanitizeSession,
} from '../utils/agent/debateStoreHelpers';
import { upsertSessionListItem } from '../utils/session/sessionList';
import {
    runStatusFallbackMessage,
    runStatusToProgress,
} from '../utils/runtime/runStatusPresentation';
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
    reset: () => void;
}

export interface DebateState
    extends DebateSessionSlice,
    DebateRuntimeSlice,
    DebateConnectionSlice,
    DebateStreamingSlice,
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

const initialState = {
    ...initialSessionState,
    ...initialRuntimeState,
    ...initialConnectionState,
    ...initialStreamingState,
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
    const progress = runStatusToProgress(status);
    const message = status === 'failed'
        ? (run?.last_error_message || run?.last_status_message)
        : status === 'stalled'
            ? (run?.last_error_message || run?.last_status_message)
            : run?.last_status_message;
    return {
        ...progress,
        currentStatus: message || runStatusFallbackMessage(status),
        currentNode: '',
    };
}

function resetStoreState() {
    return createInitialState();
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

    toggleAgentMessageCollapsed: (sessionId, collapseKey) =>
        set((state) => {
            if (!sessionId || !collapseKey) {
                return {};
            }
            return patchCollapsedKey(state, sessionId, collapseKey);
        }),
    setAllAgentMessagesCollapsed: (sessionId, collapseKeys, collapsed) =>
        set((state) => {
            if (!sessionId || collapseKeys.length === 0) {
                return {};
            }
            return patchCollapsedKeys(state, sessionId, collapseKeys, collapsed);
        }),
    clearSessionCollapsedAgentMessages: (sessionId) =>
        set((state) => {
            if (!sessionId) {
                return {};
            }
            return patchClearSessionCollapsedKeys(state, sessionId);
        }),

    reset: () => set(resetStoreState()),
}));
