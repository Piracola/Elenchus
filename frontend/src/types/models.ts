export interface ModelConfig {
    id: string;
    name: string;
    provider_type: string;
    api_key_configured: boolean;
    api_base_url: string | null;
    default_max_tokens: number;
    custom_parameters: Record<string, unknown>;
    models: string[];
    is_default: boolean;
    created_at: string;
    updated_at: string;
}

export interface ModelConfigCreatePayload {
    name: string;
    provider_type: string;
    api_key?: string | null;
    clear_api_key?: boolean;
    api_base_url?: string | null;
    default_max_tokens: number;
    custom_parameters?: Record<string, unknown>;
    models: string[];
    is_default?: boolean;
}

export interface ProviderFormData {
    name: string;
    providerType: string;
    apiKey: string;
    apiKeyConfigured: boolean;
    clearApiKey: boolean;
    apiBaseUrl: string;
    defaultMaxTokens: string;
    customParametersText: string;
    models: string[];
    isDefault: boolean;
    enableThinking: boolean;  // 新增：思考模式开关
}

export interface AgentConfigResult {
    model: string;
    provider_type: string;
    provider_id: string;
    api_base_url?: string;
    temperature?: number;
    max_input_tokens?: number;
    max_tokens?: number;
}
