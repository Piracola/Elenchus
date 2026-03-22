import type { DialogueEntry, RuntimeEvent } from '../types';

export function sideLabel(side: string | undefined): string {
    if (side === 'proposer') return '正方';
    if (side === 'opposer') return '反方';
    return side || '队内';
}

export function speakerInsightKey(turn: number | undefined, role: string | undefined): string | null {
    if (turn === undefined || !role) return null;
    return `${turn}:${role}`;
}

export function buildSpeakerDiscussionMap(entries: DialogueEntry[]): Map<string, DialogueEntry[]> {
    const groups = new Map<string, DialogueEntry[]>();
    for (const entry of entries) {
        const key = speakerInsightKey(entry.turn, entry.team_side || entry.source_role);
        if (!key) continue;
        const group = groups.get(key) ?? [];
        group.push(entry);
        groups.set(key, group);
    }
    return groups;
}

export function buildTurnDiscussionMap(entries: DialogueEntry[]): Map<number, DialogueEntry[]> {
    const groups = new Map<number, DialogueEntry[]>();
    for (const entry of entries) {
        if (entry.turn === undefined || entry.role === 'consensus_summary') continue;
        const group = groups.get(entry.turn) ?? [];
        group.push(entry);
        groups.set(entry.turn, group);
    }
    return groups;
}

export function eventMatchesTurn(
    event: Pick<RuntimeEvent, 'payload'> | null,
    turn: number,
): boolean {
    if (!event) return false;
    const payloadTurn = event.payload?.turn;
    return typeof payloadTurn === 'number' && payloadTurn === turn;
}
