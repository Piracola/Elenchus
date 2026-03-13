/**
 * Type definitions for Elenchus frontend.
 * Mirrors the backend Pydantic schemas exactly.
 */

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

export const SCORE_DIMENSIONS: { key: keyof Omit<TurnScore, 'overall_comment'>; label: string; icon: string }[] = [
    { key: 'logical_rigor', label: '逻辑严密度', icon: '🧠' },
    { key: 'evidence_quality', label: '证据质量', icon: '📊' },
    { key: 'rebuttal_strength', label: '反驳力度', icon: '⚡' },
    { key: 'consistency', label: '前后自洽', icon: '🔗' },
    { key: 'persuasiveness', label: '说服力', icon: '🎯' },
];

// ── Debate ──────────────────────────────────────────────────────

export interface DialogueEntry {
    role: string;
    agent_name: string;
    content: string;
    citations: string[];
    timestamp: string;
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
    api_key?: string;
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
    | 'judge_start'
    | 'judge_score'
    | 'turn_complete'
    | 'debate_complete'
    | 'error'
    | 'pong';

export interface WSMessage {
    type: WSMessageType;
    // system / status / error
    content?: string;
    phase?: DebatePhase;
    node?: string;
    // speech
    role?: string;
    token?: string;
    citations?: string[];
    // fact_check
    results?: SearchResult[];
    count?: number;
    // judge_score
    scores?: TurnScore;
    // turn_complete
    turn?: number;
    current_scores?: Record<string, TurnScore>;
    cumulative_scores?: Record<string, Record<string, number[]>>;
    // debate_complete
    final_scores?: Record<string, Record<string, number[]>>;
    total_turns?: number;
}
