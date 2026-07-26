/**
 * useDebateWebSocket manages the run websocket lifecycle.
 */

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { api } from '../api/client';
import { useDebateStore } from '../stores/debateStore';
import { normalizeRuntimeEvents } from '../utils/agent/debateStoreHelpers';
import { normalizeRuntimeEvent } from '../utils/runtime/runtimeEvents';

const WS_BASE =
    import.meta.env.VITE_WS_URL ||
    `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api`;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000];
const RECONNECT_JITTER_MS = 500;
const PING_INTERVAL_MS = 20000;
// A half-open TCP connection keeps readyState OPEN forever; if nothing has
// arrived (pong or events) for this long, force-close so reconnect kicks in.
const STALE_CONNECTION_MS = PING_INTERVAL_MS * 2 + 5000;
const MAX_DEBUG_PREVIEW = 400;

const getStore = () => useDebateStore.getState();

function previewPayload(payload: unknown): string {
    const text = typeof payload === 'string' ? payload : String(payload);
    return text.length > MAX_DEBUG_PREVIEW
        ? `${text.slice(0, MAX_DEBUG_PREVIEW)}... [truncated ${text.length - MAX_DEBUG_PREVIEW} chars]`
        : text;
}

function buildWsUrl(runId: string): string {
    const lastSeq = getStore().lastEventSeqByRun[runId] ?? -1;
    const afterSeq = Math.max(0, lastSeq);
    return `${WS_BASE}/ws/runs/${runId}?after_seq=${afterSeq}`;
}

