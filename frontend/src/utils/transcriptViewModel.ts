import type { DialogueEntry, RuntimeEvent } from '../types';
import type { DialogueGroupingState, DialogueRow } from './groupDialogue';
import { buildDialogueGroupingState } from './groupDialogue';
import { resolveRowFocus, type RowFocusState } from './eventFocus';
import {
    eventMatchesTurn,
    buildSpeakerDiscussionMap,
    buildTurnDiscussionMap,
    sideLabel,
    speakerInsightKey,
} from './roundInsights';
import type { InsightSection } from '../components/chat/RoundInsights';

export interface TranscriptRowViewModel {
    key: string;
    row: DialogueRow;
    focus: RowFocusState;
    insightSections: InsightSection[];
    jurySections: InsightSection[];
    juryFocused: boolean;
}

export interface TranscriptViewModel {
    rows: DialogueRow[];
    rowViewModels: TranscriptRowViewModel[];
    focusedRowIndex: number;
    consensusEntries: DialogueEntry[];
    consensusFocused: boolean;
    groupingState: DialogueGroupingState;
}

function filterReplayHistory(entries: DialogueEntry[], visibleEventIds: Set<string> | null): DialogueEntry[] {
    if (!visibleEventIds) {
        return entries;
    }

    return entries.filter((entry) => !entry.event_id || visibleEventIds.has(entry.event_id));
}

export function buildTranscriptViewModel({
    dialogueHistory,
    teamDialogueHistory,
    juryDialogueHistory,
    participants,
    replayEnabled,
    visibleEventIds,
    focusedRuntimeEvent,
    previousGroupingState,
}: {
    dialogueHistory: DialogueEntry[];
    teamDialogueHistory: DialogueEntry[];
    juryDialogueHistory: DialogueEntry[];
    participants?: string[];
    replayEnabled: boolean;
    visibleEventIds: Set<string> | null;
    focusedRuntimeEvent: RuntimeEvent | null;
    previousGroupingState?: DialogueGroupingState | null;
}): TranscriptViewModel {
    const filteredDialogueHistory = replayEnabled
        ? filterReplayHistory(dialogueHistory, visibleEventIds)
        : dialogueHistory;
    const filteredTeamDiscussion = replayEnabled
        ? filterReplayHistory(teamDialogueHistory, visibleEventIds)
        : teamDialogueHistory;
    const filteredJuryDiscussion = replayEnabled
        ? filterReplayHistory(juryDialogueHistory, visibleEventIds)
        : juryDialogueHistory;

    const groupingState = buildDialogueGroupingState(
        filteredDialogueHistory,
        participants,
        replayEnabled ? null : previousGroupingState,
    );
    const rows = groupingState.rows;
    const teamDiscussionMap = buildSpeakerDiscussionMap(filteredTeamDiscussion);
    const juryDiscussionMap = buildTurnDiscussionMap(filteredJuryDiscussion);
    const consensusEntries = filteredJuryDiscussion.filter((entry) => entry.role === 'consensus_summary');
    const consensusFocused = focusedRuntimeEvent?.type === 'consensus_summary';

    let focusedRowIndex = -1;
    const rowViewModels = rows.map((row, index) => {
        const turn = row.turn ?? row.agent?.turn ?? row.judge?.turn;
        const agentRole = row.agent?.role;
        const focus = resolveRowFocus(row, focusedRuntimeEvent);
        if (focusedRowIndex < 0 && (focus.agent || focus.judge || focus.system)) {
            focusedRowIndex = index;
        }

        const insightSections: InsightSection[] = [];
        const teamKey = speakerInsightKey(turn, agentRole);
        const teamEntries = teamKey ? teamDiscussionMap.get(teamKey) ?? [] : [];
        if (teamEntries.length) {
            insightSections.push({
                key: `team-${teamKey}`,
                title: `${sideLabel(agentRole)}组内讨论`,
                accent: agentRole === 'opposer' ? 'var(--color-opposer)' : 'var(--color-proposer)',
                entries: teamEntries,
            });
        }

        const nextRow = rows[index + 1];
        const nextTurn = nextRow?.turn ?? nextRow?.agent?.turn ?? nextRow?.judge?.turn;
        const isLastRowOfTurn = turn !== undefined && nextTurn !== turn;
        const juryEntries = isLastRowOfTurn && turn !== undefined
            ? juryDiscussionMap.get(turn) ?? []
            : [];
        const safeTurn = turn ?? 0;
        const juryFocused = turn !== undefined
            && (focusedRuntimeEvent?.type === 'jury_discussion' || focusedRuntimeEvent?.type === 'jury_summary')
            && eventMatchesTurn(focusedRuntimeEvent, turn);
        const agentKey = row.agent?.timestamp || row.agent?.event_id || `agent-${index}`;
        const judgeKey = row.judge?.timestamp || row.judge?.event_id || `judge-${index}`;
        const systemKey = row.system?.timestamp || row.system?.event_id || `system-${index}`;

        return {
            key: `${agentKey}-${judgeKey}-${systemKey}-${index}`,
            row,
            focus,
            insightSections,
            jurySections: juryEntries.length
                ? [{
                    key: `jury-${safeTurn}`,
                    title: `第 ${safeTurn + 1} 轮陪审团评议`,
                    accent: 'var(--accent-indigo)',
                    entries: juryEntries,
                }]
                : [],
            juryFocused,
        };
    });

    return {
        rows,
        rowViewModels,
        focusedRowIndex,
        consensusEntries,
        consensusFocused,
        groupingState,
    };
}
