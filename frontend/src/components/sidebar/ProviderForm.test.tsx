import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProviderForm } from './ProviderForm';

afterEach(() => {
    cleanup();
});

describe('ProviderForm', () => {
    it('does not show stored API keys in plaintext for existing providers', () => {
        render(
            <ProviderForm
                formData={{
                    name: 'Custom Provider',
                    providerType: 'openai',
                    apiKey: '',
                    apiKeyConfigured: true,
                    clearApiKey: false,
                    apiBaseUrl: 'https://example.com/v1',
                    defaultMaxTokens: '64000',
                    customParametersText: '',
                    models: ['gpt-4o'],
                    isDefault: false,
                }}
                isCreatingNew={false}
                newModelInput=""
                onFieldChange={vi.fn()}
                onAddModel={vi.fn()}
                onRemoveModel={vi.fn()}
                onNewModelInputChange={vi.fn()}
                onSave={vi.fn()}
                onClose={vi.fn()}
            />,
        );

        const apiKeyInput = screen.getByLabelText('API 密钥') as HTMLInputElement;

        expect(apiKeyInput).toHaveAttribute('type', 'password');
        expect(apiKeyInput).toHaveValue('');
        expect(apiKeyInput).toHaveAttribute('placeholder', '已配置，留空则保持不变');
        expect(screen.getByLabelText('清除已保存的 API 密钥')).toBeInTheDocument();
    });

    it('lets the user toggle explicit API key clearing', () => {
        const onFieldChange = vi.fn();

        render(
            <ProviderForm
                formData={{
                    name: 'Custom Provider',
                    providerType: 'openai',
                    apiKey: '',
                    apiKeyConfigured: true,
                    clearApiKey: false,
                    apiBaseUrl: 'https://example.com/v1',
                    defaultMaxTokens: '64000',
                    customParametersText: '',
                    models: ['gpt-4o'],
                    isDefault: false,
                }}
                isCreatingNew={false}
                newModelInput=""
                onFieldChange={onFieldChange}
                onAddModel={vi.fn()}
                onRemoveModel={vi.fn()}
                onNewModelInputChange={vi.fn()}
                onSave={vi.fn()}
                onClose={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByLabelText('清除已保存的 API 密钥'));

        expect(onFieldChange).toHaveBeenCalledWith('clearApiKey', true);
    });
});

