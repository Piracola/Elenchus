import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useDebateStore, getCollapsedAgentMessagesForSession } from '../stores/debateStore';
import { useForegroundDebateSelector } from './useForegroundDebateSelector';
import type { RunStatus, SessionStatus } from '../types';

const RUN_STATUSES_IN_PROGRESS = new Set<RunStatus>([
    'initializing',
    'running',
    'retrying',
    'recovering',
    'stopping',
]);

export function isRunStatusInProgress(runStatus: RunStatus | null | undefined): boolean {
    return Boolean(runStatus && RUN_STATUSES_IN_PROGRESS.has(runStatus));
}

function latestRunStatusToSessionStatus(runStatus: RunStatus | null | undefined): SessionStatus | null {
    if (!runStatus) return null;
    if (isRunStatusInProgress(runStatus)) return 'in_progress';
    if (runStatus === 'completed') return 'completed';
    if (runStatus === 'failed') return 'error';
    return 'pending';
}

export function useSessionViewState() {
    const currentSession = useDebateStore((state) => state.currentSession);
    const activeRun = useDebateStore((state) => state.activeRun);

    return useMemo(() => {
        const currentTurn = activeRun?.current_turn ?? currentSession?.current_turn ?? 0;
        const sessionStatus = latestRunStatusToSessionStatus(activeRun?.status) ?? currentSession?.status ?? null;
        const displayTurn = currentSession && sessionStatus === 'in_progress'
            ? Math.min(currentTurn + 1, currentSession.max_turns ?? 0)
            : currentTurn;

        return {
            currentSession,
            currentSessionId: currentSession?.id ?? null,
            currentTopic: currentSession?.topic ?? '',
            debateMode: currentSession?.debate_mode ?? 'standard',
            participants: currentSession?.participants,
            currentTurn,
            displayTurn,
            maxTurns: currentSession?.max_turns ?? 0,
            modeArtifactsLength: currentSession?.mode_artifacts?.length ?? 0,
            sessionStatus,
            runStatus: activeRun?.status ?? null,
            hasCurrentSession: currentSession !== null,
        };
    }, [activeRun?.current_turn, activeRun?.status, currentSession]);
}

export function useSessionListViewState() {
    return useDebateStore(useShallow((state) => ({
        sessions: state.sessions,
        currentSessionId: state.currentSession?.id ?? null,
    })));
}

export function useSessionActions() {
    return useDebateStore(useShallow((state) => ({
        setSessions: state.setSessions,
        setCurrentSession: state.setCurrentSession,
        updateCurrentSessionAgentConfigs: state.updateCurrentSessionAgentConfigs,
    })));
}

export function useChatUiState() {
    return useDebateStore(useShallow((state) => ({
        isDocumentVisible: state.isDocumentVisible,
        visibilityResumeToken: state.visibilityResumeToken,
    })));
}

export function useRuntimeViewState() {
    const sessionStatus = useDebateStore((state) => (
        latestRunStatusToSessionStatus(state.activeRun?.status) ?? state.currentSession?.status ?? null
    ));
    const runStatus = useDebateStore((state) => state.activeRun?.status ?? null);
    const activeRunId = useDebateStore((state) => state.activeRunId);
    const debateMode = useDebateStore((state) => state.currentSession?.debate_mode ?? 'standard');
    const currentSessionId = useDebateStore((state) => state.currentSession?.id ?? null);
    const currentTopic = useDebateStore((state) => state.currentSession?.topic ?? '');
    const runtimeEvents = useForegroundDebateSelector((state) => state.runtimeEvents);
    const phase = useForegroundDebateSelector((state) => state.phase);
    const currentStatus = useForegroundDebateSelector((state) => state.currentStatus);
    const currentNode = useForegroundDebateSelector((state) => state.currentNode);
    const isDebating = useForegroundDebateSelector((state) => state.isDebating);
    const isDocumentVisible = useDebateStore((state) => state.isDocumentVisible);

    return {
        sessionStatus,
        runStatus,
        activeRunId,
        debateMode,
        currentSessionId,
        currentTopic,
        runtimeEvents,
        runtimeEventCount: runtimeEvents.length,
        phase,
        currentStatus,
        currentNode,
        isDebating,
        isDocumentVisible,
    };
}

export function useTranscriptViewState() {
    const { currentSessionId, debateMode, participants, currentTurn, displayTurn, maxTurns, modeArtifactsLength } = useSessionViewState();
    const { isDocumentVisible, visibilityResumeToken } = useChatUiState();
    const dialogueHistory = useForegroundDebateSelector((state) => state.currentSession?.dialogue_history ?? []);
    const runtimeEvents = useForegroundDebateSelector((state) => state.runtimeEvents);
    const streamingEntry = useForegroundDebateSelector((state) => state.streamingEntry);
    const streamingContent = useForegroundDebateSelector((state) => state.streamingContent);
    const phase = useForegroundDebateSelector((state) => state.phase);
    const currentStatus = useForegroundDebateSelector((state) => state.currentStatus);
    const currentNode = useForegroundDebateSelector((state) => state.currentNode);
    const isDebating = useForegroundDebateSelector((state) => state.isDebating);
    const collapsedAgentMessages = useDebateStore((state) => (
        getCollapsedAgentMessagesForSession(state, currentSessionId)
    ));

    return {
        currentSessionId,
        debateMode,
        participants,
        currentTurn,
        displayTurn,
        maxTurns,
        modeArtifactsLength,
        isDocumentVisible,
        visibilityResumeToken,
        dialogueHistory,
        runtimeEvents,
        streamingEntry,
        streamingContent,
        phase,
        currentStatus,
        currentNode,
        isDebating,
        collapsedAgentMessages,
    };
}

export function useTranscriptActions() {
    return useDebateStore(useShallow((state) => ({
        toggleAgentMessageCollapsed: state.toggleAgentMessageCollapsed,
        setAllAgentMessagesCollapsed: state.setAllAgentMessagesCollapsed,
        clearSessionCollapsedAgentMessages: state.clearSessionCollapsedAgentMessages,
    })));
}

export function useConnectionViewState() {
    return useDebateStore(useShallow((state) => ({
        isConnected: state.isConnected,
        isDebating: state.isDebating,
        currentSession: state.currentSession,
        activeRun: state.activeRun,
        activeRunId: state.activeRunId,
    })));
}
