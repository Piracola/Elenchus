import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSessionViewState, useTranscriptActions, useTranscriptViewState } from '../useDebateViewState';
import {
    buildAgentCollapseKey,
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
        displayTurn,
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
        phase,
        currentStatus,
        currentNode,
        isDebating,
        collapsedAgentMessages,
    } = useTranscriptViewState();
    const { setAllAgentMessagesCollapsed } = useTranscriptActions();
    const transcriptGroupingStateRef = useRef<DialogueGroupingState | null>(null);
    const autoCollapsedGroupDiscussionKeysRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        transcriptGroupingStateRef.current = null;
        autoCollapsedGroupDiscussionKeysRef.current = new Set();
    }, [currentSessionId, participants]);

    const transcriptViewModel = useMemo(() => {
        const liveTranscript = buildLiveTranscriptViewModel({
            currentSessionId,
            currentTurn,
            participants,
            dialogueHistory,
            runtimeEvents,
            streamingEntry,
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
        streamingEntry,
    ]);

    const transcriptCollapseSummary = useMemo(
        () => getTranscriptCollapseSummary(transcriptViewModel.rowViewModels, collapsedAgentMessages),
        [collapsedAgentMessages, transcriptViewModel.rowViewModels],
    );

    useEffect(() => {
        if (!currentSessionId) {
            return;
        }

        const nextGroupDiscussionKeys = transcriptViewModel.rowViewModels
            .filter((viewModel) => viewModel.row.agent?.role === 'group_discussion')
            .map((viewModel) => buildAgentCollapseKey(viewModel.row.agent))
            .filter((value): value is string => Boolean(value));

        if (!nextGroupDiscussionKeys.length) {
            autoCollapsedGroupDiscussionKeysRef.current = new Set();
            return;
        }

        const unseenKeys = nextGroupDiscussionKeys.filter((key) => (
            !autoCollapsedGroupDiscussionKeysRef.current.has(key)
            && !collapsedAgentMessages[key]
        ));

        autoCollapsedGroupDiscussionKeysRef.current = new Set(nextGroupDiscussionKeys);

        if (!unseenKeys.length) {
            return;
        }

        setAllAgentMessagesCollapsed(currentSessionId, unseenKeys, true);
    }, [
        collapsedAgentMessages,
        currentSessionId,
        setAllAgentMessagesCollapsed,
        transcriptViewModel.rowViewModels,
    ]);

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
        displayTurn,
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
