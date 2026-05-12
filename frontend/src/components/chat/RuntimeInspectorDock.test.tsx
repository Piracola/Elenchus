import React, { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import RuntimeInspectorDock from './RuntimeInspectorDock';
import { RUNTIME_INSPECTOR_PANEL_STORAGE_KEY } from '../../utils/inspector/runtimeInspectorDock';

vi.mock('framer-motion', () => ({
    AnimatePresence: ({ children }: { children: unknown }) => <>{children}</>,
    motion: new Proxy({}, {
        get: (_target, property: string) => {
            const tag = property === 'button' ? 'button' : 'div';
            return React.forwardRef<HTMLElement, Record<string, unknown>>(({ children, whileHover, whileTap, ...props }, ref) => {
                void whileHover;
                void whileTap;
                return React.createElement(tag, { ...props, ref }, children as ReactNode);
            });
        },
    }),
}));

vi.mock('lucide-react', () => ({
    Activity: () => null,
    GitBranch: () => null,
    History: () => null,
    X: () => null,
}));

vi.mock('../../hooks/useDebateViewState', () => ({
    useRuntimeViewState: () => ({
        runtimeEventCount: 12,
        visibleRuntimeEvents: [
            { type: 'memory_write' },
            { type: 'status' },
        ],
        currentNode: 'speaker',
        debateMode: 'standard',
        replayEnabled: false,
        isDocumentVisible: true,
    }),
}));

vi.mock('../../utils/viz/liveGraph', () => ({
    getLiveGraphNodeLabel: () => '发言节点',
}));

vi.mock('./ExecutionTimeline', () => ({
    default: () => <div data-testid="timeline-panel" />,
}));

vi.mock('./LiveGraph', () => ({
    default: () => <div data-testid="graph-panel" />,
}));

vi.mock('./MemoryPanel', () => ({
    default: () => <div data-testid="memory-panel" />,
}));

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: 1440,
    });
    Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        writable: true,
        value: 960,
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function mockRect(this: HTMLElement) {
        const testId = this.dataset?.testid;
        if (testId === 'runtime-inspector-panel-timeline') {
            return {
                x: 140,
                y: 116,
                top: 116,
                left: 140,
                right: 1140,
                bottom: 656,
                width: 1000,
                height: 540,
                toJSON: () => ({}),
            } as DOMRect;
        }
        if (testId === 'runtime-inspector-panel-graph') {
            return {
                x: 390,
                y: 116,
                top: 116,
                left: 390,
                right: 1210,
                bottom: 546,
                width: 820,
                height: 430,
                toJSON: () => ({}),
            } as DOMRect;
        }
        if (testId === 'runtime-inspector-panel-memory') {
            return {
                x: 462,
                y: 116,
                top: 116,
                left: 462,
                right: 1322,
                bottom: 586,
                width: 860,
                height: 470,
                toJSON: () => ({}),
            } as DOMRect;
        }

        const text = this.textContent ?? '';
        if (text.includes('执行时间线')) {
            return {
                x: 640,
                y: 72,
                top: 72,
                left: 640,
                right: 740,
                bottom: 104,
                width: 100,
                height: 32,
                toJSON: () => ({}),
            } as DOMRect;
        }
        if (text.includes('流程图')) {
            return {
                x: 760,
                y: 72,
                top: 72,
                left: 760,
                right: 840,
                bottom: 104,
                width: 80,
                height: 32,
                toJSON: () => ({}),
            } as DOMRect;
        }
        if (text.includes('记忆')) {
            return {
                x: 860,
                y: 72,
                top: 72,
                left: 860,
                right: 924,
                bottom: 104,
                width: 64,
                height: 32,
                toJSON: () => ({}),
            } as DOMRect;
        }

        return {
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: 0,
            height: 0,
            toJSON: () => ({}),
        } as DOMRect;
    });
});

describe('RuntimeInspectorDock', () => {
    it('renders three fixed inspector entry buttons', () => {
        render(<RuntimeInspectorDock currentSessionId="session-1" />);

        expect(screen.getByRole('button', { name: '执行时间线' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '流程图' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '记忆' })).toBeInTheDocument();
    });

    it('opens a panel only after the user clicks an entry button', () => {
        render(<RuntimeInspectorDock currentSessionId="session-1" />);

        expect(screen.queryByTestId('timeline-panel')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '执行时间线' }));

        expect(screen.getByTestId('timeline-panel')).toBeInTheDocument();
        expect(screen.getByTestId('runtime-inspector-panel-timeline')).toHaveStyle({
            position: 'fixed',
            top: '116px',
        });
        expect(screen.queryByTestId('graph-panel')).not.toBeInTheDocument();
        expect(screen.queryByTestId('memory-panel')).not.toBeInTheDocument();
    });

    it('switches to another inspector panel without leaving the previous overlay open', () => {
        render(<RuntimeInspectorDock currentSessionId="session-1" />);

        fireEvent.click(screen.getByRole('button', { name: '执行时间线' }));
        expect(screen.getByTestId('runtime-inspector-panel-timeline')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '流程图' }));

        expect(screen.queryByTestId('runtime-inspector-panel-timeline')).not.toBeInTheDocument();
        expect(screen.getByTestId('runtime-inspector-panel-graph')).toBeInTheDocument();
        expect(screen.getByTestId('graph-panel')).toBeInTheDocument();
    });

    it('centers memory panel under its own trigger on first open', () => {
        render(<RuntimeInspectorDock currentSessionId="session-1" />);

        fireEvent.click(screen.getByRole('button', { name: '记忆' }));

        const panel = screen.getByTestId('runtime-inspector-panel-memory');
        expect(panel).toHaveStyle({
            top: '116px',
            left: '462px',
        });
    });

    it('reopens with the remembered panel size from local storage', () => {
        window.localStorage.setItem(RUNTIME_INSPECTOR_PANEL_STORAGE_KEY, JSON.stringify({
            timeline: { width: 1000, height: 540 },
        }));

        render(<RuntimeInspectorDock currentSessionId="session-1" />);

        fireEvent.click(screen.getByRole('button', { name: '执行时间线' }));

        const stored = JSON.parse(window.localStorage.getItem(RUNTIME_INSPECTOR_PANEL_STORAGE_KEY) ?? '{}');
        expect(stored.timeline).toMatchObject({ width: 1000, height: 540 });

        let reopenedPanel = screen.getByTestId('runtime-inspector-panel-timeline');
        expect(reopenedPanel).toHaveStyle({ width: '1000px', height: '540px' });

        fireEvent.click(screen.getByLabelText('关闭运行观察器面板'));
        fireEvent.click(screen.getByRole('button', { name: '执行时间线' }));

        reopenedPanel = screen.getByTestId('runtime-inspector-panel-timeline');
        expect(reopenedPanel).toHaveStyle({ width: '1000px', height: '540px' });
    });
});
