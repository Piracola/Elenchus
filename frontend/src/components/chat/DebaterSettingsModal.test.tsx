import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import DebaterSettingsModal from './DebaterSettingsModal';

const updateAgentConfigsMock = vi.fn();
const updateCurrentSessionAgentConfigsMock = vi.fn();
const buildAgentConfigsMock = vi.fn(() => ({
    proposer: { provider_id: 'provider-1', model: 'model-a' },
}));

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

vi.mock('../../api/client', () => ({
    api: {
        sessions: {
            updateAgentConfigs: (...args: unknown[]) => updateAgentConfigsMock(...args),
        },
    },
}));

vi.mock('../../utils/chat/toast', () => ({
    toast: vi.fn(),
}));

vi.mock('../../hooks/useAgentConfigs', () => ({
    useAgentConfigs: () => ({
        savedConfigs: [],
        agentPersonas: [],
        selectedConfigIds: {
            proposer: '',
            opposer: '',
            judge: '',
            fact_checker: '',
        },
        selectedPersonaIds: {
            proposer: '',
            opposer: '',
            judge: '',
            fact_checker: '',
        },
        temperatureInputs: {
            proposer: '',
            opposer: '',
            judge: '',
            fact_checker: '',
        },
        enableThinking: {
            proposer: false,
            opposer: false,
            judge: false,
            fact_checker: false,
        },
        showConfigManager: false,
        setShowConfigManager: vi.fn(),
        handleConfigSelect: vi.fn(),
        handlePersonaSelect: vi.fn(),
        handleTemperatureChange: vi.fn(),
        handleThinkingToggle: vi.fn(),
        reload: vi.fn(),
        buildAgentConfigs: buildAgentConfigsMock,
        isLoading: false,
        error: null,
    }),
}));

vi.mock('../../hooks/useDebateViewState', () => ({
    useSessionViewState: () => ({
        currentSession: {
            agent_configs: {},
        },
    }),
    useSessionActions: () => ({
        updateCurrentSessionAgentConfigs: updateCurrentSessionAgentConfigsMock,
    }),
}));

vi.mock('../shared/AgentConfigPanel', () => ({
    default: ({ readOnly, manageButtonLabel }: { readOnly?: boolean; manageButtonLabel?: string }) => (
        <div data-testid="agent-config-panel" data-read-only={String(readOnly)}>
            {manageButtonLabel}
        </div>
    ),
}));

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('DebaterSettingsModal', () => {
    it('renders editable agent settings as a lightweight popover', () => {
        render(
            <DebaterSettingsModal
                isOpen
                onClose={() => {}}
                sessionId="session-1"
            />,
        );

        expect(screen.getByText('辩手设置')).toBeInTheDocument();
        expect(screen.queryByText('当前辩论参数不可在此处热更新')).not.toBeInTheDocument();
        expect(screen.getByTestId('agent-config-panel')).toHaveAttribute('data-read-only', 'undefined');
        expect(screen.getByText('保存设置')).toBeInTheDocument();
    });

    it('saves current settings for subsequent agent calls', async () => {
        updateAgentConfigsMock.mockResolvedValueOnce({
            agent_configs: {
                proposer: { provider_id: 'provider-1', model: 'model-a' },
            },
        });

        render(
            <DebaterSettingsModal
                isOpen
                onClose={() => {}}
                sessionId="session-1"
            />,
        );

        fireEvent.click(screen.getByText('保存设置'));

        await waitFor(() => {
            expect(updateAgentConfigsMock).toHaveBeenCalledWith('session-1', {
                agent_configs: {
                    proposer: { provider_id: 'provider-1', model: 'model-a' },
                },
            });
        });
        expect(updateCurrentSessionAgentConfigsMock).toHaveBeenCalledWith({
            proposer: { provider_id: 'provider-1', model: 'model-a' },
        });
    });
});
