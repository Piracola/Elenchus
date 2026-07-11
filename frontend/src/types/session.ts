import type { TurnScore } from './scoring';

export type SessionStatus = 'pending' | 'in_progress' | 'completed' | 'error';
export type RunStatus =
    | 'pending'
    | 'initializing'
    | 'running'
    | 'retrying'
    | 'recovering'
    | 'stopping'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'stalled';
export type RunCommandType = 'stop' | 'resume' | 'intervene';
export type DebateMode = 'standard' | 'sophistry_experiment';
export type DocumentStatus = 'uploaded' | 'processing' | 'processed' | 'failed';

export interface ReasoningConfig {
    consensus_enabled: boolean;
    group_discussion_rounds: number;
}

export interface SpeechConfig {
    proposer_max_chars: number;
    opposer_max_chars: number;
    group_discussion_max_chars: number;
}

export interface ContextRuntimeConfig {
    context_injection_mode: 'auto' | 'lean' | 'standard' | 'deep' | 'custom';
    recent_turns_to_include: number;
    evidence_items_per_agent: number;
    exact_recent_entries_per_agent: number;
    planning_entries_per_agent: number;
    long_term_memory_entries_per_agent: number;
    use_low_cost_context_model: boolean;
    low_cost_model_provider_id: string | null;
    low_cost_model_id: string | null;
}

export interface ModeArtifact {
    type: string;
    title?: string;
    turn?: number;
    source_turn?: number;
    source_roles?: string[];
    content: string;
    created_at?: string;
}

export interface UnsupportedRequestParametersNotice {
    provider: string;
    unsupported_parameters: string[];
    message: string;
}

export interface DialogueEntryMetadata {
    unsupported_request_parameters?: UnsupportedRequestParametersNotice;
}

export interface DialogueEntry {
    role: string;
    agent_name: string;
    content: string;
    citations: string[];
    timestamp: string;
    metadata?: DialogueEntryMetadata;
    event_id?: string;
    turn?: number;
    source_turn?: number;
    source_roles?: string[];
    target_role?: string;
    scores?: TurnScore;
    discussion_kind?: string;
    discussion_round?: number;
}

export interface AgentConfig {
    model?: string;
    provider_type?: string;
    provider_id?: string;
    api_base_url?: string;
    temperature?: number;
    custom_name?: string;
    custom_prompt?: string;
}

export interface Session {
    id: string;
    latest_run_id?: string | null;
    topic: string;
    debate_mode: DebateMode;
    mode_config: Record<string, unknown>;
    participants: string[];
    max_turns: number;
    current_turn: number;
    status: SessionStatus;
    created_at: string;
    updated_at: string;
    dialogue_history: DialogueEntry[];
    shared_knowledge?: Record<string, unknown>[];
    current_scores: Record<string, TurnScore>;
    cumulative_scores: Record<string, Record<string, number[]>>;
    agent_configs?: Record<string, AgentConfig>;
    reasoning_config: ReasoningConfig;
    speech_config?: SpeechConfig;
    mode_artifacts: ModeArtifact[];
    current_mode_report?: ModeArtifact | Record<string, unknown> | null;
    final_mode_report?: ModeArtifact | Record<string, unknown> | null;
}

export interface SessionListItem {
    id: string;
    latest_run_id?: string | null;
    topic: string;
    debate_mode: DebateMode;
    status: SessionStatus;
    current_turn: number;
    max_turns: number;
    created_at: string;
}

export interface SessionCreatePayload {
    topic: string;
    debate_mode?: DebateMode;
    mode_config?: Record<string, unknown>;
    participants?: string[];
    max_turns?: number;
    agent_configs?: Record<string, AgentConfig>;
    reasoning_config?: ReasoningConfig;
    speech_config?: SpeechConfig;
}

export interface RecentDebateConfig {
    id: string;
    source_session_id?: string | null;
    debate_mode: DebateMode;
    participants: string[];
    max_turns: number;
    mode_config: Record<string, unknown>;
    agent_configs?: Record<string, AgentConfig>;
    reasoning_config: ReasoningConfig;
    speech_config: SpeechConfig;
    created_at: string;
    updated_at: string;
}

export interface RunSummary {
    id: string;
    session_id: string;
    status: RunStatus;
    current_turn: number;
    latest_seq: number;
    last_status_message: string;
    last_error_message?: string | null;
    started_at?: string | null;
    completed_at?: string | null;
    interrupted_at?: string | null;
    last_progress_at?: string | null;
    created_at: string;
    updated_at: string;
}

export interface RunProjectionResponse {
    run: RunSummary;
    session: Session;
    projection: Record<string, unknown>;
}

export interface RunCommandAck {
    accepted: boolean;
    run_id: string;
    command_type: RunCommandType;
    message?: string | null;
}

export interface RuntimeSettings {
    debate: {
        context_runtime: ContextRuntimeConfig;
    };
}

export interface SessionAgentConfigsUpdatePayload {
    agent_configs?: Record<string, AgentConfig>;
}

export interface SessionDocumentListItem {
    id: string;
    session_id: string;
    filename: string;
    mime_type: string;
    size_bytes: number;
    status: DocumentStatus;
    summary_short: string | null;
    error_message: string | null;
    created_at: string;
    updated_at: string;
}

export interface SessionDocumentResponse extends SessionDocumentListItem {
    raw_text?: string | null;
    normalized_text?: string | null;
}

export interface SessionDocumentsResponse {
    documents: SessionDocumentListItem[];
}
