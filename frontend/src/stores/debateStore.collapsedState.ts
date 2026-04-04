/**
 * Collapsed state helpers for debate store.
 * Extracted to keep the main store focused on state definition and actions.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DebateState = any;

export function pruneCollapsedState(
    state: Record<string, Record<string, boolean>>,
    sessionId: string,
    collapseKeys: string[],
    collapsed: boolean,
): Record<string, Record<string, boolean>> {
    const existing = state[sessionId] ?? {};
    if (!collapseKeys.length) {
        return state;
    }

    const nextSessionState = { ...existing };
    for (const key of collapseKeys) {
        if (!key) continue;
        if (collapsed) {
            nextSessionState[key] = true;
        } else {
            delete nextSessionState[key];
        }
    }

    if (Object.keys(nextSessionState).length === 0) {
        return Object.fromEntries(
            Object.entries(state).filter(([key]) => key !== sessionId),
        );
    }

    return {
        ...state,
        [sessionId]: nextSessionState,
    };
}

export function toggleCollapsedState(
    state: Record<string, Record<string, boolean>>,
    sessionId: string,
    collapseKey: string,
): Record<string, Record<string, boolean>> {
    if (!sessionId || !collapseKey) {
        return state;
    }
    const existing = state[sessionId] ?? {};
    const nextSessionState = { ...existing };
    if (nextSessionState[collapseKey]) {
        delete nextSessionState[collapseKey];
    } else {
        nextSessionState[collapseKey] = true;
    }

    if (Object.keys(nextSessionState).length === 0) {
        return Object.fromEntries(
            Object.entries(state).filter(([key]) => key !== sessionId),
        );
    }

    return {
        ...state,
        [sessionId]: nextSessionState,
    };
}

export function clearCollapsedStateForSession(
    state: Record<string, Record<string, boolean>>,
    sessionId: string,
): Record<string, Record<string, boolean>> {
    if (!sessionId || !state[sessionId]) {
        return state;
    }
    return Object.fromEntries(
        Object.entries(state).filter(([key]) => key !== sessionId),
    );
}

export function uniqueCollapseKeys(collapseKeys: string[]): string[] {
    return Array.from(new Set(collapseKeys.filter(Boolean)));
}

export function patchCollapsedKeys(
    state: DebateState,
    sessionId: string,
    collapseKeys: string[],
    collapsed: boolean,
): Partial<DebateState> {
    return {
        collapsedAgentMessagesBySession: pruneCollapsedState(
            state.collapsedAgentMessagesBySession,
            sessionId,
            uniqueCollapseKeys(collapseKeys),
            collapsed,
        ),
    };
}

export function patchCollapsedKey(
    state: DebateState,
    sessionId: string,
    collapseKey: string,
): Partial<DebateState> {
    return {
        collapsedAgentMessagesBySession: toggleCollapsedState(
            state.collapsedAgentMessagesBySession,
            sessionId,
            collapseKey,
        ),
    };
}

export function patchClearSessionCollapsedKeys(
    state: DebateState,
    sessionId: string,
): Partial<DebateState> {
    return {
        collapsedAgentMessagesBySession: clearCollapsedStateForSession(
            state.collapsedAgentMessagesBySession,
            sessionId,
        ),
    };
}
