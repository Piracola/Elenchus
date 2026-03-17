/**
 * useDebateWebSocket — custom React hook managing the full WebSocket lifecycle.
 *
 * Connects to /api/ws/{sessionId}, dispatches all server events
 * to the Zustand store, and exposes startDebate / stopDebate actions.
 *
 * IMPORTANT: All store interactions inside WebSocket callbacks use
 * useDebateStore.getState() (not the hook return) to avoid stale closures.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useDebateStore } from '../stores/debateStore';
import type { WSMessage } from '../types';

const WS_BASE = import.meta.env.VITE_WS_URL || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api`;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000];

const getStore = () => useDebateStore.getState();

export function useDebateWebSocket(sessionId: string | null) {
    const ws = useRef<WebSocket | null>(null);
    const reconnectAttempt = useRef(0);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const isMounted = useRef(true);

    const handleMessage = useCallback((msg: WSMessage) => {
        const s = getStore();
        switch (msg.type) {
            case 'system':
                break;

            case 'status':
                s.setPhase(
                    msg.phase ?? 'processing',
                    msg.content ?? '',
                    msg.node ?? '',
                );
                break;

            case 'speech_start':
                s.startStreaming(msg.role ?? '');
                break;

            case 'fact_check_start':
                s.setPhase('fact_checking', '正在核查事实...', 'tool_executor');
                break;

            case 'judge_start':
                s.setPhase('judging', '裁判评估中...', 'judge');
                break;

            case 'speech_token':
                s.appendStreamToken(msg.token ?? '');
                break;
            case 'speech_end':
                s.endStreaming(
                    msg.role ?? '',
                    msg.content ?? '',
                    msg.citations ?? [],
                    msg.agent_name,
                );
                break;

            case 'fact_check_result':
                s.setSearchResults(msg.results ?? [], msg.count ?? 0);
                break;

            case 'judge_score':
                if (msg.role && msg.scores) {
                    s.updateCurrentScores(msg.role, msg.scores);
                    s.appendDialogueEntry({
                        role: 'judge',
                        target_role: msg.role,
                        agent_name: '裁判组视角',
                        content: msg.scores.overall_comment || '',
                        scores: msg.scores,
                        timestamp: new Date().toISOString(),
                        citations: []
                    });
                }
                break;

            case 'turn_complete':
                if (msg.turn !== undefined) s.advanceTurn(msg.turn);
                if (msg.cumulative_scores) s.updateCumulativeScores(msg.cumulative_scores);
                break;

            case 'debate_complete':
                s.completeDebate(
                    msg.final_scores ?? {},
                    msg.total_turns ?? 0,
                );
                break;

            case 'error':
                s.setPhase('error', msg.content ?? '出现错误');
                s.setDebating(false);
                s.appendDialogueEntry({
                    role: 'error',
                    content: msg.content ?? '出现错误',
                    timestamp: new Date().toISOString(),
                    citations: [],
                    agent_name: '系统错误'
                });
                break;

            case 'audience_message':
                s.appendDialogueEntry({
                    role: 'audience',
                    content: msg.content ?? '',
                    timestamp: msg.timestamp ?? new Date().toISOString(),
                    citations: [],
                    agent_name: '观众发言'
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
            const delay = RECONNECT_DELAYS[
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
                    } else {
                        if (pingTimer.current) clearInterval(pingTimer.current);
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
                    console.warn('[WS] Failed to parse message:', evt.data);
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

    const startDebate = useCallback((
        topic: string,
        participants: string[],
        maxTurns: number,
    ) => {
        if (ws.current?.readyState !== WebSocket.OPEN) return;
        getStore().setDebating(true);
        getStore().setPhase('initializing', '辩论准备中...');
        ws.current.send(JSON.stringify({
            action: 'start',
            topic,
            participants,
            max_turns: maxTurns,
        }));
    }, []);

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
