import type { Session, SessionListItem } from '../types';

export function toSessionListItem(session: Session | SessionListItem): SessionListItem {
    return {
        id: session.id,
        topic: session.topic,
        debate_mode: session.debate_mode ?? 'standard',
        status: session.status,
        current_turn: session.current_turn,
        max_turns: session.max_turns,
        created_at: session.created_at,
    };
}

function getSessionCreatedAtValue(session: SessionListItem): number {
    const value = Date.parse(session.created_at);
    return Number.isFinite(value) ? value : 0;
}

export function sortSessionListItems(a: SessionListItem, b: SessionListItem): number {
    const createdAtDiff = getSessionCreatedAtValue(b) - getSessionCreatedAtValue(a);
    if (createdAtDiff !== 0) {
        return createdAtDiff;
    }
    return a.id.localeCompare(b.id);
}

export function upsertSessionListItem(
    sessions: SessionListItem[],
    session: Session | SessionListItem,
): SessionListItem[] {
    const nextItem = toSessionListItem(session);
    const existingIndex = sessions.findIndex((item) => item.id === nextItem.id);

    if (existingIndex < 0) {
        return [...sessions, nextItem].sort(sortSessionListItems);
    }

    const nextSessions = [...sessions];
    nextSessions[existingIndex] = nextItem;
    return nextSessions.sort(sortSessionListItems);
}

export function mergeSessionPage(
    sessions: SessionListItem[],
    incoming: SessionListItem[],
): SessionListItem[] {
    const merged = new Map(sessions.map((session) => [session.id, session]));
    for (const session of incoming) {
        merged.set(session.id, session);
    }
    return Array.from(merged.values()).sort(sortSessionListItems);
}

export function filterSessionsByQuery(
    sessions: SessionListItem[],
    query: string,
): SessionListItem[] {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
        return sessions;
    }
    return sessions.filter((session) => session.topic.toLowerCase().includes(normalizedQuery));
}
