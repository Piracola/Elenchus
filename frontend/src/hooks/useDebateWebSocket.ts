/**
 * useDebateWebSocket manages the debate session websocket lifecycle.
 *
 * All store mutations inside websocket callbacks go through
 * useDebateStore.getState() to avoid stale closures.
 */

import { useCallback, useEffect, useRef } from 'react';
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

    useEffect(() => {
        if (!sessionId) return;
        isMounted.current = true;

        const url = `${WS_BASE}/ws/${sessionId}`;
        const socket = new WebSocket(url);
        ws.current = socket;

        const scheduleReconnect = () => {
            if (!isMounted.current) return;
            const delay =
                RECONNECT_DELAYS[
                    Math.min(reconnectAttempt.current, RECONNECT_DELAYS.length - 1)
                ];
            reconnectAttempt.current++;
            reconnectTimer.current = setTimeout(() => {
                if (isMounted.current && sessionId) {
                    const newSocket = new WebSocket(url);
                    ws.current = newSocket;
                    setupSocket(newSocket);
                }
            }, delay);
        };

        const setupSocket = (sock: WebSocket) => {
            sock.onopen = () => {
                if (!isMounted.current) return;
                reconnectAttempt.current = 0;
                getStore().setConnected(true);
                if (pingTimer.current) clearInterval(pingTimer.current);
                pingTimer.current = setInterval(() => {
                    if (sock.readyState === WebSocket.OPEN) {
                        sock.send(JSON.stringify({ action: 'ping' }));
                    } else if (pingTimer.current) {
                        clearInterval(pingTimer.current);
                        pingTimer.current = null;
                    }
                }, 20000);
            };

            sock.onmessage = (evt) => {
                if (!isMounted.current) return;
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
                if (!isMounted.current) return;
                getStore().setConnected(false);
                scheduleReconnect();
            };

            sock.onerror = () => {
                sock.close();
            };
        };

        setupSocket(socket);

        return () => {
            isMounted.current = false;
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            if (pingTimer.current) clearInterval(pingTimer.current);
            ws.current?.close();
            getStore().setConnected(false);
        };
    }, [sessionId]);

    const startDebate = useCallback(
        (topic: string, participants: string[], maxTurns: number) => {
            if (ws.current?.readyState !== WebSocket.OPEN) return;
            const store = getStore();
            store.exitReplay();
            store.setFocusedRuntimeEventId(null);
            if (store.currentSession) {
                store.setCurrentSession({
                    ...store.currentSession,
                    topic,
                    participants: participants.length ? participants : store.currentSession.participants,
                    max_turns: maxTurns,
                    status: 'in_progress',
                });
            }
            store.setDebating(true);
            getStore().setPhase('initializing', '辩论准备中...');
            ws.current.send(
                JSON.stringify({
                    action: 'start',
                    topic,
                    participants,
                    max_turns: maxTurns,
                }),
            );
        },
        [],
    );

    const stopDebate = useCallback(() => {
        ws.current?.send(JSON.stringify({ action: 'stop' }));
        getStore().setDebating(false);
        getStore().setPhase('idle', '');
    }, []);

    const sendIntervention = useCallback((content: string) => {
        if (ws.current?.readyState !== WebSocket.OPEN) return;
        ws.current.send(JSON.stringify({ action: 'intervene', content }));
    }, []);

    return { startDebate, stopDebate, sendIntervention };
}
