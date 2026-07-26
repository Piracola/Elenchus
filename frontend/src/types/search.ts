export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
    source_engine: string;
}

/**
 * Provider names come from the backend registry, so this is an open string
 * rather than a closed union — the frontend must not need editing to see a
 * newly registered provider.
 */
export type SearchProviderType = string;

export interface SearchProviderStatus {
    name: SearchProviderType;
    available: boolean;
    is_primary: boolean;
    configured: boolean;
}

/** One configurable field, as declared by the provider on the backend. */
export interface SearchProviderField {
    key: string;
    label: string;
    type: 'text' | 'password';
    placeholder: string;
    helper_text: string;
    secret: boolean;
    required: boolean;
    /** Always empty for secrets — their value never leaves the backend. */
    value: string;
    /** For secrets: whether a value is stored. */
    configured: boolean;
}

export interface SearchProviderDescriptor {
    name: SearchProviderType;
    label: string;
    description: string;
    available: boolean;
    is_primary: boolean;
    configured: boolean;
    fields: SearchProviderField[];
}

export interface SearchConfig {
    provider: SearchProviderType;
    max_results_per_query: number;
    providers: SearchProviderDescriptor[];
}

export interface SearchConfigUpdatePayload {
    provider?: SearchProviderType;
    max_results_per_query?: number;
    /**
     * Only the fields to change. A field sent as `null` or `''` is cleared; an
     * omitted field keeps its stored value.
     */
    provider_settings?: Record<string, Record<string, string | null>>;
}
