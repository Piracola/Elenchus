/**
 * useDebateWebSocket — custom React hook managing the full WebSocket lifecycle.
 *
 * Connects to /api/ws/{sessionId}, dispatches all server events
 * to the Zustand store, and exposes startDebate / stopDebate actions.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useDebateStore } from '../stores/debateStore';
import type { WSMessage } from '../types';

const WS_BASE = import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:8000/api`;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000]; // exponential backoff

export function useDebateWebSocket(sessionId: string | null) {
    const ws = useRef<WebSocket | null>(null);
    const reconnectAttempt = useRef(0);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isMounted = useRef(true);

    const store = useDebateStore();

    // ── Message handler ─────────────────────────────────────────
    const handleMessage = useCallback((msg: WSMessage) => {
        switch (msg.type) {
            case 'system':
                break;

            case 'status':
                store.setPhase(
                    msg.phase ?? 'processing',
                    msg.content ?? '',
                    msg.node ?? '',
                );
                break;

            case 'speech_start':
                store.startStreaming(msg.role ?? '');
                break;

            case 'speech_token':
                store.appendStreamToken(msg.token ?? '');
                break;

            case 'speech_end':
                store.endStreaming(
                    msg.role ?? '',
                    msg.content ?? '',
                    msg.citations ?? [],
                );
                break;

            case 'fact_check_result':
                store.setSearchResults(msg.results ?? [], msg.count ?? 0);
                break;

            case 'judge_score':
                if (msg.role && msg.scores) {
                    store.updateCurrentScores(msg.role, msg.scores);
                }
                break;

            case 'turn_complete':
                if (msg.turn !== undefined) store.advanceTurn(msg.turn);
                if (msg.cumulative_scores) store.updateCumulativeScores(msg.cumulative_scores);
                break;

            case 'debate_complete':
                store.completeDebate(
                    msg.final_scores ?? {},
                    msg.total_turns ?? 0,
                );
                break;

            case 'error':
                store.setPhase('error', msg.content ?? '出现错误');
                store.setDebating(false);
                break;

            case 'pong':
                break;
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Connect ─────────────────────────────────────────────────
    const connect = useCallback(() => {
        if (!sessionId || !isMounted.current) return;

        const url = `${WS_BASE}/ws/${sessionId}`;
        const socket = new WebSocket(url);
        ws.current = socket;

        socket.onopen = () => {
            if (!isMounted.current) return;
            reconnectAttempt.current = 0;
            store.setConnected(true);
            // Start keepalive ping
            const ping = setInterval(() => {
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({ action: 'ping' }));
                } else {
                    clearInterval(ping);
                }
            }, 20000);
        };

        socket.onmessage = (evt) => {
            try {
                const msg: WSMessage = JSON.parse(evt.data);
                handleMessage(msg);
            } catch {
                console.warn('[WS] Failed to parse message:', evt.data);
            }
        };

        socket.onclose = () => {
            if (!isMounted.current) return;
            store.setConnected(false);
            // Exponential backoff reconnect
            const delay = RECONNECT_DELAYS[
                Math.min(reconnectAttempt.current, RECONNECT_DELAYS.length - 1)
            ];
            reconnectAttempt.current++;
            reconnectTimer.current = setTimeout(connect, delay);
        };

        socket.onerror = () => {
            socket.close();
        };
    }, [sessionId, handleMessage]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Lifecycle ────────────────────────────────────────────────
    useEffect(() => {
        isMounted.current = true;
        if (sessionId) connect();

        return () => {
            isMounted.current = false;
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            ws.current?.close();
            store.setConnected(false);
        };
    }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Public actions ───────────────────────────────────────────
    const startDebate = useCallback((
        topic: string,
        participants: string[],
        maxTurns: number,
    ) => {
        if (ws.current?.readyState !== WebSocket.OPEN) return;
        store.setDebating(true);
        store.setPhase('initializing', '辩论准备中...');
        ws.current.send(JSON.stringify({
            action: 'start',
            topic,
            participants,
            max_turns: maxTurns,
        }));
    }, []);

    const stopDebate = useCallback(() => {
        ws.current?.send(JSON.stringify({ action: 'stop' }));
        store.setDebating(false);
        store.setPhase('idle', '');
    }, []);

    return { startDebate, stopDebate };
}