export function useDebateWebSocket(runId: string | null) {
    const ws = useRef<WebSocket | null>(null);
    const reconnectAttempt = useRef(0);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const isMounted = useRef(true);
    const activeGeneration = useRef(0);
    const requestedRunId = useRef<string | null>(runId);

    useLayoutEffect(() => {
        requestedRunId.current = runId;
    }, [runId]);

    useEffect(() => {
        isMounted.current = true;

        return () => {
            isMounted.current = false;
            activeGeneration.current++;
            if (reconnectTimer.current) {
                clearTimeout(reconnectTimer.current);
                reconnectTimer.current = null;
            }
            if (pingTimer.current) {
                clearInterval(pingTimer.current);
                pingTimer.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (typeof document === 'undefined') {
            return;
        }

        const syncVisibility = () => {
            getStore().markDocumentVisibility(document.visibilityState !== 'hidden');
        };

        syncVisibility();
        document.addEventListener('visibilitychange', syncVisibility);
        window.addEventListener('focus', syncVisibility);

        return () => {
            document.removeEventListener('visibilitychange', syncVisibility);
            window.removeEventListener('focus', syncVisibility);
        };
    }, []);

    useLayoutEffect(() => {
        const generation = activeGeneration.current + 1;
        activeGeneration.current = generation;

        const clearReconnectTimer = () => {
            if (reconnectTimer.current) {
                clearTimeout(reconnectTimer.current);
                reconnectTimer.current = null;
            }
        };

        const clearPingTimer = () => {
            if (pingTimer.current) {
                clearInterval(pingTimer.current);
                pingTimer.current = null;
            }
        };

        clearReconnectTimer();
        clearPingTimer();

        if (!runId) {
            ws.current = null;
            reconnectAttempt.current = 0;
            getStore().setConnected(false);
            return () => {
                if (activeGeneration.current === generation) {
                    activeGeneration.current++;
                }
            };
        }

        const isActiveRun = () => {
            if (!isMounted.current || activeGeneration.current !== generation) {
                return false;
            }
            if (requestedRunId.current !== runId) {
                return false;
            }
            return getStore().activeRunId === runId;
        };
        const isCurrentConnection = (sock?: WebSocket | null) =>
            isActiveRun() && (!sock || ws.current === sock);

        let lastActivityAt = Date.now();
        let backfillInFlight = false;
        let backfillQueued = false;

        // Recover events that were persisted while this client was not
        // listening (seq gap detected) via the REST catch-up endpoint.
        const runBackfill = async (sock: WebSocket) => {
            if (backfillInFlight) {
                backfillQueued = true;
                return;
            }
            backfillInFlight = true;
            try {
                do {
                    backfillQueued = false;
                    const lastSeq = Math.max(0, getStore().lastEventSeqByRun[runId] ?? -1);
                    const response = await api.runs.events(runId, lastSeq);
                    if (!isCurrentConnection(sock)) return;
                    const events = normalizeRuntimeEvents(response?.events ?? []);
                    for (const event of events) {
                        getStore().applyRuntimeEvent(event);
                    }
                } while (backfillQueued && isCurrentConnection(sock));
            } catch (err) {
                console.warn('[WS] Event backfill failed:', err);
            } finally {
                backfillInFlight = false;
            }
        };

        const setupSocket = (sock: WebSocket) => {
            sock.onopen = () => {
                if (!isCurrentConnection(sock)) return;
                reconnectAttempt.current = 0;
                lastActivityAt = Date.now();
                getStore().setConnected(true);
                clearPingTimer();
                const pingInterval = setInterval(() => {
                    if (!isCurrentConnection(sock)) {
                        clearInterval(pingInterval);
                        if (pingTimer.current === pingInterval) {
                            pingTimer.current = null;
                        }
                        return;
                    }
                    if (sock.readyState !== WebSocket.OPEN) {
                        clearInterval(pingInterval);
                        if (pingTimer.current === pingInterval) {
                            pingTimer.current = null;
                        }
                        return;
                    }
                    if (Date.now() - lastActivityAt > STALE_CONNECTION_MS) {
                        // Half-open connection: nothing (not even pong) came back.
                        console.warn('[WS] Connection stale, forcing reconnect');
                        sock.close();
                        return;
                    }
                    sock.send(JSON.stringify({ action: 'ping' }));
                }, PING_INTERVAL_MS);
                pingTimer.current = pingInterval;
            };

            sock.onmessage = (evt) => {
                if (!isCurrentConnection(sock)) return;
                lastActivityAt = Date.now();
                try {
                    const parsed = JSON.parse(evt.data);
                    const event = normalizeRuntimeEvent(parsed);
                    if (!event) {
                        console.warn('[WS] Ignored unsupported message preview:', previewPayload(evt.data));
                        return;
                    }
                    if (typeof event.seq === 'number' && event.seq >= 0) {
                        const lastSeq = getStore().lastEventSeqByRun[runId] ?? -1;
                        if (lastSeq >= 0 && event.seq > lastSeq + 1) {
                            // Gap detected: fetch the missing range (which also
                            // contains this event) instead of applying out of order.
                            void runBackfill(sock);
                            return;
                        }
                    }
                    getStore().applyRuntimeEvent(event);
                } catch {
                    console.warn('[WS] Failed to parse message preview:', previewPayload(evt.data));
                }
            };

            sock.onclose = () => {
                if (!isCurrentConnection(sock)) return;
                if (ws.current === sock) {
                    ws.current = null;
                }
                clearPingTimer();
                getStore().setConnected(false);
                const baseDelay = RECONNECT_DELAYS[Math.min(reconnectAttempt.current, RECONNECT_DELAYS.length - 1)];
                const delay = baseDelay + Math.floor(Math.random() * RECONNECT_JITTER_MS);
                reconnectAttempt.current++;
                clearReconnectTimer();
                reconnectTimer.current = setTimeout(() => {
                    if (isCurrentConnection()) {
                        openSocket();
                    }
                }, delay);
            };

            sock.onerror = () => {
                sock.close();
            };
        };

        const openSocket = () => {
            const nextSocket = new WebSocket(buildWsUrl(runId));
            ws.current = nextSocket;
            setupSocket(nextSocket);
        };

        const handleOnline = () => {
            if (!isActiveRun()) return;
            const current = ws.current;
            if (current && current.readyState === WebSocket.OPEN) return;
            // Network came back: skip the remaining backoff delay.
            clearReconnectTimer();
            current?.close();
            openSocket();
        };
        window.addEventListener('online', handleOnline);

        openSocket();

        return () => {
            if (activeGeneration.current === generation) {
                activeGeneration.current++;
            }
            window.removeEventListener('online', handleOnline);
            clearReconnectTimer();
            clearPingTimer();
            const activeSocket = ws.current;
            ws.current = null;
            activeSocket?.close();
            reconnectAttempt.current = 0;
            getStore().setConnected(false);
        };
    }, [runId]);

    const startRun = useCallback(async (topic: string, participants: string[], maxTurns: number) => {
        const store = getStore();
        const previousSession = store.currentSession;
        if (!previousSession) return;

        store.setCurrentSession({
            ...previousSession,
            topic,
            participants: participants.length ? participants : previousSession.participants,
            max_turns: maxTurns,
            status: 'in_progress',
        });
        store.setDebating(true);
        store.setPhase('initializing', '辩论准备中...');

        try {
            const run = await api.runs.create(previousSession.id, {
                topic,
                participants,
                max_turns: maxTurns,
            });
            getStore().setActiveRun(run);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to start debate';
            const activeStore = getStore();
            if (activeStore.currentSession?.id === previousSession.id) {
                activeStore.setCurrentSession(previousSession);
            }
            activeStore.setPhase('error', errorMessage);
            activeStore.setDebating(false);
        }
    }, []);

    const resumeRun = useCallback(async () => {
        const store = getStore();
        const activeRun = store.activeRun;
        const activeRunId = activeRun?.id;
        if (!activeRunId) return;

        store.setDebating(true);
        store.setPhase('initializing', '正在恢复辩论...');
        store.setActiveRun({
            ...activeRun,
            status: 'running',
            last_status_message: '正在恢复辩论...',
        });

        try {
            await api.runs.command(activeRunId, 'resume');
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to resume debate';
            const activeStore = getStore();
            if (activeStore.activeRunId === activeRunId) {
                activeStore.setActiveRun(activeRun);
            }
            activeStore.setPhase('error', errorMessage);
            activeStore.setDebating(false);
        }
    }, []);

    const stopRun = useCallback(async () => {
        const store = getStore();
        const activeRun = store.activeRun;
        const activeRunId = activeRun?.id;
        if (!activeRunId) {
            store.setDebating(false);
            store.setPhase('idle', '');
            return;
        }

        store.setDebating(false);
        store.setPhase('processing', '正在停止辩论...');
        if (activeRun) {
            store.setActiveRun({
                ...activeRun,
                status: 'stopping',
                last_status_message: '正在停止辩论...',
            });
        }

        try {
            const ack = await api.runs.command(activeRunId, 'stop');
            const latest = await api.runs.get(activeRunId);
            const activeStore = getStore();
            if (activeStore.activeRunId === activeRunId) {
                activeStore.setCurrentSession(latest.session);
                activeStore.setActiveRun(latest.run);
                if (latest.run.status === 'cancelled') {
                    activeStore.setPhase('idle', ack.message || latest.run.last_status_message || '辩论已停止');
                } else if (latest.run.status === 'failed' || latest.run.status === 'stalled') {
                    activeStore.setPhase('error', latest.run.last_error_message || ack.message || '运行中断');
                }
            }
        } catch (err) {
            const activeStore = getStore();
            try {
                const latest = await api.runs.get(activeRunId);
                if (activeStore.activeRunId === activeRunId) {
                    activeStore.setCurrentSession(latest.session);
                    activeStore.setActiveRun(latest.run);
                    if (latest.run.status === 'failed' || latest.run.status === 'stalled') {
                        activeStore.setPhase('error', latest.run.last_error_message || '运行中断');
                    } else if (latest.run.status === 'cancelled') {
                        activeStore.setPhase('idle', latest.run.last_status_message || '辩论已停止');
                    } else {
                        activeStore.setPhase('processing', latest.run.last_status_message || '正在处理');
                    }
                }
            } catch {
                const errorMessage = err instanceof Error ? err.message : 'Failed to stop debate';
                if (activeStore.activeRunId === activeRunId && activeRun) {
                    activeStore.setActiveRun(activeRun);
                }
                activeStore.setPhase('error', errorMessage);
            }
        }
    }, []);

    const sendIntervention = useCallback(
        async (content: string, options?: { interrupt?: boolean }) => {
            const activeRunId = getStore().activeRunId;
            const trimmed = content.trim();
            if (!activeRunId || !trimmed) return null;
            return api.runs.command(
                activeRunId,
                options?.interrupt ? 'interrupt' : 'intervene',
                trimmed,
            );
        },
        [],
    );

    return { startRun, resumeRun, stopRun, sendIntervention };
}
