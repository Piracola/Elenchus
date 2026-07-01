import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SettingsContextTab } from './SettingsContextTab';
import type { ContextRuntimeConfig } from '../../../types/session';

const getRuntimeMock = vi.fn();
const updateRuntimeMock = vi.fn();

vi.mock('../../../api/client', () => ({
    api: {
        settings: {
            getRuntime: (...args: unknown[]) => getRuntimeMock(...args),
            updateRuntime: (...args: unknown[]) => updateRuntimeMock(...args),
        },
    },
}));

vi.mock('../../shared/CustomSelect', () => ({
    default: ({
        value,
        options,
        onChange,
    }: {
        value: string;
        options: Array<{ value: string; label: string }>;
        onChange: (value: string) => void;
    }) => (
        <select
            aria-label="上下文模型"
            value={value}
            onChange={(event) => onChange(event.target.value)}
        >
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    ),
}));

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('SettingsContextTab', () => {
    it('saves the selected context model config', async () => {
        getRuntimeMock.mockResolvedValueOnce({
            debate: {
                context_runtime: {
                    context_injection_mode: 'standard',
                    recent_turns_to_include: 2,
                    evidence_items_per_agent: 4,
                    exact_recent_entries_per_agent: 4,
                    planning_entries_per_agent: 2,
                    long_term_memory_entries_per_agent: 4,
                    use_low_cost_context_model: true,
                    low_cost_model_provider_id: 'provider-1',
                    low_cost_model_id: 'gpt-4o-mini',
                },
            },
        });

        updateRuntimeMock.mockResolvedValueOnce({
            debate: {
                context_runtime: {
                    context_injection_mode: 'deep',
                    recent_turns_to_include: 2,
                    evidence_items_per_agent: 4,
                    exact_recent_entries_per_agent: 4,
                    planning_entries_per_agent: 2,
                    long_term_memory_entries_per_agent: 4,
                    use_low_cost_context_model: true,
                    low_cost_model_provider_id: 'provider-2',
                    low_cost_model_id: 'deepseek-v4-flash',
                },
            },
        });

        function Harness() {
            const [contextRuntime, setContextRuntime] = React.useState<ContextRuntimeConfig>({
                context_injection_mode: 'standard',
                recent_turns_to_include: 2,
                evidence_items_per_agent: 4,
                exact_recent_entries_per_agent: 4,
                planning_entries_per_agent: 2,
                long_term_memory_entries_per_agent: 4,
                use_low_cost_context_model: true,
                low_cost_model_provider_id: 'provider-1',
                low_cost_model_id: 'gpt-4o-mini',
            });

            return (
                <SettingsContextTab
                    providers={[
                        {
                            id: 'provider-1',
                            name: 'Provider A',
                            provider_type: 'openai',
                            api_key_configured: true,
                            api_base_url: null,
                            default_max_tokens: 64000,
                            custom_parameters: {},
                            models: ['gpt-4o-mini'],
                            is_default: true,
                            created_at: '2026-06-29T00:00:00Z',
                            updated_at: '2026-06-29T00:00:00Z',
                        },
                        {
                            id: 'provider-2',
                            name: 'Provider B',
                            provider_type: 'openai',
                            api_key_configured: true,
                            api_base_url: null,
                            default_max_tokens: 64000,
                            custom_parameters: {},
                            models: ['deepseek-v4-flash'],
                            is_default: false,
                            created_at: '2026-06-29T00:00:00Z',
                            updated_at: '2026-06-29T00:00:00Z',
                        },
                    ]}
                    contextRuntime={contextRuntime}
                    setContextRuntime={(patch) => {
                        setContextRuntime((state) => ({ ...state, ...patch }));
                    }}
                />
            );
        }

        render(
            <Harness />,
        );

        await waitFor(() => {
            expect(getRuntimeMock).toHaveBeenCalled();
        });

        fireEvent.change(screen.getByLabelText('上下文模型'), {
            target: { value: 'provider-2::deepseek-v4-flash' },
        });
        fireEvent.click(screen.getByText('保存上下文设置'));

        await waitFor(() => {
            expect(updateRuntimeMock).toHaveBeenCalledWith({
                debate: {
                    context_runtime: expect.objectContaining({
                        context_injection_mode: 'standard',
                        low_cost_model_id: 'deepseek-v4-flash',
                        low_cost_model_provider_id: 'provider-2',
                    }),
                },
            });
        });
    });

    it('switches context mode to deep and saves the preset values', async () => {
        getRuntimeMock.mockResolvedValueOnce({
            debate: {
                context_runtime: {
                    context_injection_mode: 'auto',
                    recent_turns_to_include: 2,
                    evidence_items_per_agent: 4,
                    exact_recent_entries_per_agent: 4,
                    planning_entries_per_agent: 2,
                    long_term_memory_entries_per_agent: 4,
                    use_low_cost_context_model: true,
                    low_cost_model_provider_id: null,
                    low_cost_model_id: null,
                },
            },
        });

        updateRuntimeMock.mockResolvedValueOnce({
            debate: {
                context_runtime: {
                    context_injection_mode: 'deep',
                    recent_turns_to_include: 4,
                    evidence_items_per_agent: 8,
                    exact_recent_entries_per_agent: 8,
                    planning_entries_per_agent: 4,
                    long_term_memory_entries_per_agent: 8,
                    use_low_cost_context_model: true,
                    low_cost_model_provider_id: null,
                    low_cost_model_id: null,
                },
            },
        });

        function Harness() {
            const [contextRuntime, setContextRuntime] = React.useState<ContextRuntimeConfig>({
                context_injection_mode: 'auto',
                recent_turns_to_include: 2,
                evidence_items_per_agent: 4,
                exact_recent_entries_per_agent: 4,
                planning_entries_per_agent: 2,
                long_term_memory_entries_per_agent: 4,
                use_low_cost_context_model: true,
                low_cost_model_provider_id: null,
                low_cost_model_id: null,
            });

            return (
                <SettingsContextTab
                    providers={[]}
                    contextRuntime={contextRuntime}
                    setContextRuntime={(patch) => {
                        setContextRuntime((state) => ({ ...state, ...patch }));
                    }}
                />
            );
        }

        render(<Harness />);

        await waitFor(() => {
            expect(getRuntimeMock).toHaveBeenCalled();
        });

        fireEvent.click(screen.getAllByRole('button', { name: /深入/ })[0]);
        fireEvent.click(screen.getByText('保存上下文设置'));

        await waitFor(() => {
            expect(updateRuntimeMock).toHaveBeenCalledWith({
                debate: {
                    context_runtime: expect.objectContaining({
                        context_injection_mode: 'deep',
                        recent_turns_to_include: 4,
                        evidence_items_per_agent: 8,
                        exact_recent_entries_per_agent: 8,
                        planning_entries_per_agent: 4,
                        long_term_memory_entries_per_agent: 8,
                    }),
                },
            });
        });
    });
});
