import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../api/client';
import { toast } from '../utils/chat/toast';
import HomeView from './HomeView';

let animationFrameQueue: Array<{ id: number; callback: FrameRequestCallback }> = [];
let nextAnimationFrameId = 1;
let mockOffsetTop = 240;
let nowTime = 10_000;
let createSessionMock: ReturnType<typeof vi.fn>;

function flushAnimationFrames() {
    const queuedFrames = [...animationFrameQueue];
    animationFrameQueue = [];

    for (const { callback } of queuedFrames) {
        callback(0);
    }
}

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
        useReducedMotion: () => false,
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: new Proxy({}, {
            get: (_target, property: string) => createPrimitive(property as keyof HTMLElementTagNameMap),
        }),
    };
});

vi.mock('../hooks/useAgentConfigs', () => ({
    useAgentConfigs: () => {
        const [showAdvanced, setShowAdvanced] = React.useState(false);
        return {
            showAdvanced,
            setShowAdvanced,
            savedConfigs: [],
            selectedConfigIds: {},
            temperatureInputs: {},
            showConfigManager: false,
            setShowConfigManager: vi.fn(),
            isLoading: false,
            error: null,
            reload: vi.fn(),
            handleConfigSelect: vi.fn(),
            handleTemperatureChange: vi.fn(),
            buildAgentConfigs: () => ({}),
        };
    },
}));

vi.mock('../hooks/useSessionCreate', () => ({
    useSessionCreate: () => ({
        isCreating: false,
        error: '',
        createSession: createSessionMock,
        clearError: vi.fn(),
    }),
}));

vi.mock('../stores/settingsStore', () => ({
    useSettingsStore: () => ({
        displaySettings: {
            messageFontSize: 15,
        },
    }),
}));

vi.mock('../config/display', () => ({
    getMessageFontTokens: () => ({
        home: {
            title: '32px',
            subtitle: '16px',
            topicInput: '18px',
            warningBody: '14px',
        },
    }),
}));

vi.mock('./home/HomeModeSelector', () => ({
    HomeModeSelector: () => <div data-testid="home-mode-selector" />,
}));

vi.mock('./home/HomeStatusLegend', () => ({
    HomeStatusLegend: () => <div data-testid="home-status-legend" />,
}));

vi.mock('./shared/AgentConfigPanel', () => ({
    default: () => <div data-testid="agent-config-panel" />,
}));

vi.mock('./shared/BrandIcon', () => ({
    default: () => <div data-testid="brand-icon" />,
}));

vi.mock('./shared/SidebarExpandButton', () => ({
    default: ({ onClick }: { onClick: () => void }) => (
        <button type="button" onClick={onClick}>
            Expand
        </button>
    ),
}));

vi.mock('./shared/SophistryModeNotice', () => ({
    default: () => <div data-testid="sophistry-mode-notice" />,
}));

vi.mock('../api/client', () => ({
    api: {
        sessions: {
            uploadDocument: vi.fn(),
            recentConfig: vi.fn().mockResolvedValue(null),
        },
    },
}));

vi.mock('../utils/chat/toast', () => ({
    toast: vi.fn(),
}));

vi.mock('./home/HomeComposerCard', () => ({
    HomeComposerCard: ({
        topic,
        onTopicChange,
        onShowAdvancedChange,
        onDocumentsChange,
        pendingDocuments,
        showAdvanced,
        onCreateDebate,
    }: {
        topic: string;
        onTopicChange: (value: string) => void;
        onShowAdvancedChange: (value: boolean) => void;
        onDocumentsChange: (documents: Array<{ id: string; name: string; size: number; file: File }>) => void;
        pendingDocuments: Array<{ id: string; name: string; size: number; file: File }>;
        showAdvanced: boolean;
        onCreateDebate: () => void;
    }) => (
        <div>
            <input
                aria-label="topic"
                value={topic}
                onChange={(event) => onTopicChange(event.target.value)}
            />
            <button type="button" onClick={() => onShowAdvancedChange(!showAdvanced)}>
                Toggle advanced
            </button>
            <button
                type="button"
                onClick={() => onDocumentsChange([
                    {
                        id: 'doc-1',
                        name: 'note.md',
                        size: 12,
                        file: new File(['hello'], 'note.md', { type: 'text/markdown' }),
                    },
                    {
                        id: 'doc-2',
                        name: 'failed.md',
                        size: 18,
                        file: new File(['fail'], 'failed.md', { type: 'text/markdown' }),
                    },
                ])}
            >
                Add document
            </button>
            <button
                type="button"
                onClick={onCreateDebate}
            >
                Create debate
            </button>
            <div data-testid="pending-document-count">{pendingDocuments.length}</div>
            <div data-testid="pending-document-names">
                {pendingDocuments.map((document) => document.name).join(',')}
            </div>
        </div>
    ),
}));

