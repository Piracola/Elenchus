/**
 * Zustand store — single source of truth for all debate state.
 * Handles WebSocket messages, dialogue accumulation, scores, and UI state.
 */

import { create } from 'zustand';
import type {
    DialogueEntry,
    Session,
    SessionListItem,
    TurnScore,
    SearchResult,
    DebatePhase,
} from '../types';

// ── Store shape ─────────────────────────────────────────────────

interface DebateState {
    // Session list (sidebar)
    sessions: SessionListItem[];
    currentSessionId: string | null;
    currentSession: Session | null;

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
    setCurrentSessionId: (id: string | null) => void;

    // Actions — connection
    setConnected: (connected: boolean) => void;
    setDebating: (debating: boolean) => void;
    setPhase: (phase: DebatePhase, status?: string, node?: string) => void;

    // Actions — dialogue
    appendDialogueEntry: (entry: DialogueEntry) => void;
    startStreaming: (role: string) => void;
    appendStreamToken: (token: string) => void;
    endStreaming: (role: string, content: string, citations: string[]) => void;

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
    currentSessionId: null as string | null,
    currentSession: null as Session | null,
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

// ── Store ───────────────────────────────────────────────────────

export const useDebateStore = create<DebateState>((set) => ({
    ...initialState,

    // Session list
    setSessions: (sessions) => set({ sessions }),
    setCurrentSession: (session) => set({ currentSession: session }),
    setCurrentSessionId: (id) => set({ currentSessionId: id }),

    // Connection / debate flow
    setConnected: (connected) => set({ isConnected: connected }),
    setDebating: (debating) => set({ isDebating: debating }),
    setPhase: (phase, status = '', node = '') =>
        set({ phase, currentStatus: status, currentNode: node }),

    // Dialogue
    appendDialogueEntry: (entry) =>
        set((state) => ({
            currentSession: state.currentSession
                ? {
                    ...state.currentSession,
                    dialogue_history: [...state.currentSession.dialogue_history, entry],
                }
                : null,
        })),

    startStreaming: (role) => set({ streamingRole: role, streamingContent: '' }),

    appendStreamToken: (token) =>
        set((state) => ({ streamingContent: state.streamingContent + token })),

    endStreaming: (role, content, citations) =>
        set((state) => {
            const history = state.currentSession?.dialogue_history || [];
            const isDuplicate = history.some(
                e => e.role === role && e.content === content && e.timestamp
            );
            if (isDuplicate) {
                return {
                    streamingRole: '',
                    streamingContent: '',
                };
            }
            const entry: DialogueEntry = {
                role,
                agent_name: role === 'proposer' ? '正方 (Proposer)' : '反方 (Opposer)',
                content,
                citations,
                timestamp: new Date().toISOString(),
            };
            return {
                streamingRole: '',
                streamingContent: '',
                currentSession: state.currentSession
                    ? {
                        ...state.currentSession,
                        dialogue_history: [...history, entry],
                    }
                    : null,
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
        set((state) => ({
            currentSession: state.currentSession
                ? { ...state.currentSession, cumulative_scores: scores }
                : null,
        })),

    advanceTurn: (turn) =>
        set((state) => ({
            currentSession: state.currentSession
                ? { ...state.currentSession, current_turn: turn }
                : null,
        })),

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
