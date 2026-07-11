import type { AgentConfig, AgentConfigResult, ModelConfig } from '../../types';

export const AGENT_ROLES = ['proposer', 'opposer', 'judge', 'fact_checker', 'group_discussion'] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export const DEFAULT_AGENT_TEMPERATURE = 0.7;
export const MIN_AGENT_TEMPERATURE = 0;
export const MAX_AGENT_TEMPERATURE = 2;
export const DEFAULT_MODEL_CONFIG_VALUE = '';

export interface ModelConfigSelectOption {
    value: string;
    label: string;
}

export function createEmptyAgentFieldMap(): Record<AgentRole, string> {
    return {
        proposer: '',
        opposer: '',
        judge: '',
        fact_checker: '',
        group_discussion: '',
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

export function buildModelConfigOptions(savedConfigs: ModelConfig[]): ModelConfigSelectOption[] {
    const options: ModelConfigSelectOption[] = [
        { value: DEFAULT_MODEL_CONFIG_VALUE, label: '默认配置' },
    ];

    savedConfigs.forEach((config) => {
        config.models?.forEach((model) => {
            options.push({
                value: `${config.id}::${model}`,
                label: `${config.is_default ? '⭐ ' : ''}${config.name} — ${model}`,
            });
        });
    });

    return options;
}

export function splitSelectedConfigKey(selectedKey: string): { providerId: string; model: string } {
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

export function buildSelectedConfigKey(
    savedConfigs: ModelConfig[],
    selection: {
        providerId?: string | null;
        model?: string | null;
    },
): string {
    const providerId = selection.providerId?.trim() ?? '';
    if (!providerId) {
        return DEFAULT_MODEL_CONFIG_VALUE;
    }

    const provider = savedConfigs.find((config) => config.id === providerId);
    if (!provider) {
        return DEFAULT_MODEL_CONFIG_VALUE;
    }

    const model = selection.model?.trim() || provider.models?.[0] || '';
    if (!model) {
        return DEFAULT_MODEL_CONFIG_VALUE;
    }

    return `${providerId}::${model}`;
}

export function buildAgentConfigsPayload(
    savedConfigs: ModelConfig[],
    selectedConfigIds: Record<string, string>,
    temperatureInputs: Record<string, string>,
): Record<string, AgentConfigResult> | undefined {
    const result: Record<string, AgentConfigResult> = {};
    const defaultProvider = savedConfigs.find(
        (config) => config.is_default && (config.models?.length ?? 0) > 0,
    );

    for (const role of AGENT_ROLES) {
        const selectedKey = selectedConfigIds[role] ?? '';
        const temperature = parseAgentTemperatureInput(temperatureInputs[role] ?? '');

        if (!selectedKey && temperature === undefined) {
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
            ...(model ? { model } : {}),
            ...(configDef ? {
                provider_type: configDef.provider_type,
                provider_id: configDef.id,
                api_base_url: configDef.api_base_url || undefined,
            } : {}),
            ...(temperature !== undefined ? { temperature } : {}),
            ...(configDef?.custom_parameters && Object.keys(configDef.custom_parameters).length > 0
                ? { custom_parameters: configDef.custom_parameters }
                : {}),
        };
    }

    return Object.keys(result).length > 0 ? result : undefined;
}

export function buildAgentConfigFormState(
    savedConfigs: ModelConfig[],
    agentConfigs: Record<string, AgentConfig> | undefined | null,
): {
    selectedConfigIds: Record<AgentRole, string>;
    temperatureInputs: Record<AgentRole, string>;
} {
    const selectedConfigIds = createEmptyAgentFieldMap();
    const temperatureInputs = createEmptyAgentFieldMap();

    for (const role of AGENT_ROLES) {
        const config = agentConfigs?.[role];
        if (!config) continue;

        selectedConfigIds[role] = buildSelectedConfigKey(savedConfigs, {
            providerId: config.provider_id,
            model: config.model,
        });
        if (typeof config.temperature === 'number' && Number.isFinite(config.temperature)) {
            temperatureInputs[role] = String(config.temperature);
        }
    }

    return { selectedConfigIds, temperatureInputs };
}
