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

export interface ModelProviderProbePayload {
    provider_type: string;
    api_key?: string | null;
    api_base_url?: string | null;
}

export interface ModelProviderProbeResult {
    ok: boolean;
    message: string;
    model_count: number;
}

export interface ModelProviderModelsResult {
    models: string[];
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
    enableThinking: boolean;
}

export interface RemoteModelCandidate {
    id: string;
    name: string;
    added: boolean;
}

export interface AgentConfigResult {
    model?: string;
    provider_type?: string;
    provider_id?: string;
    api_base_url?: string;
    temperature?: number;
    max_input_tokens?: number;
    max_tokens?: number;
    custom_parameters?: Record<string, unknown>;
    persona_id?: string;
    persona_name?: string;
    persona_filename?: string;
    custom_name?: string;
    custom_prompt?: string;
}

export interface AgentPersonaSummary {
    id: string;
    name: string;
    description: string;
    roles: string[];
    filename: string;
}

export interface AgentPersonaDetail extends AgentPersonaSummary {
    content: string;
}
