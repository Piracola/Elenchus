import { act, cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DialogueEntry, Session } from '../types';
import { useDebateStore } from '../stores/debateStore';
import ChatPanel from './ChatPanel';

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

vi.mock('lucide-react', () => ({
    ChevronDown: () => null,
    FileJson: () => null,
    FileText: () => null,
    PanelLeftOpen: () => null,
}));

vi.mock('./chat/MessageRow', () => ({
    default: ({ agentEntry, judgeEntry, systemEntry }: { agentEntry?: DialogueEntry | null; judgeEntry?: DialogueEntry | null; systemEntry?: DialogueEntry | null }) => (
        <div data-testid="message-row">
            {agentEntry?.content ?? judgeEntry?.content ?? systemEntry?.content ?? 'row'}
        </div>
    ),
}));

vi.mock('./chat/DebateControls', () => ({
    default: () => <div data-testid="debate-controls" />,
}));

vi.mock('./chat/RuntimeInspector', () => ({
    default: () => <div data-testid="runtime-inspector" />,
}));

vi.mock('./chat/StatusBanner', () => ({
    default: () => <div data-testid="status-banner" />,
}));

vi.mock('./chat/RoundInsights', () => ({
    default: () => <div data-testid="round-insights" />,
}));

class MockResizeObserver {
    static instances: MockResizeObserver[] = [];

    private readonly callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        MockResizeObserver.instances.push(this);
    }

    observe(): void {}

    unobserve(): void {}

    disconnect(): void {}

    trigger(): void {
        this.callback([], this as unknown as ResizeObserver);
    }

    static reset(): void {
        MockResizeObserver.instances = [];
    }

    static triggerAll(): void {
        for (const instance of [...MockResizeObserver.instances]) {
            instance.trigger();
        }
    }
}

function makeDialogueEntry(index: number): DialogueEntry {
    const role = index % 2 === 0 ? 'proposer' : 'opposer';
    return {
        role,
        agent_name: role === 'proposer' ? 'Proposer' : 'Opposer',
        content: `History message ${index + 1}`,
        citations: [],
        timestamp: `2026-03-17T00:${String(index).padStart(2, '0')}:00Z`,
        event_id: `evt_${index + 1}`,
        turn: index,
    };
}

function makeSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session_history',
        topic: 'Long history session',
        debate_mode: 'standard',
        mode_config: {},
        participants: ['proposer', 'opposer'],
        max_turns: 200,
        current_turn: 199,
        status: 'completed',
        created_at: '2026-03-17T00:00:00+00:00',
        updated_at: '2026-03-17T00:00:00+00:00',
        dialogue_history: Array.from({ length: 180 }, (_, index) => makeDialogueEntry(index)),
        team_dialogue_history: [],
        jury_dialogue_history: [],
        current_scores: {},
        cumulative_scores: {},
        team_config: { agents_per_team: 0, discussion_rounds: 0 },
        jury_config: { agents_per_jury: 0, discussion_rounds: 0 },
        reasoning_config: {
            steelman_enabled: true,
            counterfactual_enabled: true,
            consensus_enabled: true,
        },
        mode_artifacts: [],
        current_mode_report: null,
        final_mode_report: null,
        ...overrides,
    };
}

describe('ChatPanel history rendering', () => {
    let measurementPhase = 0;
    let containerHeight = 320;

    beforeEach(() => {
        vi.useFakeTimers();
        useDebateStore.getState().reset();
        MockResizeObserver.reset();
        measurementPhase = 0;
        containerHeight = 320;

        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            writable: true,
            value: 1440,
        });

        Object.defineProperty(globalThis, 'ResizeObserver', {
            configurable: true,
            writable: true,
            value: MockResizeObserver,
        });

        Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
            configurable: true,
            value: function getBoundingClientRect(): DOMRect {
                const jitter = measurementPhase % 2;
                const height = 320 + jitter;
                return {
                    x: 0,
                    y: 0,
                    top: 0,
                    left: 0,
                    bottom: height,
                    right: 1024,
                    width: 1024,
                    height,
                    toJSON: () => ({}),
                } as DOMRect;
            },
        });

        Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
            configurable: true,
            get() {
                return containerHeight;
            },
        });

        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
            configurable: true,
            get() {
                return containerHeight;
            },
        });

        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
            configurable: true,
            get() {
                return 4800;
            },
        });

        Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
            configurable: true,
            get() {
                return 1024;
            },
        });

        Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
            configurable: true,
            writable: true,
            value: vi.fn(),
        });

        Object.defineProperty(Element.prototype, 'scrollIntoView', {
            configurable: true,
            writable: true,
            value: vi.fn(),
        });
    });

    afterEach(() => {
        cleanup();
        useDebateStore.getState().reset();
        MockResizeObserver.reset();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('keeps historical session rendering stable under repeated ResizeObserver notifications', () => {
        useDebateStore.getState().setCurrentSession(makeSession());

        expect(() => {
            render(<ChatPanel isSidebarCollapsed={false} onExpandSidebar={() => {}} />);
        }).not.toThrow();

        expect(screen.getByText('Long history session')).toBeInTheDocument();

        expect(() => {
            act(() => {
                MockResizeObserver.triggerAll();
                vi.runAllTimers();
                measurementPhase = 1;
                MockResizeObserver.triggerAll();
                vi.runAllTimers();
                measurementPhase = 2;
                MockResizeObserver.triggerAll();
                vi.runAllTimers();
            });
        }).not.toThrow();

        expect(screen.getAllByTestId('message-row').length).toBeGreaterThan(0);
    });

    it('updates virtualized rows when the scroll viewport height changes without requiring scroll', () => {
        useDebateStore.getState().setCurrentSession(makeSession());

        render(<ChatPanel isSidebarCollapsed={false} onExpandSidebar={() => {}} />);

        const before = screen.getAllByTestId('message-row').length;

        act(() => {
            containerHeight = 1280;
            MockResizeObserver.triggerAll();
            vi.runAllTimers();
        });

        const after = screen.getAllByTestId('message-row').length;
        expect(after).toBeGreaterThan(before);
    });
});
