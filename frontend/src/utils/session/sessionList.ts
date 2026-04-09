import type { DebateMode, Session, SessionListItem } from '../../types';

export type SessionModePresentation = {
    label: string;
    badgeBackground: string;
    badgeColor: string;
    badgeBorder: string;
    inactiveBackground: string;
    inactiveBorder: string;
    activeBackground: string;
    activeBorder: string;
    activeShadow: string;
};

export function getSessionModePresentation(mode: DebateMode): SessionModePresentation {
    if (mode === 'sophistry_experiment') {
        return {
            label: '诡辩',
            badgeBackground: 'var(--mode-sophistry-soft)',
            badgeColor: 'var(--mode-sophistry-accent)',
            badgeBorder: '1px solid var(--mode-sophistry-border)',
            inactiveBackground: 'linear-gradient(135deg, var(--mode-sophistry-bg) 0%, var(--mode-sophistry-card) 100%)',
            inactiveBorder: '1px solid var(--mode-sophistry-border)',
            activeBackground: 'var(--mode-sophistry-card)',
            activeBorder: '1px solid var(--mode-sophistry-accent)',
            activeShadow: '0 10px 24px var(--mode-sophistry-shadow)',
        };
    }

    return {
        label: '标准',
        badgeBackground: 'var(--bg-tertiary)',
        badgeColor: 'var(--text-muted)',
        badgeBorder: '1px solid transparent',
        inactiveBackground: 'transparent',
        inactiveBorder: '1px solid transparent',
        activeBackground: 'var(--bg-card)',
        activeBorder: '1px solid var(--border-subtle)',
        activeShadow: 'var(--shadow-sm)',
    };
}

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
