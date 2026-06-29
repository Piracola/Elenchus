import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSessionViewState, useTranscriptActions, useTranscriptViewState } from '../useDebateViewState';
import {
    buildTranscriptViewModel,
    getTranscriptCollapseSummary,
} from '../../utils/chat/transcriptViewModel';
import { buildLiveTranscriptViewModel } from '../../utils/chat/liveTranscript';
import type { DialogueGroupingState } from '../../utils/chat/groupDialogue';

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
        participants,
        runtimeEvents,
        streamingEntry,
        streamingContent,
        phase,
        currentStatus,
        currentNode,
        isDebating,
        collapsedAgentMessages,
    } = useTranscriptViewState();
    const { setAllAgentMessagesCollapsed } = useTranscriptActions();
    const transcriptGroupingStateRef = useRef<DialogueGroupingState | null>(null);

    useEffect(() => {
        transcriptGroupingStateRef.current = null;
    }, [currentSessionId, participants]);

    const transcriptViewModel = useMemo(() => {
        const liveTranscript = buildLiveTranscriptViewModel({
            currentSessionId,
            currentTurn,
            participants,
            dialogueHistory,
            runtimeEvents,
            streamingEntry,
            streamingContent,
            phase,
            currentNode,
            currentStatus,
            isDebating,
        });
        const viewModel = buildTranscriptViewModel({
            dialogueHistory,
            participants,
            liveTranscript,
            // eslint-disable-next-line react-hooks/refs -- preserve the previous grouping snapshot across renders
            previousGroupingState: transcriptGroupingStateRef.current,
        });

        // eslint-disable-next-line react-hooks/refs -- cache the latest grouping snapshot for the next render
        transcriptGroupingStateRef.current = viewModel.groupingState;
        return viewModel;
    }, [
        currentNode,
        currentSessionId,
        currentStatus,
        currentTurn,
        dialogueHistory,
        isDebating,
        participants,
        phase,
        runtimeEvents,
        streamingContent,
        streamingEntry,
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
        collapsedAgentMessages,
        transcriptViewModel,
        transcriptCollapseSummary,
        bulkCollapseLabel,
        handleToggleAllAgentMessages,
    };
}
