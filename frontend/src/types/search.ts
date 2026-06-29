export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
    source_engine: string;
}

export type SearchProviderType = 'ddgs' | 'custom';

export interface SearchProviderStatus {
    name: SearchProviderType;
    available: boolean;
    is_primary: boolean;
}

export interface SearchProviderSettings {
    custom: {
        endpoint: string;
        api_key_configured: boolean;
    };
}

export interface SearchConfig {
    provider: SearchProviderType | string;
    available_providers: SearchProviderStatus[];
    provider_settings: SearchProviderSettings;
}

export interface SearchConfigUpdatePayload {
    provider?: SearchProviderType | string;
    provider_settings?: {
        custom?: {
            endpoint?: string | null;
            api_key?: string | null;
            clear_api_key?: boolean;
        };
    };
}
