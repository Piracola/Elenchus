import type { DialogueEntry } from '../../types';
import type { DialogueGroupingState, DialogueRow } from './groupDialogue';
import { buildDialogueGroupingState } from './groupDialogue';
import type { InsightSection } from '../../components/chat/RoundInsights';
import { EMPTY_LIVE_TRANSCRIPT, type LiveTranscriptViewModel } from './liveTranscript';

export interface TranscriptRowViewModel {
    key: string;
    row: DialogueRow;
    insightSections: InsightSection[];
    agentCollapseKey: string | null;
}

function sanitizeCollapseKeyPart(value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }
    return String(value).replace(/[|]/g, '_');
}

function buildAgentCollapseKey(entry: DialogueEntry | null | undefined): string | null {
    if (!entry) {
        return null;
    }
    if (entry.event_id) {
        return `event:${entry.event_id}`;
    }
    return [
        'agent',
        sanitizeCollapseKeyPart(entry.role),
        sanitizeCollapseKeyPart(entry.turn),
        sanitizeCollapseKeyPart(entry.timestamp),
        sanitizeCollapseKeyPart(entry.agent_name),
        sanitizeCollapseKeyPart(entry.content),
    ].join('|');
}

export function getTranscriptAgentCollapseKeys(rowViewModels: TranscriptRowViewModel[]): string[] {
    const keys = rowViewModels
        .map((viewModel) => viewModel.agentCollapseKey)
        .filter((value): value is string => Boolean(value));
    return Array.from(new Set(keys));
}

function areAllTranscriptAgentMessagesCollapsed(
    rowViewModels: TranscriptRowViewModel[],
    collapsedMap: Record<string, boolean>,
): boolean {
    const keys = getTranscriptAgentCollapseKeys(rowViewModels);
    return keys.length > 0 && keys.every((key) => collapsedMap[key]);
}

export function getTranscriptCollapseSummary(
    rowViewModels: TranscriptRowViewModel[],
    collapsedMap: Record<string, boolean>,
): { keys: string[]; hasAgentRows: boolean; allCollapsed: boolean } {
    const keys = getTranscriptAgentCollapseKeys(rowViewModels);
    return {
        keys,
        hasAgentRows: keys.length > 0,
        allCollapsed: areAllTranscriptAgentMessagesCollapsed(rowViewModels, collapsedMap),
    };
}

export function isTranscriptAgentMessageCollapsed(
    collapseKey: string | null,
    collapsedMap: Record<string, boolean>,
): boolean {
    return Boolean(collapseKey && collapsedMap[collapseKey]);
}

export { buildAgentCollapseKey };


export interface TranscriptViewModel {
    rows: DialogueRow[];
    rowViewModels: TranscriptRowViewModel[];
    focusedRowIndex: number;
    consensusEntries: DialogueEntry[];
    liveTranscript: LiveTranscriptViewModel;
    groupingState: DialogueGroupingState;
}

function isConsensusEntry(entry: DialogueEntry): boolean {
    return entry.role === 'consensus_summary' || entry.discussion_kind === 'consensus';
}

export function buildTranscriptViewModel({
    dialogueHistory,
    participants,
    liveTranscript,
    previousGroupingState,
}: {
    dialogueHistory: DialogueEntry[];
    participants?: string[];
    liveTranscript?: LiveTranscriptViewModel;
    previousGroupingState?: DialogueGroupingState | null;
}): TranscriptViewModel {
    const timelineEntries = dialogueHistory.filter((entry) => !isConsensusEntry(entry));
    const groupingState = buildDialogueGroupingState(
        timelineEntries,
        participants,
        previousGroupingState,
    );
    const rows = groupingState.rows;
    const consensusEntries = dialogueHistory.filter(isConsensusEntry);

    const focusedRowIndex = -1;
    const rowViewModels = rows.map((row, index) => {
        const agentKey = row.agent?.timestamp || row.agent?.event_id || `agent-${index}`;
        const judgeKey = row.judge?.timestamp || row.judge?.event_id || `judge-${index}`;
        const systemKey = row.system?.timestamp || row.system?.event_id || `system-${index}`;

        return {
            key: `${agentKey}-${judgeKey}-${systemKey}-${index}`,
            row,
            insightSections: [],
            agentCollapseKey: buildAgentCollapseKey(row.agent),
        };
    });

    return {
        rows,
        rowViewModels,
        focusedRowIndex,
        consensusEntries,
        liveTranscript: liveTranscript ?? EMPTY_LIVE_TRANSCRIPT,
        groupingState,
    };
}
