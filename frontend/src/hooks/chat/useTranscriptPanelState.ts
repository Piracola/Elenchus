import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSessionViewState, useTranscriptActions, useTranscriptViewState } from '../useDebateViewState';
import {
    buildTranscriptViewModel,
    getTranscriptCollapseSummary,
} from '../../utils/transcriptViewModel';
import type { DialogueGroupingState } from '../../utils/groupDialogue';

export function useTranscriptPanelState() {
    const {
        currentSessionId,
        debateMode,
        currentTurn,
        maxTurns,
        modeArtifactsLength,
        hasCurrentSession,
        currentTopic,
    } = useSessionViewState();
    const {
        isDocumentVisible,
        visibilityResumeToken,
        dialogueHistory,
        teamDialogueHistory,
        juryDialogueHistory,
        participants,
        visibleRuntimeEvents,
        replayEnabled,
        focusedRuntimeEventId,
        collapsedAgentMessages,
    } = useTranscriptViewState();
    const { setAllAgentMessagesCollapsed } = useTranscriptActions();
    const transcriptGroupingStateRef = useRef<DialogueGroupingState | null>(null);

    useEffect(() => {
        transcriptGroupingStateRef.current = null;
    }, [currentSessionId, participants, replayEnabled]);

    const focusedRuntimeEvent = useMemo(
        () => (
            focusedRuntimeEventId
                ? visibleRuntimeEvents.find((event) => event.event_id === focusedRuntimeEventId) ?? null
                : null
        ),
        [focusedRuntimeEventId, visibleRuntimeEvents],
    );

    const visibleEventIds = useMemo(
        () => (replayEnabled ? new Set(visibleRuntimeEvents.map((event) => event.event_id)) : null),
        [replayEnabled, visibleRuntimeEvents],
    );

    const transcriptViewModel = useMemo(() => {
        const viewModel = buildTranscriptViewModel({
            dialogueHistory,
            teamDialogueHistory,
            juryDialogueHistory,
            participants,
            replayEnabled,
            visibleEventIds,
            focusedRuntimeEvent,
            // eslint-disable-next-line react-hooks/refs -- preserve the previous grouping snapshot across renders
            previousGroupingState: replayEnabled ? null : transcriptGroupingStateRef.current,
        });

        // eslint-disable-next-line react-hooks/refs -- cache the latest grouping snapshot for the next render
        transcriptGroupingStateRef.current = replayEnabled ? null : viewModel.groupingState;
        return viewModel;
    }, [
        dialogueHistory,
        focusedRuntimeEvent,
        juryDialogueHistory,
        participants,
        replayEnabled,
        teamDialogueHistory,
        visibleEventIds,
    ]);

    const transcriptCollapseSummary = useMemo(
        () => getTranscriptCollapseSummary(transcriptViewModel.rowViewModels, collapsedAgentMessages),
        [collapsedAgentMessages, transcriptViewModel.rowViewModels],
    );

    const bulkCollapseLabel = transcriptCollapseSummary.allCollapsed ? '展开辩手发言' : '折叠辩手发言';

    const handleToggleAllAgentMessages = useCallback(() => {
        if (!currentSessionId || !transcriptCollapseSummary.hasAgentRows) {
            return;
        }
        setAllAgentMessagesCollapsed(
            currentSessionId,
            transcriptCollapseSummary.keys,
            !transcriptCollapseSummary.allCollapsed,
        );
    }, [currentSessionId, setAllAgentMessagesCollapsed, transcriptCollapseSummary]);

    return {
        currentSessionId,
        currentTopic,
        debateMode,
        currentTurn,
        maxTurns,
        modeArtifactsLength,
        hasCurrentSession,
        isDocumentVisible,
        visibilityResumeToken,
        dialogueHistoryLength: dialogueHistory.length,
        teamDialogueHistoryLength: teamDialogueHistory.length,
        juryDialogueHistoryLength: juryDialogueHistory.length,
        replayEnabled,
        focusedRuntimeEventId,
        collapsedAgentMessages,
        transcriptViewModel,
        transcriptCollapseSummary,
        bulkCollapseLabel,
        handleToggleAllAgentMessages,
    };
}
