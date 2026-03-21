/**
 * groupDialogue — pure function to group dialogue entries into display rows.
 * Each row pairs an agent speech with its judge evaluation (if any).
 */

import type { DialogueEntry } from '../types';

export interface DialogueRow {
    agent: DialogueEntry | null;
    judge: DialogueEntry | null;
    system?: DialogueEntry;
    turn?: number;
}

export function groupDialogue(entries: DialogueEntry[], participants?: string[]): DialogueRow[] {
    const rows: DialogueRow[] = [];
    const speakerRoles = participants || ['proposer', 'opposer'];
    const observerRoles = new Set(['sophistry_round_report', 'sophistry_final_report']);

    for (const entry of entries) {
        if (speakerRoles.includes(entry.role)) {
            rows.push({ agent: entry, judge: null, turn: entry.turn });
        } else if (entry.role === 'judge') {
            let matched = false;
            for (let i = rows.length - 1; i >= 0; i--) {
                if (
                    rows[i].agent &&
                    rows[i].agent!.role === entry.target_role &&
                    (entry.turn === undefined || rows[i].agent!.turn === undefined || rows[i].agent!.turn === entry.turn) &&
                    !rows[i].judge
                ) {
                    rows[i].judge = entry;
                    rows[i].turn = rows[i].turn ?? entry.turn;
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                rows.push({ agent: null, judge: entry, turn: entry.turn });
            }
        } else if (observerRoles.has(entry.role)) {
            let matched = false;
            for (let i = rows.length - 1; i >= 0; i--) {
                if (
                    rows[i].agent &&
                    !rows[i].judge &&
                    (entry.turn === undefined || rows[i].agent!.turn === undefined || rows[i].agent!.turn === entry.turn)
                ) {
                    rows[i].judge = entry;
                    rows[i].turn = rows[i].turn ?? entry.turn;
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                rows.push({ agent: null, judge: entry, turn: entry.turn });
            }
        } else {
            rows.push({ agent: null, judge: null, system: entry, turn: entry.turn });
        }
    }

    return rows;
}
