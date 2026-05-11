import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import DebaterSettingsModal from './DebaterSettingsModal';

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
}));

vi.mock('../shared/AgentConfigPanel', () => ({
    default: ({ readOnly, manageButtonLabel }: { readOnly?: boolean; manageButtonLabel?: string }) => (
        <div data-testid="agent-config-panel" data-read-only={String(readOnly)}>
            {manageButtonLabel}
        </div>
    ),
}));

describe('DebaterSettingsModal', () => {
    it('renders the in-debate settings panel as read-only guidance', () => {
        render(
            <DebaterSettingsModal
                isOpen
                onClose={() => {}}
                sessionId="session-1"
            />,
        );

        expect(screen.getByText('本次会话模型配置')).toBeInTheDocument();
        expect(screen.getByText('当前辩论参数不可在此处热更新')).toBeInTheDocument();
        expect(screen.getByTestId('agent-config-panel')).toHaveAttribute('data-read-only', 'true');
        expect(screen.getByText('管理配置并刷新')).toBeInTheDocument();
    });
});
