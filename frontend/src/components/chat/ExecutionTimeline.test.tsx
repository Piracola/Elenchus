import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ExecutionTimeline from './ExecutionTimeline';

const runtimeState = {
    runtimeEvents: [
        {
            event_id: 'evt-1',
            seq: 1,
            type: 'status',
            timestamp: '2026-05-11T00:00:00Z',
            payload: {
                content: 'first event',
                node: 'speaker',
            },
        },
        {
            event_id: 'evt-2',
            seq: 2,
            type: 'status',
            timestamp: '2026-05-11T00:00:01Z',
            payload: {
                content: 'second event',
                node: 'judge',
            },
        },
    ],
    currentSessionId: 'session-1',
    currentTopic: 'Replay test',
    debateMode: 'standard' as const,
    replayEnabled: true,
    replayCursor: 0,
    focusedRuntimeEventId: 'evt-1',
    hasOlderRuntimeEvents: false,
};

const runtimeActions = {
    setFocusedRuntimeEventId: vi.fn((eventId: string) => {
        runtimeState.focusedRuntimeEventId = eventId;
    }),
    setReplayEnabled: vi.fn((enabled: boolean) => {
        runtimeState.replayEnabled = enabled;
    }),
    setReplayCursor: vi.fn((cursor: number) => {
        runtimeState.replayCursor = cursor;
    }),
    stepReplay: vi.fn(),
    exitReplay: vi.fn(),
};

vi.mock('framer-motion', () => {
    const createPrimitive = (tag: keyof HTMLElementTagNameMap) => {
        const Component = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & {
            children?: React.ReactNode;
            animate?: unknown;
            exit?: unknown;
            initial?: unknown;
            transition?: unknown;
            whileHover?: unknown;
            whileTap?: unknown;
        }>((props, ref) => {
            const {
                children,
                animate,
                exit,
                initial,
                transition,
                whileHover,
                whileTap,
                ...rest
            } = props;
            void animate;
            void exit;
            void initial;
            void transition;
            void whileHover;
            void whileTap;
            return React.createElement(tag, { ...rest, ref }, children);
        });
        Component.displayName = `MockMotion(${tag})`;
        return Component;
    };

    return {
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: new Proxy({}, {
            get: (_target, property: string) => createPrimitive(property as keyof HTMLElementTagNameMap),
        }),
    };
});

vi.mock('../../hooks/useDebateViewState', () => ({
    useRuntimeViewState: () => runtimeState,
    useRuntimeActions: () => runtimeActions,
}));

vi.mock('../../utils/viz/liveGraph', () => ({
    getLiveGraphNodeLabel: (node: string | null | undefined) => node ?? '',
}));

vi.mock('../../utils/runtime/eventFocus', () => ({
    getEventNode: (event: { payload?: { node?: string } } | null) => event?.payload?.node ?? null,
}));

vi.mock('../../utils/runtime/runtimeEventDictionary', () => ({
    getRuntimeEventGroup: (type: string) => {
        if (type === 'status') return 'status';
        return 'system';
    },
}));

vi.mock('../../utils/timeline/timelineWindow', () => ({
    TIMELINE_PAGE_SIZE: 50,
    buildTimelineSearchIndex: (events: typeof runtimeState.runtimeEvents) => events.map((event) => ({ event })),
    computeTimelinePageTotal: (length: number) => (length > 0 ? 1 : 1),
    filterIndexedTimelineEvents: (
        entries: Array<{ event: (typeof runtimeState.runtimeEvents)[number] }>,
        query: string,
    ) => entries
        .map((entry) => entry.event)
        .filter((event) => event.payload.content.includes(query) || query === ''),
    sliceTimelineTail: (events: typeof runtimeState.runtimeEvents) => events,
}));

vi.mock('./executionTimeline/useTimelineActions', () => ({
    useTimelineActions: () => ({
        historyLoading: false,
        snapshotLoading: false,
        fileInputRef: { current: null },
        handleLoadOlder: vi.fn(),
        handleExport: vi.fn(),
        handleLoadFullReplay: vi.fn(),
        handleImportFile: vi.fn(),
    }),
}));

describe('ExecutionTimeline slider sync', () => {
    beforeEach(() => {
        runtimeState.replayEnabled = true;
        runtimeState.replayCursor = 0;
        runtimeState.focusedRuntimeEventId = 'evt-1';
        runtimeActions.setFocusedRuntimeEventId.mockClear();
        runtimeActions.setReplayEnabled.mockClear();
        runtimeActions.setReplayCursor.mockClear();
        Object.defineProperty(Element.prototype, 'scrollIntoView', {
            configurable: true,
            writable: true,
            value: vi.fn(),
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('restores replay selection when pointerup happens on window after leaving the slider', async () => {
        render(<ExecutionTimeline embedded fillHeight />);

        const slider = screen.getByRole('slider');

        await act(async () => {
            fireEvent.pointerDown(slider);
            fireEvent.change(slider, { target: { value: '1' } });
        });

        expect(runtimeActions.setReplayCursor).toHaveBeenLastCalledWith(1);

        runtimeState.replayCursor = 1;

        await act(async () => {
            window.dispatchEvent(new Event('pointerup'));
        });

        expect(runtimeActions.setFocusedRuntimeEventId).toHaveBeenCalledWith('evt-2');
        expect(screen.getAllByText('second event')).toHaveLength(2);
    });
});
