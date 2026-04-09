import type { RuntimeEvent } from '../types';
import {
    computeLastEventSeq,
    getSessionRuntimeFallback,
    normalizeRuntimeEvents,
} from '../utils/agent/debateStoreHelpers';
import { clampReplayCursor, deriveRuntimeViewState, getVisibleRuntimeEvents } from '../utils/runtime/replay';
import type { DebateState } from './debateStore';

// Cache for visible runtime events to maintain reference equality
const visibleEventsCache = new WeakMap<
    RuntimeEvent[],
    Map<number, RuntimeEvent[]>
>();

function getCachedVisibleEvents(
    events: RuntimeEvent[],
    cursor: number,
): RuntimeEvent[] {
    let cursorMap = visibleEventsCache.get(events);
    if (!cursorMap) {
        cursorMap = new Map();
        visibleEventsCache.set(events, cursorMap);
    }

    const cached = cursorMap.get(cursor);
    if (cached) {
        return cached;
    }

    const result = events.slice(0, cursor + 1);
    cursorMap.set(cursor, result);
    return result;
}

export function createFocusedRuntimeEventPatch(
    state: DebateState,
    eventId: string | null,
): Partial<DebateState> {
    if (!state.replayEnabled) {
        return { focusedRuntimeEventId: eventId };
    }

    if (!eventId) {
        return { focusedRuntimeEventId: null };
    }

    const index = state.runtimeEvents.findIndex((event) => event.event_id === eventId);
    if (index < 0) {
        return { focusedRuntimeEventId: eventId };
    }

    const replayCursor = clampReplayCursor(index, state.runtimeEvents.length);
    return {
        focusedRuntimeEventId: eventId,
        replayCursor,
        visibleRuntimeEvents: getCachedVisibleEvents(state.runtimeEvents, replayCursor),
    };
}

export function createReplayEnabledPatch(
    state: DebateState,
    enabled: boolean,
): Partial<DebateState> {
    if (!enabled) {
        const realtimeCursor = clampReplayCursor(
            state.runtimeEvents.length - 1,
            state.runtimeEvents.length,
        );
        return {
            replayEnabled: false,
            replayCursor: realtimeCursor,
            visibleRuntimeEvents: state.runtimeEvents,
        };
    }

    let replayCursor = state.replayCursor;
    if (state.focusedRuntimeEventId) {
        const focusedIndex = state.runtimeEvents.findIndex(
            (event) => event.event_id === state.focusedRuntimeEventId,
        );
        if (focusedIndex >= 0) {
            replayCursor = focusedIndex;
        }
    }
    if (replayCursor < 0) {
        replayCursor = state.runtimeEvents.length - 1;
    }

    replayCursor = clampReplayCursor(replayCursor, state.runtimeEvents.length);
    return {
        replayEnabled: true,
        replayCursor,
        visibleRuntimeEvents: getCachedVisibleEvents(state.runtimeEvents, replayCursor),
        focusedRuntimeEventId:
            replayCursor >= 0 ? state.runtimeEvents[replayCursor].event_id : null,
    };
}

export function createReplayCursorPatch(
    state: DebateState,
    cursor: number,
): Partial<DebateState> {
    const replayCursor = clampReplayCursor(cursor, state.runtimeEvents.length);
    return {
        replayEnabled: true,
        replayCursor,
        visibleRuntimeEvents: getCachedVisibleEvents(state.runtimeEvents, replayCursor),
        focusedRuntimeEventId:
            replayCursor >= 0 ? state.runtimeEvents[replayCursor].event_id : null,
    };
}

export function createReplayStepPatch(
    state: DebateState,
    offset: number,
): Partial<DebateState> {
    const baselineCursor = state.replayEnabled
        ? state.replayCursor
        : state.runtimeEvents.length - 1;
    const replayCursor = clampReplayCursor(
        baselineCursor + offset,
        state.runtimeEvents.length,
    );
    return {
        replayEnabled: true,
        replayCursor,
        visibleRuntimeEvents: getCachedVisibleEvents(state.runtimeEvents, replayCursor),
        focusedRuntimeEventId:
            replayCursor >= 0 ? state.runtimeEvents[replayCursor].event_id : null,
    };
}

export function createExitReplayPatch(state: DebateState): Partial<DebateState> {
    const replayCursor = clampReplayCursor(
        state.runtimeEvents.length - 1,
        state.runtimeEvents.length,
    );
    return {
        replayEnabled: false,
        replayCursor,
        visibleRuntimeEvents: state.runtimeEvents,
        focusedRuntimeEventId: null,
    };
}

