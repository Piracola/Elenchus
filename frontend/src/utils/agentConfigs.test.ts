import { describe, expect, it } from 'vitest';

import {
    buildAgentConfigsPayload,
    DEFAULT_AGENT_TEMPERATURE,
    parseAgentTemperatureInput,
} from './agentConfigs';
import type { ModelConfig } from '../types';

const baseProvider: ModelConfig = {
    id: 'provider-openai',
    name: 'OpenAI Default',
    provider_type: 'openai',
    api_key_configured: false,
    api_base_url: 'https://api.openai.com/v1',
    default_max_tokens: 64000,
    custom_parameters: {},
    models: ['gpt-4o', 'gpt-4.1-mini'],
    is_default: true,
    created_at: '2026-03-19T00:00:00Z',
    updated_at: '2026-03-19T00:00:00Z',
};

describe('agentConfigs utils', () => {
    it('parses temperature input and clamps it into the supported range', () => {
        expect(parseAgentTemperatureInput('')).toBeUndefined();
        expect(parseAgentTemperatureInput('abc')).toBeUndefined();
        expect(parseAgentTemperatureInput('0.3')).toBe(0.3);
        expect(parseAgentTemperatureInput('-1')).toBe(0);
        expect(parseAgentTemperatureInput('4')).toBe(2);
    });

    it('includes an explicit temperature when a model is selected', () => {
        const payload = buildAgentConfigsPayload(
            [baseProvider],
            {
                proposer: 'provider-openai::gpt-4.1-mini',
                opposer: '',
                judge: '',
                fact_checker: '',
            },
            {
                proposer: '0.2',
                opposer: '',
                judge: '',
                fact_checker: '',
            },
        );

        expect(payload).toEqual({
            proposer: {
                model: 'gpt-4.1-mini',
                provider_type: 'openai',
                provider_id: 'provider-openai',
                api_base_url: 'https://api.openai.com/v1',
                temperature: 0.2,
            },
        });
    });

    it('falls back to the default provider model when only temperature is set', () => {
        const payload = buildAgentConfigsPayload(
            [baseProvider],
            {
                proposer: '',
                opposer: '',
                judge: '',
                fact_checker: '',
            },
            {
                proposer: String(DEFAULT_AGENT_TEMPERATURE),
                opposer: '',
                judge: '',
                fact_checker: '',
            },
        );

        expect(payload).toEqual({
            proposer: {
                model: 'gpt-4o',
                provider_type: 'openai',
                provider_id: 'provider-openai',
                api_base_url: 'https://api.openai.com/v1',
                temperature: DEFAULT_AGENT_TEMPERATURE,
            },
        });
    });
});
