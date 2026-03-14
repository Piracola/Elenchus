/**
 * groupDialogue — pure function to group dialogue entries into display rows.
 * Each row pairs an agent speech with its judge evaluation (if any).
 */

import type { DialogueEntry } from '../types';

export interface DialogueRow {
    agent: DialogueEntry | null;
    judge: DialogueEntry | null;
    system?: DialogueEntry;
}

export function groupDialogue(entries: DialogueEntry[]): DialogueRow[] {
    const rows: DialogueRow[] = [];

    for (const entry of entries) {
        if (entry.role === 'proposer' || entry.role === 'opposer') {
            rows.push({ agent: entry, judge: null });
        } else if (entry.role === 'judge') {
            let matched = false;
            for (let i = rows.length - 1; i >= 0; i--) {
                if (
                    rows[i].agent &&
                    rows[i].agent!.role === (entry as any).target_role &&
                    !rows[i].judge
                ) {
                    rows[i].judge = entry;
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                rows.push({ agent: null, judge: entry });
            }
        } else {
            rows.push({ agent: null, judge: null, system: entry });
        }
    }

    return rows;
}
