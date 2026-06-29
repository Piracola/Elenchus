import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { useDebateStore } from '../stores/debateStore';
import type { Session } from '../types';
import { useDebateWebSocket } from './useDebateWebSocket';

vi.mock('../api/client', () => ({
    api: {
        sessions: {
            startDebate: vi.fn(),
            stopDebate: vi.fn(),
        },
    },
}));

const startDebateMock = vi.mocked(api.sessions.startDebate);
const stopDebateMock = vi.mocked(api.sessions.stopDebate);

class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    static instances: MockWebSocket[] = [];

    readonly url: string;
    readyState = MockWebSocket.CONNECTING;
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    send = vi.fn<(data: string) => void>();
    close = vi.fn<() => void>(() => {
        this.readyState = MockWebSocket.CLOSED;
    });

    constructor(url: string) {
        this.url = url;
        MockWebSocket.instances.push(this);
    }

    emitOpen() {
        this.readyState = MockWebSocket.OPEN;
        this.onopen?.(new Event('open'));
    }

    emitMessage(data: unknown) {
        this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) } as MessageEvent);
    }

    emitClose() {
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.(new CloseEvent('close'));
    }

    static reset() {
        MockWebSocket.instances = [];
    }
}

function makeSession(id: string): Session {
    return {
        id,
        topic: `Topic ${id}`,
        debate_mode: 'standard',
        mode_config: {},
        participants: ['proposer', 'opposer'],
        max_turns: 6,
        current_turn: 0,
        status: 'pending',
        created_at: '2026-05-10T00:00:00Z',
        updated_at: '2026-05-10T00:00:00Z',
        dialogue_history: [],
        current_scores: {},
        cumulative_scores: {},
        reasoning_config: {
            consensus_enabled: false,
        },
        mode_artifacts: [],
        current_mode_report: null,
        final_mode_report: null,
    };
}