describe('HomeView auto scroll', () => {
    beforeEach(() => {
        vi.mocked(api.sessions.recentConfig).mockResolvedValue(null);
        cleanup();
        animationFrameQueue = [];
        nextAnimationFrameId = 1;
        mockOffsetTop = 240;
        nowTime = 10_000;
        createSessionMock = vi.fn().mockResolvedValue('session-created');

        Object.defineProperty(window, 'requestAnimationFrame', {
            configurable: true,
            writable: true,
            value: vi.fn((callback: FrameRequestCallback) => {
                const id = nextAnimationFrameId++;
                animationFrameQueue.push({ id, callback });
                return id;
            }),
        });

        Object.defineProperty(window, 'cancelAnimationFrame', {
            configurable: true,
            writable: true,
            value: vi.fn((id: number) => {
                animationFrameQueue = animationFrameQueue.filter((frame) => frame.id !== id);
            }),
        });

        Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
            configurable: true,
            writable: true,
            value: vi.fn(),
        });

        Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
            configurable: true,
            get() {
                return mockOffsetTop;
            },
        });

        vi.spyOn(Date, 'now').mockImplementation(() => nowTime);
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it('does not auto-scroll on first render', () => {
        render(<HomeView isSidebarCollapsed={false} onExpandSidebar={() => {}} />);

        act(() => {
            flushAnimationFrames();
        });

        expect(HTMLElement.prototype.scrollTo).not.toHaveBeenCalled();
    });

    it('scrolls when the advanced panel opens, but not during later typing or document updates', () => {
        render(<HomeView isSidebarCollapsed={false} onExpandSidebar={() => {}} />);

        fireEvent.click(screen.getByRole('button', { name: 'Toggle advanced' }));

        act(() => {
            flushAnimationFrames();
        });

        expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledTimes(1);
        expect(HTMLElement.prototype.scrollTo).toHaveBeenLastCalledWith({
            top: 224,
            behavior: 'smooth',
        });

        vi.mocked(HTMLElement.prototype.scrollTo).mockClear();

        fireEvent.change(screen.getByLabelText('topic'), {
            target: { value: 'A better debate topic' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Add document' }));

        act(() => {
            flushAnimationFrames();
        });

        expect(HTMLElement.prototype.scrollTo).not.toHaveBeenCalled();
    });

    it('does not auto-scroll when the advanced panel closes', () => {
        render(<HomeView isSidebarCollapsed={false} onExpandSidebar={() => {}} />);

        fireEvent.click(screen.getByRole('button', { name: 'Toggle advanced' }));
        act(() => {
            flushAnimationFrames();
        });

        vi.mocked(HTMLElement.prototype.scrollTo).mockClear();

        fireEvent.click(screen.getByRole('button', { name: 'Toggle advanced' }));

        act(() => {
            flushAnimationFrames();
        });

        expect(HTMLElement.prototype.scrollTo).not.toHaveBeenCalled();
    });

    it('clamps the advanced panel scroll target to the top of the page on small layouts', () => {
        mockOffsetTop = 8;

        render(<HomeView isSidebarCollapsed={false} onExpandSidebar={() => {}} />);

        fireEvent.click(screen.getByRole('button', { name: 'Toggle advanced' }));

        act(() => {
            flushAnimationFrames();
        });

        expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledTimes(1);
        expect(HTMLElement.prototype.scrollTo).toHaveBeenLastCalledWith({
            top: 0,
            behavior: 'smooth',
        });
    });

    it('skips the first-open auto-scroll while the user is actively typing in the home view', () => {
        render(<HomeView isSidebarCollapsed={false} onExpandSidebar={() => {}} />);

        const topicInput = screen.getByLabelText('topic');
        fireEvent.focus(topicInput);
        fireEvent.click(screen.getByRole('button', { name: 'Toggle advanced' }));

        act(() => {
            flushAnimationFrames();
        });

        expect(HTMLElement.prototype.scrollTo).not.toHaveBeenCalled();
    });

    it('still allows a later first-open auto-scroll after the interaction guard window passes', () => {
        render(<HomeView isSidebarCollapsed={false} onExpandSidebar={() => {}} />);

        const topicInput = screen.getByLabelText('topic');
        fireEvent.focus(topicInput);
        fireEvent.click(screen.getByRole('button', { name: 'Toggle advanced' }));

        act(() => {
            flushAnimationFrames();
        });

        expect(HTMLElement.prototype.scrollTo).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Toggle advanced' }));
        nowTime += 1_500;
        fireEvent.blur(topicInput);
        fireEvent.click(screen.getByRole('button', { name: 'Toggle advanced' }));

        act(() => {
            flushAnimationFrames();
        });

        expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledTimes(1);
        expect(HTMLElement.prototype.scrollTo).toHaveBeenLastCalledWith({
            top: 224,
            behavior: 'smooth',
        });
    });

    it('does not treat focusing the toggle button as a blocked interaction', () => {
        render(<HomeView isSidebarCollapsed={false} onExpandSidebar={() => {}} />);

        const toggleButton = screen.getByRole('button', { name: 'Toggle advanced' });
        fireEvent.focus(toggleButton);
        fireEvent.click(toggleButton);

        act(() => {
            flushAnimationFrames();
        });

        expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledTimes(1);
        expect(HTMLElement.prototype.scrollTo).toHaveBeenLastCalledWith({
            top: 224,
            behavior: 'smooth',
        });
    });

    it('skips auto-scroll when the panel is opened from keyboard interaction', () => {
        render(<HomeView isSidebarCollapsed={false} onExpandSidebar={() => {}} />);

        const toggleButton = screen.getByRole('button', { name: 'Toggle advanced' });
        fireEvent.focus(toggleButton);
        fireEvent.keyDown(toggleButton, { key: 'Enter' });
        fireEvent.click(toggleButton);

        act(() => {
            flushAnimationFrames();
        });

        expect(HTMLElement.prototype.scrollTo).not.toHaveBeenCalled();
    });

    it('keeps failed reference uploads pending after creating a debate', async () => {
        const uploadDocumentMock = vi.mocked(api.sessions.uploadDocument);
        uploadDocumentMock.mockImplementation(async (_sessionId, file) => {
            if (file.name === 'failed.md') {
                throw new Error('upload failed');
            }
            return {
                id: file.name,
                session_id: 'session-created',
                filename: file.name,
                mime_type: file.type,
                size_bytes: file.size,
                status: 'uploaded',
                summary_short: null,
                error_message: null,
                created_at: '2026-01-01T00:00:00Z',
                updated_at: '2026-01-01T00:00:00Z',
            };
        });

        render(<HomeView isSidebarCollapsed={false} onExpandSidebar={() => {}} />);

        fireEvent.change(screen.getByLabelText('topic'), {
            target: { value: 'Topic with references' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Add document' }));

        expect(uploadDocumentMock).not.toHaveBeenCalled();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Create debate' }));
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(createSessionMock).toHaveBeenCalledTimes(1);
        expect(uploadDocumentMock).toHaveBeenCalledTimes(2);
        expect(uploadDocumentMock).toHaveBeenNthCalledWith(
            1,
            'session-created',
            expect.objectContaining({ name: 'note.md' }),
        );
        expect(uploadDocumentMock).toHaveBeenNthCalledWith(
            2,
            'session-created',
            expect.objectContaining({ name: 'failed.md' }),
        );
        expect(vi.mocked(toast)).toHaveBeenCalledWith('成功上传 1 个参考资料，1 个失败', 'success');
        expect(screen.getByTestId('pending-document-count')).toHaveTextContent('1');
        expect(screen.getByTestId('pending-document-names')).toHaveTextContent('failed.md');
    });
});
