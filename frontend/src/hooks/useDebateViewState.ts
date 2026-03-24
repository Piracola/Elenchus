import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useDebateStore, getCollapsedAgentMessagesForSession } from '../stores/debateStore';
import { useForegroundDebateSelector } from './useForegroundDebateSelector';

export function useSessionViewState() {
    const currentSession = useDebateStore((state) => state.currentSession);

    return useMemo(() => ({
        currentSession,
        currentSessionId: currentSession?.id ?? null,
        currentTopic: currentSession?.topic ?? '',
        debateMode: currentSession?.debate_mode ?? 'standard',
        participants: currentSession?.participants,
        currentTurn: currentSession?.current_turn ?? 0,
        maxTurns: currentSession?.max_turns ?? 0,
        modeArtifactsLength: currentSession?.mode_artifacts?.length ?? 0,
        sessionStatus: currentSession?.status ?? null,
        hasCurrentSession: currentSession !== null,
    }), [currentSession]);
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
    })));
}

export function useChatUiState() {
    return useDebateStore(useShallow((state) => ({
        isDocumentVisible: state.isDocumentVisible,
        visibilityResumeToken: state.visibilityResumeToken,
    })));
}

export function useRuntimeViewState() {
    const sessionStatus = useDebateStore((state) => state.currentSession?.status ?? null);
    const debateMode = useDebateStore((state) => state.currentSession?.debate_mode ?? 'standard');
    const currentSessionId = useDebateStore((state) => state.currentSession?.id ?? null);
    const currentTopic = useDebateStore((state) => state.currentSession?.topic ?? '');
    const runtimeEvents = useForegroundDebateSelector((state) => state.runtimeEvents);
    const visibleRuntimeEvents = useForegroundDebateSelector((state) => state.visibleRuntimeEvents);
    const replayEnabled = useForegroundDebateSelector((state) => state.replayEnabled);
    const replayCursor = useForegroundDebateSelector((state) => state.replayCursor);
    const focusedRuntimeEventId = useForegroundDebateSelector((state) => state.focusedRuntimeEventId);
    const hasOlderRuntimeEvents = useForegroundDebateSelector((state) => state.hasOlderRuntimeEvents);
    const phase = useForegroundDebateSelector((state) => state.phase);
    const currentStatus = useForegroundDebateSelector((state) => state.currentStatus);
    const currentNode = useForegroundDebateSelector((state) => state.currentNode);
    const isDebating = useForegroundDebateSelector((state) => state.isDebating);
    const isDocumentVisible = useDebateStore((state) => state.isDocumentVisible);

    return {
        sessionStatus,
        debateMode,
        currentSessionId,
        currentTopic,
        runtimeEvents,
        runtimeEventCount: runtimeEvents.length,
        visibleRuntimeEvents,
        replayEnabled,
        replayCursor,
        focusedRuntimeEventId,
        hasOlderRuntimeEvents,
        phase,
        currentStatus,
        currentNode,
        isDebating,
        isDocumentVisible,
    };
}

export function useRuntimeActions() {
    return useDebateStore(useShallow((state) => ({
        setFocusedRuntimeEventId: state.setFocusedRuntimeEventId,
        setReplayEnabled: state.setReplayEnabled,
        setReplayCursor: state.setReplayCursor,
        stepReplay: state.stepReplay,
        exitReplay: state.exitReplay,
        loadRuntimeEventSnapshot: state.loadRuntimeEventSnapshot,
        hydrateRuntimeEvents: state.hydrateRuntimeEvents,
        prependRuntimeEvents: state.prependRuntimeEvents,
    })));
}

export function useTranscriptViewState() {
    const { currentSessionId, debateMode, participants, currentTurn, maxTurns, modeArtifactsLength } = useSessionViewState();
    const { isDocumentVisible, visibilityResumeToken } = useChatUiState();
    const dialogueHistory = useForegroundDebateSelector((state) => state.currentSession?.dialogue_history ?? []);
    const teamDialogueHistory = useForegroundDebateSelector((state) => state.currentSession?.team_dialogue_history ?? []);
    const juryDialogueHistory = useForegroundDebateSelector((state) => state.currentSession?.jury_dialogue_history ?? []);
    const visibleRuntimeEvents = useForegroundDebateSelector((state) => state.visibleRuntimeEvents);
    const replayEnabled = useForegroundDebateSelector((state) => state.replayEnabled);
    const focusedRuntimeEventId = useForegroundDebateSelector((state) => state.focusedRuntimeEventId);
    const collapsedAgentMessages = useDebateStore((state) => (
        getCollapsedAgentMessagesForSession(state, currentSessionId)
    ));

    return {
        currentSessionId,
        debateMode,
        participants,
        currentTurn,
        maxTurns,
        modeArtifactsLength,
        isDocumentVisible,
        visibilityResumeToken,
        dialogueHistory,
        teamDialogueHistory,
        juryDialogueHistory,
        visibleRuntimeEvents,
        replayEnabled,
        focusedRuntimeEventId,
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
    })));
}
