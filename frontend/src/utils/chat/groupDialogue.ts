/**
 * groupDialogue - pure helpers to group dialogue entries into display rows.
 * Each row pairs an agent speech with its judge evaluation (if any).
 */

import type { DialogueEntry } from '../../types';

export interface DialogueRow {
    agent: DialogueEntry | null;
    judge: DialogueEntry | null;
    system?: DialogueEntry;
    turn?: number;
}

type PendingIndexMap = Map<string, number[]>;

export interface DialogueGroupingState {
    rows: DialogueRow[];
    participantsKey: string;
    sourceLength: number;
    lastSourceEntry: DialogueEntry | null;
    pendingByRole: PendingIndexMap;
    pendingByRoleAndTurn: PendingIndexMap;
    pendingByRoleWithoutTurn: PendingIndexMap;
    pendingSpeakerByTurn: PendingIndexMap;
    pendingSpeakerWithoutTurn: PendingIndexMap;
    pendingSpeakers: PendingIndexMap;
}

function appendPendingIndex(map: PendingIndexMap, key: string, index: number) {
    const pending = map.get(key);
    if (pending) {
        pending.push(index);
        return;
    }
    map.set(key, [index]);
}

function takePendingIndex(map: PendingIndexMap, rows: DialogueRow[], key: string): number | null {
    const pending = map.get(key);
    if (!pending) return null;

    while (pending.length > 0) {
        const index = pending.pop();
        if (index === undefined) continue;
        if (!rows[index]?.judge) {
            return index;
        }
    }

    map.delete(key);
    return null;
}

function clonePendingMap(map: PendingIndexMap): PendingIndexMap {
    return new Map(Array.from(map.entries(), ([key, value]) => [key, [...value]]));
}

function getParticipantsKey(participants?: string[]): string {
    return (participants && participants.length ? participants : ['proposer', 'opposer']).join('|');
}

function createGroupingState(participants?: string[]): DialogueGroupingState {
    return {
        rows: [],
        participantsKey: getParticipantsKey(participants),
        sourceLength: 0,
        lastSourceEntry: null,
        pendingByRole: new Map(),
        pendingByRoleAndTurn: new Map(),
        pendingByRoleWithoutTurn: new Map(),
        pendingSpeakerByTurn: new Map(),
        pendingSpeakerWithoutTurn: new Map(),
        pendingSpeakers: new Map(),
    };
}

function cloneGroupingState(state: DialogueGroupingState): DialogueGroupingState {
    return {
        rows: state.rows.slice(),
        participantsKey: state.participantsKey,
        sourceLength: state.sourceLength,
        lastSourceEntry: state.lastSourceEntry,
        pendingByRole: clonePendingMap(state.pendingByRole),
        pendingByRoleAndTurn: clonePendingMap(state.pendingByRoleAndTurn),
        pendingByRoleWithoutTurn: clonePendingMap(state.pendingByRoleWithoutTurn),
        pendingSpeakerByTurn: clonePendingMap(state.pendingSpeakerByTurn),
        pendingSpeakerWithoutTurn: clonePendingMap(state.pendingSpeakerWithoutTurn),
        pendingSpeakers: clonePendingMap(state.pendingSpeakers),
    };
}

function applyDialogueEntry(
    state: DialogueGroupingState,
    entry: DialogueEntry,
    participants?: string[],
) {
    const speakerRoles = new Set(participants || ['proposer', 'opposer']);
    const observerRoles = new Set(['sophistry_round_report', 'sophistry_final_report']);
    const { rows } = state;

    if (speakerRoles.has(entry.role)) {
        const nextIndex = rows.length;
        rows.push({ agent: entry, judge: null, turn: entry.turn });
        appendPendingIndex(state.pendingByRole, entry.role, nextIndex);
        appendPendingIndex(state.pendingSpeakers, 'all', nextIndex);

        if (entry.turn === undefined) {
            appendPendingIndex(state.pendingByRoleWithoutTurn, entry.role, nextIndex);
            appendPendingIndex(state.pendingSpeakerWithoutTurn, 'all', nextIndex);
        } else {
            appendPendingIndex(state.pendingByRoleAndTurn, `${entry.role}:${entry.turn}`, nextIndex);
            appendPendingIndex(state.pendingSpeakerByTurn, String(entry.turn), nextIndex);
        }
        return;
    }

    if (entry.role === 'judge') {
        const targetRole = entry.target_role ?? '';
        let matchIndex: number | null = null;

        if (targetRole) {
            if (entry.turn !== undefined) {
                matchIndex = takePendingIndex(
                    state.pendingByRoleAndTurn,
                    rows,
                    `${targetRole}:${entry.turn}`,
                );
                if (matchIndex === null) {
                    matchIndex = takePendingIndex(state.pendingByRoleWithoutTurn, rows, targetRole);
                }
            } else {
                matchIndex = takePendingIndex(state.pendingByRole, rows, targetRole);
            }
        }

        if (matchIndex !== null) {
            rows[matchIndex].judge = entry;
            rows[matchIndex].turn = rows[matchIndex].turn ?? entry.turn;
        } else {
            rows.push({ agent: null, judge: entry, turn: entry.turn });
        }
        return;
    }

    if (observerRoles.has(entry.role)) {
        let matchIndex: number | null = null;
        if (entry.turn !== undefined) {
            matchIndex = takePendingIndex(state.pendingSpeakerByTurn, rows, String(entry.turn));
            if (matchIndex === null) {
                matchIndex = takePendingIndex(state.pendingSpeakerWithoutTurn, rows, 'all');
            }
        } else {
            matchIndex = takePendingIndex(state.pendingSpeakers, rows, 'all');
        }

        if (matchIndex !== null) {
            rows[matchIndex].judge = entry;
            rows[matchIndex].turn = rows[matchIndex].turn ?? entry.turn;
        } else {
            rows.push({ agent: null, judge: entry, turn: entry.turn });
        }
        return;
    }

    rows.push({ agent: null, judge: null, system: entry, turn: entry.turn });
}

export function buildDialogueGroupingState(
    entries: DialogueEntry[],
    participants?: string[],
    previousState?: DialogueGroupingState | null,
): DialogueGroupingState {
    const participantsKey = getParticipantsKey(participants);
    const canIncrementallyAppend = Boolean(
        previousState
        && previousState.participantsKey === participantsKey
        && entries.length >= previousState.sourceLength
        && (
            previousState.sourceLength === 0
            || entries[previousState.sourceLength - 1] === previousState.lastSourceEntry
        ),
    );

    const nextState = canIncrementallyAppend && previousState
        ? cloneGroupingState(previousState)
        : createGroupingState(participants);
    const startIndex = canIncrementallyAppend && previousState ? previousState.sourceLength : 0;

    for (let index = startIndex; index < entries.length; index += 1) {
        applyDialogueEntry(nextState, entries[index], participants);
    }

    nextState.sourceLength = entries.length;
    nextState.lastSourceEntry = entries.length ? entries[entries.length - 1] ?? null : null;
    return nextState;
}

export function groupDialogue(entries: DialogueEntry[], participants?: string[]): DialogueRow[] {
    return buildDialogueGroupingState(entries, participants).rows;
}