export function createLoadRuntimeEventSnapshotPatch(
    state: DebateState,
    events: RuntimeEvent[],
): Partial<DebateState> {
    const safeEvents = normalizeRuntimeEvents(events);
    const replayCursor = clampReplayCursor(safeEvents.length - 1, safeEvents.length);
    const lastEventSeq = computeLastEventSeq(events);
    const runtimeView = deriveRuntimeViewState(
        safeEvents,
        getSessionRuntimeFallback(state.currentSession),
    );
    return {
        runtimeEvents: safeEvents,
        visibleRuntimeEvents: getVisibleRuntimeEvents(safeEvents, true, replayCursor),
        lastEventSeq,
        replayEnabled: true,
        replayCursor,
        focusedRuntimeEventId: replayCursor >= 0 ? safeEvents[replayCursor].event_id : null,
        hasOlderRuntimeEvents: false,
        streamingRole: '',
        streamingContent: '',
        isDebating: runtimeView.isDebating,
        phase: runtimeView.phase,
        currentStatus: runtimeView.status,
        currentNode: runtimeView.node,
    };
}

export function createHydrateRuntimeEventsPatch(
    state: DebateState,
    events: RuntimeEvent[],
    hasOlderRuntimeEvents = false,
): Partial<DebateState> {
    const safeEvents = normalizeRuntimeEvents(events);
    const replayCursor = clampReplayCursor(safeEvents.length - 1, safeEvents.length);
    const runtimeFallback = getSessionRuntimeFallback(state.currentSession);
    const shouldUseHistoricalLiveState = state.currentSession?.status !== 'in_progress';
    const runtimeView = shouldUseHistoricalLiveState
        ? deriveRuntimeViewState(safeEvents, runtimeFallback)
        : runtimeFallback;
    return {
        runtimeEvents: safeEvents,
        visibleRuntimeEvents: safeEvents,
        lastEventSeq: computeLastEventSeq(events),
        replayEnabled: false,
        replayCursor,
        focusedRuntimeEventId: null,
        hasOlderRuntimeEvents,
        streamingRole: '',
        streamingContent: '',
        isDebating: runtimeView.isDebating,
        phase: runtimeView.phase,
        currentStatus: runtimeView.status,
        currentNode: runtimeView.node,
    };
}

export function createPrependRuntimeEventsPatch(
    state: DebateState,
    events: RuntimeEvent[],
    hasOlderRuntimeEvents = false,
): Partial<DebateState> {
    const mergedEvents = normalizeRuntimeEvents([...events, ...state.runtimeEvents]);
    const focusedEventId =
        state.focusedRuntimeEventId ??
        (state.replayEnabled && state.replayCursor >= 0
            ? state.runtimeEvents[state.replayCursor]?.event_id ?? null
            : null);

    let replayCursor = state.replayEnabled
        ? clampReplayCursor(state.replayCursor, mergedEvents.length)
        : clampReplayCursor(mergedEvents.length - 1, mergedEvents.length);
    let focusedRuntimeEventId = state.focusedRuntimeEventId;

    if (state.replayEnabled) {
        if (focusedEventId) {
            const focusedIndex = mergedEvents.findIndex(
                (event) => event.event_id === focusedEventId,
            );
            if (focusedIndex >= 0) {
                replayCursor = focusedIndex;
                focusedRuntimeEventId = focusedEventId;
            } else {
                focusedRuntimeEventId =
                    replayCursor >= 0 ? mergedEvents[replayCursor]?.event_id ?? null : null;
            }
        } else {
            focusedRuntimeEventId =
                replayCursor >= 0 ? mergedEvents[replayCursor]?.event_id ?? null : null;
        }
    } else if (
        focusedRuntimeEventId &&
        !mergedEvents.some((event) => event.event_id === focusedRuntimeEventId)
    ) {
        focusedRuntimeEventId = null;
    }

    return {
        runtimeEvents: mergedEvents,
        visibleRuntimeEvents: getVisibleRuntimeEvents(
            mergedEvents,
            state.replayEnabled,
            replayCursor,
        ),
        lastEventSeq: Math.max(state.lastEventSeq, computeLastEventSeq(events)),
        replayCursor,
        focusedRuntimeEventId,
        hasOlderRuntimeEvents,
    };
}
