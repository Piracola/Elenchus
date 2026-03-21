/**
 * groupDialogue - pure function to group dialogue entries into display rows.
 * Each row pairs an agent speech with its judge evaluation (if any).
 */

import type { DialogueEntry } from '../types';

export interface DialogueRow {
    agent: DialogueEntry | null;
    judge: DialogueEntry | null;
    system?: DialogueEntry;
    turn?: number;
}

function appendPendingIndex(map: Map<string, number[]>, key: string, index: number) {
    const pending = map.get(key);
    if (pending) {
        pending.push(index);
        return;
    }
    map.set(key, [index]);
}

function takePendingIndex(map: Map<string, number[]>, rows: DialogueRow[], key: string): number | null {
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

export function groupDialogue(entries: DialogueEntry[], participants?: string[]): DialogueRow[] {
    const rows: DialogueRow[] = [];
    const speakerRoles = new Set(participants || ['proposer', 'opposer']);
    const observerRoles = new Set(['sophistry_round_report', 'sophistry_final_report']);
    const pendingByRole = new Map<string, number[]>();
    const pendingByRoleAndTurn = new Map<string, number[]>();
    const pendingByRoleWithoutTurn = new Map<string, number[]>();
    const pendingSpeakerByTurn = new Map<string, number[]>();
    const pendingSpeakerWithoutTurn = new Map<string, number[]>();
    const pendingSpeakers = new Map<string, number[]>();

    for (const entry of entries) {
        if (speakerRoles.has(entry.role)) {
            const nextIndex = rows.length;
            rows.push({ agent: entry, judge: null, turn: entry.turn });
            appendPendingIndex(pendingByRole, entry.role, nextIndex);
            appendPendingIndex(pendingSpeakers, 'all', nextIndex);
            if (entry.turn === undefined) {
                appendPendingIndex(pendingByRoleWithoutTurn, entry.role, nextIndex);
                appendPendingIndex(pendingSpeakerWithoutTurn, 'all', nextIndex);
            } else {
                appendPendingIndex(pendingByRoleAndTurn, `${entry.role}:${entry.turn}`, nextIndex);
                appendPendingIndex(pendingSpeakerByTurn, String(entry.turn), nextIndex);
            }
            continue;
        }

        if (entry.role === 'judge') {
            const targetRole = entry.target_role ?? '';
            let matchIndex: number | null = null;

            if (targetRole) {
                if (entry.turn !== undefined) {
                    matchIndex = takePendingIndex(
                        pendingByRoleAndTurn,
                        rows,
                        `${targetRole}:${entry.turn}`,
                    );
                    if (matchIndex === null) {
                        matchIndex = takePendingIndex(pendingByRoleWithoutTurn, rows, targetRole);
                    }
                } else {
                    matchIndex = takePendingIndex(pendingByRole, rows, targetRole);
                }
            }

            if (matchIndex !== null) {
                rows[matchIndex].judge = entry;
                rows[matchIndex].turn = rows[matchIndex].turn ?? entry.turn;
            } else {
                rows.push({ agent: null, judge: entry, turn: entry.turn });
            }
            continue;
        }

        if (observerRoles.has(entry.role)) {
            let matchIndex: number | null = null;
            if (entry.turn !== undefined) {
                matchIndex = takePendingIndex(pendingSpeakerByTurn, rows, String(entry.turn));
                if (matchIndex === null) {
                    matchIndex = takePendingIndex(pendingSpeakerWithoutTurn, rows, 'all');
                }
            } else {
                matchIndex = takePendingIndex(pendingSpeakers, rows, 'all');
            }

            if (matchIndex !== null) {
                rows[matchIndex].judge = entry;
                rows[matchIndex].turn = rows[matchIndex].turn ?? entry.turn;
            } else {
                rows.push({ agent: null, judge: entry, turn: entry.turn });
            }
            continue;
        }

        rows.push({ agent: null, judge: null, system: entry, turn: entry.turn });
    }

    return rows;
}
