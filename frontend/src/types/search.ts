export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
    source_engine: string;
}

export type SearchProviderType = 'duckduckgo' | 'searxng' | 'tavily';

export interface SearchProviderStatus {
    name: SearchProviderType;
    available: boolean;
    is_primary: boolean;
}

export interface SearchProviderSettings {
    searxng: {
        base_url: string;
        api_key_configured: boolean;
    };
    tavily: {
        api_url: string;
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
        searxng?: {
            base_url?: string | null;
            api_key?: string | null;
            clear_api_key?: boolean;
        };
        tavily?: {
            api_url?: string | null;
            api_key?: string | null;
            clear_api_key?: boolean;
        };
    };
}
