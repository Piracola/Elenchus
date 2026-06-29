/**
 * useDebateWebSocket manages the debate session websocket lifecycle.
 *
 * All store mutations inside websocket callbacks go through
 * useDebateStore.getState() to avoid stale closures.
 */

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { api } from '../api/client';
import { useDebateStore } from '../stores/debateStore';
import { normalizeRuntimeEvent } from '../utils/runtime/runtimeEvents';

const WS_BASE =
    import.meta.env.VITE_WS_URL ||
    `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api`;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000];
const MAX_DEBUG_PREVIEW = 400;

const getStore = () => useDebateStore.getState();

function previewPayload(payload: unknown): string {
    const text = typeof payload === 'string' ? payload : String(payload);
    return text.length > MAX_DEBUG_PREVIEW
        ? `${text.slice(0, MAX_DEBUG_PREVIEW)}... [truncated ${text.length - MAX_DEBUG_PREVIEW} chars]`
        : text;
}

export function useDebateWebSocket(sessionId: string | null) {
    const ws = useRef<WebSocket | null>(null);
    const reconnectAttempt = useRef(0);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const isMounted = useRef(true);
    const activeGeneration = useRef(0);
    const requestedSessionId = useRef<string | null>(sessionId);

    useLayoutEffect(() => {
        requestedSessionId.current = sessionId;
    }, [sessionId]);

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

        if (!sessionId) {
            ws.current = null;
            reconnectAttempt.current = 0;
            getStore().setConnected(false);
            return () => {
                if (activeGeneration.current === generation) {
                    activeGeneration.current++;
                }
            };
        }

        const url = `${WS_BASE}/ws/${sessionId}`;
        const isActiveSession = () => {
            if (!isMounted.current || activeGeneration.current !== generation) {
                return false;
            }
            if (requestedSessionId.current !== sessionId) {
                return false;
            }
            const currentStoreSessionId = getStore().currentSession?.id ?? null;
            return currentStoreSessionId === sessionId;
        };
        const isCurrentConnection = (sock?: WebSocket | null) =>
            isActiveSession() &&
            (!sock || ws.current === sock);

        const scheduleReconnect = () => {
            if (!isCurrentConnection()) return;
            const delay =
                RECONNECT_DELAYS[
                    Math.min(reconnectAttempt.current, RECONNECT_DELAYS.length - 1)
                ];
            reconnectAttempt.current++;
            clearReconnectTimer();
            reconnectTimer.current = setTimeout(() => {
                if (isCurrentConnection()) {
                    const newSocket = new WebSocket(url);
                    ws.current = newSocket;
                    setupSocket(newSocket);
                }
            }, delay);
        };

        const setupSocket = (sock: WebSocket) => {
            sock.onopen = () => {
                if (!isCurrentConnection(sock)) return;
                reconnectAttempt.current = 0;
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
                    if (sock.readyState === WebSocket.OPEN) {
                        sock.send(JSON.stringify({ action: 'ping' }));
                    } else {
                        clearInterval(pingInterval);
                        if (pingTimer.current === pingInterval) {
                            pingTimer.current = null;
                        }
                    }
                }, 20000);
                pingTimer.current = pingInterval;
            };

            sock.onmessage = (evt) => {
                if (!isCurrentConnection(sock)) return;
                try {
                    const parsed = JSON.parse(evt.data);
                    const event = normalizeRuntimeEvent(parsed);
                    if (!event) {
                        console.warn(
                            '[WS] Ignored unsupported message preview:',
                            previewPayload(evt.data),
                        );
                        return;
                    }
                    getStore().applyRuntimeEvent(event);
                } catch {
                    console.warn(
                        '[WS] Failed to parse message preview:',
                        previewPayload(evt.data),
                    );
                }
            };

            sock.onclose = () => {
                if (!isCurrentConnection(sock)) return;
                if (ws.current === sock) {
                    ws.current = null;
                }
                clearPingTimer();
                getStore().setConnected(false);
                scheduleReconnect();
            };

            sock.onerror = () => {
                sock.close();
            };
        };

        const socket = new WebSocket(url);
        ws.current = socket;
        setupSocket(socket);

        return () => {
            if (activeGeneration.current === generation) {
                activeGeneration.current++;
            }
            clearReconnectTimer();
            clearPingTimer();
            const activeSocket = ws.current;
            ws.current = null;
            activeSocket?.close();
            reconnectAttempt.current = 0;
            getStore().setConnected(false);
        };
    }, [sessionId]);

    const startDebate = useCallback(
        async (topic: string, participants: string[], maxTurns: number) => {
            const store = getStore();
            const previousSession = store.currentSession;
            if (previousSession) {
                store.setCurrentSession({
                    ...previousSession,
                    topic,
                    participants: participants.length ? participants : previousSession.participants,
                    max_turns: maxTurns,
                    status: 'in_progress',
                });
            }
            store.setDebating(true);
            store.setPhase('initializing', '辩论准备中...');

            // Use REST API to start debate for detailed error reporting
            try {
                const sessionId = store.currentSession?.id;
                if (!sessionId) return;
                await api.sessions.startDebate(sessionId, {
                    topic,
                    participants,
                    max_turns: maxTurns,
                });
            } catch (err) {
                // REST API reported detailed error — update store and emit error
                const errorMessage = err instanceof Error ? err.message : 'Failed to start debate';
                const activeStore = getStore();
                if (previousSession && activeStore.currentSession?.id === previousSession.id) {
                    activeStore.setCurrentSession(previousSession);
                }
                store.setPhase('error', errorMessage);
                store.setDebating(false);
            }
        },
        [],
    );

    const stopDebate = useCallback(async () => {
        const sessionId = getStore().currentSession?.id;
        if (sessionId) {
            try {
                await api.sessions.stopDebate(sessionId);
            } catch {
                // Fallback to WebSocket stop
                if (ws.current?.readyState === WebSocket.OPEN) {
                    try {
                        ws.current.send(JSON.stringify({ action: 'stop' }));
                    } catch {
                        // Ignore transport errors here and still reset local UI state.
                    }
                }
            }
        }
        getStore().setDebating(false);
        getStore().setPhase('idle', '');
    }, []);

    const sendIntervention = useCallback((content: string) => {
        if (ws.current?.readyState !== WebSocket.OPEN) return;
        ws.current.send(JSON.stringify({ action: 'intervene', content }));
    }, []);

    return { startDebate, stopDebate, sendIntervention };
}
