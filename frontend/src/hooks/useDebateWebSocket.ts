/**
 * useDebateWebSocket manages the debate session websocket lifecycle.
 *
 * All store mutations inside websocket callbacks go through
 * useDebateStore.getState() to avoid stale closures.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useDebateStore } from '../stores/debateStore';
import type { WSMessage } from '../types';

const WS_BASE =
    import.meta.env.VITE_WS_URL ||
    `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api`;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000];
const MAX_DEBUG_PREVIEW = 400;
const MAX_SAFE_CONTENT_LENGTH = 50000;

const getStore = () => useDebateStore.getState();

function previewPayload(payload: unknown): string {
    const text = typeof payload === 'string' ? payload : String(payload);
    return text.length > MAX_DEBUG_PREVIEW
        ? `${text.slice(0, MAX_DEBUG_PREVIEW)}... [truncated ${text.length - MAX_DEBUG_PREVIEW} chars]`
        : text;
}

function sanitizeIncomingContent(content: string | undefined): string {
    const text = content ?? '';
    if (!text) return text;

    if (text.startsWith('data: {')) {
        return '[Filtered malformed provider stream payload]';
    }

    if (text.length > MAX_SAFE_CONTENT_LENGTH) {
        return `${text.slice(0, MAX_SAFE_CONTENT_LENGTH)}\n\n[Content truncated to protect the UI]`;
    }

    return text;
}

export function useDebateWebSocket(sessionId: string | null) {
    const ws = useRef<WebSocket | null>(null);
    const reconnectAttempt = useRef(0);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const isMounted = useRef(true);

    const handleMessage = useCallback((msg: WSMessage) => {
        const store = getStore();

        switch (msg.type) {
            case 'system':
                break;

            case 'status':
                store.setPhase(msg.phase ?? 'processing', msg.content ?? '', msg.node ?? '');
                break;

            case 'speech_start':
                store.startStreaming(msg.role ?? '');
                break;

            case 'fact_check_start':
                store.setPhase('fact_checking', '正在核查事实...', 'tool_executor');
                break;

            case 'judge_start':
                store.setPhase('judging', '裁判评估中...', 'judge');
                break;

            case 'speech_token':
                store.appendStreamToken(msg.token ?? '');
                break;

            case 'speech_end':
                store.endStreaming(
                    msg.role ?? '',
                    sanitizeIncomingContent(msg.content),
                    msg.citations ?? [],
                    msg.agent_name,
                );
                break;

            case 'fact_check_result':
                store.setSearchResults(msg.results ?? [], msg.count ?? 0);
                break;

            case 'judge_score':
                if (msg.role && msg.scores) {
                    store.updateCurrentScores(msg.role, msg.scores);
                    store.appendDialogueEntry({
                        role: 'judge',
                        target_role: msg.role,
                        agent_name: '裁判组视角',
                        content: msg.scores.overall_comment || '',
                        scores: msg.scores,
                        timestamp: new Date().toISOString(),
                        citations: [],
                    });
                }
                break;

            case 'turn_complete':
                if (msg.turn !== undefined) store.advanceTurn(msg.turn);
                if (msg.cumulative_scores) store.updateCumulativeScores(msg.cumulative_scores);
                break;

            case 'debate_complete':
                store.completeDebate(msg.final_scores ?? {}, msg.total_turns ?? 0);
                break;

            case 'error':
                store.setPhase('error', sanitizeIncomingContent(msg.content) || '出现错误');
                store.setDebating(false);
                store.appendDialogueEntry({
                    role: 'error',
                    content: sanitizeIncomingContent(msg.content) || '出现错误',
                    timestamp: new Date().toISOString(),
                    citations: [],
                    agent_name: '系统错误',
                });
                break;

            case 'audience_message':
                store.appendDialogueEntry({
                    role: 'audience',
                    content: sanitizeIncomingContent(msg.content),
                    timestamp: msg.timestamp ?? new Date().toISOString(),
                    citations: [],
                    agent_name: '观众发言',
                });
                break;

            case 'pong':
                break;
        }
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
                    const msg: WSMessage = JSON.parse(evt.data);
                    handleMessage(msg);
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
    }, [sessionId, handleMessage]);

    const startDebate = useCallback(
        (topic: string, participants: string[], maxTurns: number) => {
            if (ws.current?.readyState !== WebSocket.OPEN) return;
            getStore().setDebating(true);
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
