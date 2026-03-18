/**
 * Type definitions for Elenchus frontend.
 * Mirrors the backend Pydantic schemas exactly.
 */

// ── Settings ─────────────────────────────────────────────────────

export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export interface DisplaySettings {
  messageWidth: 'narrow' | 'medium' | 'wide' | 'full';
}

// ── Scoring ─────────────────────────────────────────────────────

export interface DimensionScore {
    score: number;
    rationale: string;
}

export interface TurnScore {
    logical_rigor: DimensionScore;
    evidence_quality: DimensionScore;
    rebuttal_strength: DimensionScore;
    consistency: DimensionScore;
    persuasiveness: DimensionScore;
    overall_comment: string;
}

export const SCORE_DIMENSIONS: { key: keyof Omit<TurnScore, 'overall_comment'>; label: string; icon: string; max: number }[] = [
    { key: 'logical_rigor', label: '逻辑严密度', icon: '🧠', max: 10 },
    { key: 'evidence_quality', label: '证据质量', icon: '📊', max: 10 },
    { key: 'rebuttal_strength', label: '反驳力度', icon: '⚡', max: 10 },
    { key: 'consistency', label: '前后自洽', icon: '🔗', max: 10 },
    { key: 'persuasiveness', label: '说服力', icon: '🎯', max: 10 },
];

// ── Debate ──────────────────────────────────────────────────────

export interface DialogueEntry {
    role: string;
    agent_name: string;
    content: string;
    citations: string[];
    timestamp: string;
    event_id?: string;
    turn?: number;
    target_role?: string;
    scores?: TurnScore;
}

export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
    source_engine: string;
}

// ── Session ─────────────────────────────────────────────────────

export type SessionStatus = 'pending' | 'in_progress' | 'completed' | 'error';

export interface Session {
    id: string;
    topic: string;
    participants: string[];
    max_turns: number;
    current_turn: number;
    status: SessionStatus;
    created_at: string;
    updated_at: string;
    dialogue_history: DialogueEntry[];
    current_scores: Record<string, TurnScore>;
    cumulative_scores: Record<string, Record<string, number[]>>;
    agent_configs?: Record<string, AgentConfig>;
}

export interface AgentConfig {
    model?: string;
    provider_type?: string;
    api_base_url?: string;
}

export interface SessionListItem {
    id: string;
    topic: string;
    status: SessionStatus;
    current_turn: number;
    max_turns: number;
    created_at: string;
}

export interface SessionCreatePayload {
    topic: string;
    participants?: string[];
    max_turns?: number;
    agent_configs?: Record<string, AgentConfig>;
}

// ── Model Configurations ──────────────────────────────────────────

export interface ModelConfig {
    id: string;
    name: string;
    provider_type: string;
    api_key: string | null;
    api_base_url: string | null;
    models: string[];
    is_default: boolean;
    created_at: string;
    updated_at: string;
}

export interface ModelConfigCreatePayload {
    name: string;
    provider_type: string;
    api_key?: string | null;
    api_base_url?: string | null;
    models: string[];
    is_default?: boolean;
}

// ── Form Data Types ────────────────────────────────────────────────

export interface ProviderFormData {
    name: string;
    providerType: string;
    apiKey: string;
    apiBaseUrl: string;
    models: string[];
    isDefault: boolean;
}

/**
 * Agent configuration result for API payload.
 * Derived from ModelConfig with selected model information.
 */
export interface AgentConfigResult {
    model: string;
    provider_type: string;
    provider_id: string;
    api_base_url?: string;
}

// ── WebSocket messages ──────────────────────────────────────────

export type DebatePhase =
    | 'idle'
    | 'initializing'
    | 'context'
    | 'preparing'
    | 'speaking'
    | 'fact_checking'
    | 'judging'
    | 'advancing'
    | 'processing'
    | 'complete'
    | 'error';

export type WSMessageType =
    | 'system'
    | 'status'
    | 'speech_start'
    | 'speech_token'
    | 'speech_end'
    | 'fact_check_start'
    | 'fact_check_result'
    | 'memory_write'
    | 'judge_start'
    | 'judge_score'
    | 'turn_complete'
    | 'debate_complete'
    | 'audience_message'
    | 'error'
    | 'pong';

export interface WSMessage {
    type: WSMessageType | string;
    // system / status / error
    content?: string;
    phase?: DebatePhase;
    node?: string;
    // speech
    role?: string;
    agent_name?: string;
    token?: string;
    citations?: string[];
    // fact_check
    results?: SearchResult[];
    count?: number;
    // memory
    memory_type?: string;
    memory?: Record<string, unknown>;
    memory_index?: number;
    total_memories?: number;
    // judge_score
    scores?: TurnScore;
    // turn_complete
    turn?: number;
    current_scores?: Record<string, TurnScore>;
    cumulative_scores?: Record<string, Record<string, number[]>>;
    // debate_complete
    final_scores?: Record<string, Record<string, number[]>>;
    total_turns?: number;
    // audience_message
    timestamp?: string;
}

export interface RuntimeEvent {
    schema_version: string;
    event_id: string;
    session_id: string;
    seq: number;
    timestamp: string;
    source: string;
    type: WSMessageType | string;
    phase?: DebatePhase;
    payload: Record<string, unknown>;
}

export interface RuntimeEventPage {
    events: RuntimeEvent[];
    total: number;
    limit: number;
    has_more: boolean;
    next_before_seq: number | null;
}