describe('useDebateWebSocket', () => {
    const originalWebSocket = globalThis.WebSocket;

    beforeEach(() => {
        vi.useFakeTimers();
        MockWebSocket.reset();
        useDebateStore.getState().reset();
        useDebateStore.getState().setCurrentSession(makeSession('session-a'));
        globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
        startDebateMock.mockReset();
        stopDebateMock.mockReset();
        startDebateMock.mockResolvedValue({
            started: true,
            session_id: 'session-a',
        });
        stopDebateMock.mockResolvedValue({
            stopped: true,
            session_id: 'session-a',
        });
    });

    afterEach(() => {
        cleanup();
        useDebateStore.getState().reset();
        globalThis.WebSocket = originalWebSocket;
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('ignores close from the previous session after switching to a new session', () => {
        const { rerender } = renderHook(
            ({ sessionId }) => useDebateWebSocket(sessionId),
            { initialProps: { sessionId: 'session-a' } },
        );

        const firstSocket = MockWebSocket.instances[0];
        act(() => {
            firstSocket.emitOpen();
        });

        act(() => {
            useDebateStore.getState().setCurrentSession(makeSession('session-b'));
            rerender({ sessionId: 'session-b' });
        });

        const secondSocket = MockWebSocket.instances[1];

        act(() => {
            firstSocket.emitClose();
            vi.advanceTimersByTime(9000);
        });

        expect(MockWebSocket.instances).toHaveLength(2);
        expect(secondSocket.url).toContain('/ws/session-b');
    });

    it('ignores close from a stale session as soon as the store session changes', () => {
        renderHook(
            ({ sessionId }) => useDebateWebSocket(sessionId),
            { initialProps: { sessionId: 'session-a' } },
        );

        const firstSocket = MockWebSocket.instances[0];
        act(() => {
            firstSocket.emitOpen();
        });

        act(() => {
            useDebateStore.getState().setCurrentSession(makeSession('session-b'));
            firstSocket.emitClose();
            vi.advanceTimersByTime(9000);
        });

        expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('ignores messages from the previous session after switching sessions', () => {
        const { rerender } = renderHook(
            ({ sessionId }) => useDebateWebSocket(sessionId),
            { initialProps: { sessionId: 'session-a' } },
        );

        const firstSocket = MockWebSocket.instances[0];
        act(() => {
            firstSocket.emitOpen();
        });

        act(() => {
            useDebateStore.getState().setCurrentSession(makeSession('session-b'));
            rerender({ sessionId: 'session-b' });
        });

        const secondSocket = MockWebSocket.instances[1];
        act(() => {
            secondSocket.emitOpen();
            firstSocket.emitMessage({
                schema_version: 'legacy',
                event_id: 'evt-old',
                session_id: 'session-a',
                timestamp: '2026-05-10T00:00:01Z',
                source: 'legacy',
                type: 'status',
                payload: {
                    phase: 'processing',
                    content: 'legacy-status',
                    node: 'speaker',
                },
            });
            secondSocket.emitMessage({
                schema_version: 'legacy',
                event_id: 'evt-new',
                session_id: 'session-b',
                timestamp: '2026-05-10T00:00:02Z',
                source: 'legacy',
                type: 'status',
                payload: {
                    phase: 'judging',
                    content: 'current-status',
                    node: 'judge',
                },
            });
        });

        const state = useDebateStore.getState();
        expect(state.runtimeEvents).toHaveLength(1);
        expect(state.runtimeEvents[0]?.event_id).toBe('evt-new');
        expect(state.currentStatus).toBe('current-status');
        expect(state.phase).toBe('judging');
    });

    it('ignores stale messages after the store session is cleared before rerender', () => {
        renderHook(
            ({ sessionId }) => useDebateWebSocket(sessionId),
            { initialProps: { sessionId: 'session-a' } },
        );

        const firstSocket = MockWebSocket.instances[0];
        act(() => {
            firstSocket.emitOpen();
        });

        act(() => {
            useDebateStore.getState().setCurrentSession(null);
            firstSocket.emitMessage({
                schema_version: 'legacy',
                event_id: 'evt-old-null',
                session_id: 'session-a',
                timestamp: '2026-05-10T00:00:03Z',
                source: 'legacy',
                type: 'status',
                payload: {
                    phase: 'processing',
                    content: 'stale-after-clear',
                    node: 'speaker',
                },
            });
        });

        const state = useDebateStore.getState();
        expect(state.runtimeEvents).toHaveLength(0);
        expect(state.currentStatus).toBe('');
    });

    it('only reconnects the active session', () => {
        const { rerender } = renderHook(
            ({ sessionId }) => useDebateWebSocket(sessionId),
            { initialProps: { sessionId: 'session-a' } },
        );

        const firstSocket = MockWebSocket.instances[0];
        act(() => {
            firstSocket.emitOpen();
        });

        act(() => {
            useDebateStore.getState().setCurrentSession(makeSession('session-b'));
            rerender({ sessionId: 'session-b' });
        });

        const secondSocket = MockWebSocket.instances[1];
        act(() => {
            secondSocket.emitOpen();
            firstSocket.emitClose();
            secondSocket.emitClose();
        });

        act(() => {
            vi.advanceTimersByTime(1000);
        });

        expect(MockWebSocket.instances).toHaveLength(3);
        expect(MockWebSocket.instances[2].url).toContain('/ws/session-b');
    });

    it('ignores reconnect attempts from a stale session after the store session changes', () => {
        renderHook(
            ({ sessionId }) => useDebateWebSocket(sessionId),
            { initialProps: { sessionId: 'session-a' } },
        );

        const firstSocket = MockWebSocket.instances[0];
        act(() => {
            firstSocket.emitOpen();
        });

        act(() => {
            useDebateStore.getState().setCurrentSession(makeSession('session-b'));
            firstSocket.emitClose();
        });

        act(() => {
            vi.advanceTimersByTime(1000);
        });

        expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('ignores reconnect attempts after the store session is cleared before rerender', () => {
        renderHook(
            ({ sessionId }) => useDebateWebSocket(sessionId),
            { initialProps: { sessionId: 'session-a' } },
        );

        const firstSocket = MockWebSocket.instances[0];
        act(() => {
            firstSocket.emitOpen();
        });

        act(() => {
            useDebateStore.getState().setCurrentSession(null);
            firstSocket.emitClose();
            vi.advanceTimersByTime(9000);
        });

        expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('keeps the current ping timer alive when an old timer fires after switching sessions', () => {
        const { rerender } = renderHook(
            ({ sessionId }) => useDebateWebSocket(sessionId),
            { initialProps: { sessionId: 'session-a' } },
        );

        const firstSocket = MockWebSocket.instances[0];
        act(() => {
            firstSocket.emitOpen();
        });

        act(() => {
            useDebateStore.getState().setCurrentSession(makeSession('session-b'));
            rerender({ sessionId: 'session-b' });
        });

        const secondSocket = MockWebSocket.instances[1];
        act(() => {
            secondSocket.emitOpen();
        });

        act(() => {
            vi.advanceTimersByTime(20000);
        });

        expect(secondSocket.send).toHaveBeenCalledWith(JSON.stringify({ action: 'ping' }));
    });

    it('stops stale ping timers from sending after the store session changes', () => {
        renderHook(
            ({ sessionId }) => useDebateWebSocket(sessionId),
            { initialProps: { sessionId: 'session-a' } },
        );

        const firstSocket = MockWebSocket.instances[0];
        act(() => {
            firstSocket.emitOpen();
        });

        act(() => {
            useDebateStore.getState().setCurrentSession(makeSession('session-b'));
            vi.advanceTimersByTime(20000);
        });

        expect(firstSocket.send).not.toHaveBeenCalled();
    });

    it('stops stale ping timers after the store session is cleared before rerender', () => {
        renderHook(
            ({ sessionId }) => useDebateWebSocket(sessionId),
            { initialProps: { sessionId: 'session-a' } },
        );

        const firstSocket = MockWebSocket.instances[0];
        act(() => {
            firstSocket.emitOpen();
        });

        act(() => {
            useDebateStore.getState().setCurrentSession(null);
            vi.advanceTimersByTime(20000);
        });

        expect(firstSocket.send).not.toHaveBeenCalled();
    });

    it('rolls back the optimistic session state when startDebate fails', async () => {
        startDebateMock.mockRejectedValueOnce(new Error('start failed'));

        const { result } = renderHook(
            ({ sessionId }) => useDebateWebSocket(sessionId),
            { initialProps: { sessionId: 'session-a' } },
        );

        await act(async () => {
            await result.current.startDebate('Updated topic', ['speaker-a'], 9);
        });

        const state = useDebateStore.getState();
        expect(state.isDebating).toBe(false);
        expect(state.phase).toBe('error');
        expect(state.currentSession).toMatchObject({
            id: 'session-a',
            topic: 'Topic session-a',
            participants: ['proposer', 'opposer'],
            max_turns: 6,
            status: 'pending',
        });
    });

    it('falls back to websocket stop when the REST stop call fails and the socket is open', async () => {
        stopDebateMock.mockRejectedValueOnce(new Error('stop failed'));

        const { result } = renderHook(
            ({ sessionId }) => useDebateWebSocket(sessionId),
            { initialProps: { sessionId: 'session-a' } },
        );

        const socket = MockWebSocket.instances[0];
        act(() => {
            socket.emitOpen();
        });

        await act(async () => {
            await result.current.stopDebate();
        });

        expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ action: 'stop' }));
        expect(useDebateStore.getState().phase).toBe('idle');
    });

    it('skips websocket stop fallback when the socket is not open', async () => {
        stopDebateMock.mockRejectedValueOnce(new Error('stop failed'));

        const { result } = renderHook(
            ({ sessionId }) => useDebateWebSocket(sessionId),
            { initialProps: { sessionId: 'session-a' } },
        );

        const socket = MockWebSocket.instances[0];
        socket.readyState = MockWebSocket.CLOSED;

        await act(async () => {
            await result.current.stopDebate();
        });

        expect(socket.send).not.toHaveBeenCalled();
        expect(useDebateStore.getState().phase).toBe('idle');
        expect(useDebateStore.getState().isDebating).toBe(false);
    });
});
