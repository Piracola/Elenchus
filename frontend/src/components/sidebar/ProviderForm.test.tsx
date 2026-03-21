import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProviderForm } from './ProviderForm';

describe('ProviderForm', () => {
    it('shows API keys in plain text so saved credentials can be copied', () => {
        render(
            <ProviderForm
                formData={{
                    name: 'Custom Provider',
                    providerType: 'openai',
                    apiKey: 'sk-live-secret',
                    apiBaseUrl: 'https://example.com/v1',
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

        const apiKeyInput = screen.getByPlaceholderText('sk-...') as HTMLInputElement;

        expect(apiKeyInput).toHaveAttribute('type', 'text');
        expect(apiKeyInput).toHaveValue('sk-live-secret');

        fireEvent.focus(apiKeyInput);

        expect(apiKeyInput.selectionStart).toBe(0);
        expect(apiKeyInput.selectionEnd).toBe(apiKeyInput.value.length);
    });
});
