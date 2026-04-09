import type { AgentConfigResult, ModelConfig } from '../../types';

export const AGENT_ROLES = ['proposer', 'opposer', 'judge', 'fact_checker'] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export const DEFAULT_AGENT_TEMPERATURE = 0.7;
export const MIN_AGENT_TEMPERATURE = 0;
export const MAX_AGENT_TEMPERATURE = 2;

export function createEmptyAgentFieldMap(): Record<AgentRole, string> {
    return {
        proposer: '',
        opposer: '',
        judge: '',
        fact_checker: '',
    };
}

export function createEmptyThinkingMap(): Record<AgentRole, boolean> {
    return {
        proposer: false,
        opposer: false,
        judge: false,
        fact_checker: false,
    };
}

export function parseAgentTemperatureInput(input: string): number | undefined {
    const trimmed = input.trim();
    if (!trimmed) {
        return undefined;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
        return undefined;
    }

    return Math.min(MAX_AGENT_TEMPERATURE, Math.max(MIN_AGENT_TEMPERATURE, parsed));
}

function splitSelectedConfigKey(selectedKey: string): { providerId: string; model: string } {
    const separatorIndex = selectedKey.indexOf('::');
    if (separatorIndex === -1) {
        return {
            providerId: selectedKey,
            model: '',
        };
    }

    return {
        providerId: selectedKey.slice(0, separatorIndex),
        model: selectedKey.slice(separatorIndex + 2),
    };
}

export function buildAgentConfigsPayload(
    savedConfigs: ModelConfig[],
    selectedConfigIds: Record<string, string>,
    temperatureInputs: Record<string, string>,
    enableThinkingInputs?: Record<string, boolean>,
): Record<string, AgentConfigResult> | undefined {
    const result: Record<string, AgentConfigResult> = {};
    const defaultProvider = savedConfigs.find(
        (config) => config.is_default && (config.models?.length ?? 0) > 0,
    );

    for (const role of AGENT_ROLES) {
        const selectedKey = selectedConfigIds[role] ?? '';
        const temperature = parseAgentTemperatureInput(temperatureInputs[role] ?? '');
        const enableThinking = enableThinkingInputs?.[role] ?? false;

        if (!selectedKey && temperature === undefined && !enableThinking) {
            continue;
        }

        let configDef: ModelConfig | undefined;
        let model = '';

        if (selectedKey) {
            const { providerId, model: selectedModel } = splitSelectedConfigKey(selectedKey);
            configDef = savedConfigs.find((config) => config.id === providerId);
            model = selectedModel;
        } else {
            configDef = defaultProvider;
            model = defaultProvider?.models?.[0] ?? '';
        }

        if (!configDef || !model) {
            continue;
        }

        result[role] = {
            model,
            provider_type: configDef.provider_type,
            provider_id: configDef.id,
            api_base_url: configDef.api_base_url || undefined,
            ...(temperature !== undefined ? { temperature } : {}),
            ...(enableThinking ? { enable_thinking: true } : {}),
            ...(configDef.custom_parameters && Object.keys(configDef.custom_parameters).length > 0
                ? { custom_parameters: configDef.custom_parameters }
                : {}),
        };
    }

    return Object.keys(result).length > 0 ? result : undefined;
}
