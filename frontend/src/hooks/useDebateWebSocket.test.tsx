import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { useDebateStore } from '../stores/debateStore';
import type { RunSummary, Session } from '../types';
import { useDebateWebSocket } from './useDebateWebSocket';

vi.mock('../api/client', () => ({
    api: {
        runs: {
            create: vi.fn(),
            get: vi.fn(),
            command: vi.fn(),
        },
    },
}));

const createRunMock = vi.mocked(api.runs.create);
const getRunMock = vi.mocked(api.runs.get);
const commandRunMock = vi.mocked(api.runs.command);

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
            group_discussion_rounds: 0,
        },
        mode_artifacts: [],
        current_mode_report: null,
        final_mode_report: null,
    };
}

function makeRun(id: string, sessionId = 'session-a', overrides: Partial<RunSummary> = {}): RunSummary {
    return {
        id,
        session_id: sessionId,
        status: 'running',
        current_turn: 0,
        latest_seq: 0,
        last_status_message: '',
        last_error_message: null,
        started_at: null,
        completed_at: null,
        interrupted_at: null,
        last_progress_at: null,
        created_at: '2026-05-10T00:00:00Z',
        updated_at: '2026-05-10T00:00:00Z',
        ...overrides,
    };
}

describe('useDebateWebSocket', () => {
    const originalWebSocket = globalThis.WebSocket;

    beforeEach(() => {
        vi.useFakeTimers();
        MockWebSocket.reset();
        useDebateStore.getState().reset();
        useDebateStore.getState().setCurrentSession(makeSession('session-a'));
        useDebateStore.getState().setActiveRun(makeRun('run-a', 'session-a'));
        globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
        createRunMock.mockReset();
        getRunMock.mockReset();
        commandRunMock.mockReset();
        createRunMock.mockResolvedValue(makeRun('run-created', 'session-a'));
        getRunMock.mockResolvedValue({
            run: makeRun('run-a', 'session-a', {
                status: 'cancelled',
                last_status_message: '辩论已停止',
            }),
            session: makeSession('session-a'),
            projection: {},
        });
        commandRunMock.mockResolvedValue({
            accepted: true,
            run_id: 'run-a',
            command_type: 'stop',
            message: null,
        });
    });

    afterEach(() => {
        cleanup();
        useDebateStore.getState().reset();
        globalThis.WebSocket = originalWebSocket;
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('ignores close from the previous run after switching to a new run', () => {
        const { rerender } = renderHook(
            ({ runId }) => useDebateWebSocket(runId),
            { initialProps: { runId: 'run-a' } },
        );

        const firstSocket = MockWebSocket.instances[0];
        act(() => {
            firstSocket.emitOpen();
        });

        act(() => {
            useDebateStore.getState().setCurrentSession(makeSession('session-b'));
            useDebateStore.getState().setActiveRun(makeRun('run-b', 'session-b'));
            rerender({ runId: 'run-b' });
        });

        const secondSocket = MockWebSocket.instances[1];

        act(() => {
            firstSocket.emitClose();
            vi.advanceTimersByTime(9000);
        });

        expect(MockWebSocket.instances).toHaveLength(2);
        expect(secondSocket.url).toContain('/ws/runs/run-b');
    });

    it('ignores close from a stale run as soon as the store run changes', () => {
        renderHook(
            ({ runId }) => useDebateWebSocket(runId),
            { initialProps: { runId: 'run-a' } },
        );

        const firstSocket = MockWebSocket.instances[0];
        act(() => {
            firstSocket.emitOpen();
        });

        act(() => {
            useDebateStore.getState().setCurrentSession(makeSession('session-b'));
            useDebateStore.getState().setActiveRun(makeRun('run-b', 'session-b'));
            firstSocket.emitClose();
            vi.advanceTimersByTime(9000);
        });

        expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('ignores messages from the previous run after switching runs', () => {
        const { rerender } = renderHook(
            ({ runId }) => useDebateWebSocket(runId),
            { initialProps: { runId: 'run-a' } },
        );

        const firstSocket = MockWebSocket.instances[0];
        act(() => {
            firstSocket.emitOpen();
        });

        act(() => {
            useDebateStore.getState().setCurrentSession(makeSession('session-b'));
            useDebateStore.getState().setActiveRun(makeRun('run-b', 'session-b'));
            rerender({ runId: 'run-b' });
        });

        const secondSocket = MockWebSocket.instances[1];
        act(() => {
            secondSocket.emitOpen();
            firstSocket.emitMessage({
                schema_version: 'legacy',
                event_id: 'evt-old',
                run_id: 'run-a',
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
                run_id: 'run-b',
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

    it('ignores stale messages after the store run is cleared before rerender', () => {
        renderHook(
            ({ runId }) => useDebateWebSocket(runId),
            { initialProps: { runId: 'run-a' } },
        );

        const firstSocket = MockWebSocket.instances[0];
        act(() => {
            firstSocket.emitOpen();
        });

        act(() => {
            useDebateStore.getState().setCurrentSession(null);
            useDebateStore.getState().setActiveRun(null);
            firstSocket.emitMessage({
                schema_version: 'legacy',
                event_id: 'evt-old-null',
                run_id: 'run-a',
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

    it('only reconnects the active run', () => {
        const { rerender } = renderHook(
            ({ runId }) => useDebateWebSocket(runId),
            { initialProps: { runId: 'run-a' } },
        );

        const firstSocket = MockWebSocket.instances[0];
        act(() => {
            firstSocket.emitOpen();
        });

        act(() => {
            useDebateStore.getState().setCurrentSession(makeSession('session-b'));
            useDebateStore.getState().setActiveRun(makeRun('run-b', 'session-b'));
            rerender({ runId: 'run-b' });
        });

        const secondSocket = MockWebSocket.instances[1];
        act(() => {
            secondSocket.emitOpen();
            firstSocket.emitClose();
            secondSocket.emitClose();
        });

        act(() => {
            // Base delay (1000ms) plus the maximum reconnect jitter (500ms).
            vi.advanceTimersByTime(1500);
        });

        expect(MockWebSocket.instances).toHaveLength(3);
        expect(MockWebSocket.instances[2].url).toContain('/ws/runs/run-b');
    });

    it('ignores reconnect attempts from a stale run after the store run changes', () => {
        renderHook(
            ({ runId }) => useDebateWebSocket(runId),
            { initialProps: { runId: 'run-a' } },
        );

        const firstSocket = MockWebSocket.instances[0];
        act(() => {
            firstSocket.emitOpen();
        });

        act(() => {
            useDebateStore.getState().setCurrentSession(makeSession('session-b'));
            useDebateStore.getState().setActiveRun(makeRun('run-b', 'session-b'));
            firstSocket.emitClose();
        });

        act(() => {
            vi.advanceTimersByTime(1000);
        });

        expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('ignores reconnect attempts after the store run is cleared before rerender', () => {
        renderHook(
            ({ runId }) => useDebateWebSocket(runId),
            { initialProps: { runId: 'run-a' } },
        );

        const firstSocket = MockWebSocket.instances[0];
        act(() => {
            firstSocket.emitOpen();
        });

        act(() => {
            useDebateStore.getState().setCurrentSession(null);
            useDebateStore.getState().setActiveRun(null);
            firstSocket.emitClose();
            vi.advanceTimersByTime(9000);
        });

        expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('subscribes after the authoritative run sequence when a historical run is opened', () => {
        useDebateStore.getState().setActiveRun(makeRun('run-a', 'session-a', {
            status: 'stalled',
            current_turn: 5,
            latest_seq: 42,
        }));

        renderHook(
            ({ runId }) => useDebateWebSocket(runId),
            { initialProps: { runId: 'run-a' } },
        );

        expect(MockWebSocket.instances[0].url).toContain('/ws/runs/run-a?after_seq=42');
        expect(useDebateStore.getState().lastEventSeqByRun['run-a']).toBe(42);
    });

    it('keeps the current ping timer alive when an old timer fires after switching runs', () => {
        const { rerender } = renderHook(
            ({ runId }) => useDebateWebSocket(runId),
            { initialProps: { runId: 'run-a' } },
        );

        const firstSocket = MockWebSocket.instances[0];
        act(() => {
            firstSocket.emitOpen();
        });

        act(() => {
            useDebateStore.getState().setCurrentSession(makeSession('session-b'));
            useDebateStore.getState().setActiveRun(makeRun('run-b', 'session-b'));
            rerender({ runId: 'run-b' });
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

    it('stops stale ping timers from sending after the store run changes', () => {
        renderHook(
            ({ runId }) => useDebateWebSocket(runId),
            { initialProps: { runId: 'run-a' } },
        );

        const firstSocket = MockWebSocket.instances[0];
        act(() => {
            firstSocket.emitOpen();
        });

        act(() => {
            useDebateStore.getState().setCurrentSession(makeSession('session-b'));
            useDebateStore.getState().setActiveRun(makeRun('run-b', 'session-b'));
            vi.advanceTimersByTime(20000);
        });

        expect(firstSocket.send).not.toHaveBeenCalled();
    });

    it('stops stale ping timers after the store run is cleared before rerender', () => {
        renderHook(
            ({ runId }) => useDebateWebSocket(runId),
            { initialProps: { runId: 'run-a' } },
        );

        const firstSocket = MockWebSocket.instances[0];
        act(() => {
            firstSocket.emitOpen();
        });

        act(() => {
            useDebateStore.getState().setCurrentSession(null);
            useDebateStore.getState().setActiveRun(null);
            vi.advanceTimersByTime(20000);
        });

        expect(firstSocket.send).not.toHaveBeenCalled();
    });

    it('rolls back the optimistic session state when startRun fails', async () => {
        createRunMock.mockRejectedValueOnce(new Error('start failed'));

        const { result } = renderHook(
            ({ runId }) => useDebateWebSocket(runId),
            { initialProps: { runId: 'run-a' } },
        );

        await act(async () => {
            await result.current.startRun('Updated topic', ['speaker-a'], 9);
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

    it('marks the run as live immediately after startRun succeeds', async () => {
        createRunMock.mockResolvedValueOnce(makeRun('run-created', 'session-a', {
            status: 'initializing',
            last_status_message: '辩论准备中...',
        }));

        const { result } = renderHook(
            ({ runId }) => useDebateWebSocket(runId),
            { initialProps: { runId: 'run-a' } },
        );

        await act(async () => {
            await result.current.startRun('Updated topic', ['proposer', 'opposer'], 6);
        });

        const state = useDebateStore.getState();
        expect(state.activeRun?.status).toBe('initializing');
        expect(state.isDebating).toBe(true);
        expect(state.phase).toBe('initializing');
    });

    it('sends stop as a run command and leaves websocket control passive', async () => {
        const { result } = renderHook(
            ({ runId }) => useDebateWebSocket(runId),
            { initialProps: { runId: 'run-a' } },
        );

        const socket = MockWebSocket.instances[0];
        act(() => {
            socket.emitOpen();
        });

        await act(async () => {
            await result.current.stopRun();
        });

        expect(commandRunMock).toHaveBeenCalledWith('run-a', 'stop');
        expect(getRunMock).toHaveBeenCalledWith('run-a');
        expect(socket.send).not.toHaveBeenCalledWith(JSON.stringify({ action: 'stop' }));
        expect(useDebateStore.getState().phase).toBe('idle');
        expect(useDebateStore.getState().activeRun?.status).toBe('cancelled');
    });

    it('sends resume as a run command without creating a new run', async () => {
        useDebateStore.getState().setActiveRun(makeRun('run-a', 'session-a', {
            status: 'stalled',
            current_turn: 2,
        }));
        const { result } = renderHook(
            ({ runId }) => useDebateWebSocket(runId),
            { initialProps: { runId: 'run-a' } },
        );

        await act(async () => {
            await result.current.resumeRun();
        });

        expect(createRunMock).not.toHaveBeenCalled();
        expect(commandRunMock).toHaveBeenCalledWith('run-a', 'resume');
        expect(useDebateStore.getState().isDebating).toBe(true);
        expect(useDebateStore.getState().phase).toBe('processing');
        expect(useDebateStore.getState().activeRun?.status).toBe('running');
    });

    it('skips stop command when there is no active run', async () => {
        useDebateStore.getState().setActiveRun(null);
        const { result } = renderHook(
            ({ runId }) => useDebateWebSocket(runId),
            { initialProps: { runId: null as string | null } },
        );

        await act(async () => {
            await result.current.stopRun();
        });

        expect(commandRunMock).not.toHaveBeenCalled();
        expect(useDebateStore.getState().phase).toBe('idle');
        expect(useDebateStore.getState().isDebating).toBe(false);
    });

    it('refreshes authoritative run state when stop command fails', async () => {
        commandRunMock.mockRejectedValueOnce(new Error('stop failed'));
        getRunMock.mockResolvedValueOnce({
            run: makeRun('run-a', 'session-a', {
                status: 'failed',
                last_status_message: '运行失败',
                last_error_message: '模型调用异常',
            }),
            session: makeSession('session-a'),
            projection: {},
        });

        const { result } = renderHook(
            ({ runId }) => useDebateWebSocket(runId),
            { initialProps: { runId: 'run-a' } },
        );

        await act(async () => {
            await result.current.stopRun();
        });

        expect(getRunMock).toHaveBeenCalledWith('run-a');
        expect(useDebateStore.getState().activeRun?.status).toBe('failed');
        expect(useDebateStore.getState().phase).toBe('error');
        expect(useDebateStore.getState().currentStatus).toBe('模型调用异常');
    });
});

