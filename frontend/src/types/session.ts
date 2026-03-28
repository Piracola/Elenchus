import type { TurnScore } from './scoring';

export type SessionStatus = 'pending' | 'in_progress' | 'completed' | 'error';
export type DebateMode = 'standard' | 'sophistry_experiment';
export type DocumentStatus = 'uploaded' | 'processing' | 'processed' | 'failed';
export type ReferenceEntryType =
    | 'reference_summary'
    | 'reference_term'
    | 'reference_claim'
    | 'reference_excerpt'
    | 'reference_validation';

export interface TeamConfig {
    agents_per_team: number;
    discussion_rounds: number;
}

export interface JuryConfig {
    agents_per_jury: number;
    discussion_rounds: number;
}

export interface ReasoningConfig {
    steelman_enabled: boolean;
    counterfactual_enabled: boolean;
    consensus_enabled: boolean;
}

export interface ModeArtifact {
    type: string;
    title?: string;
    turn?: number;
    content: string;
    created_at?: string;
}

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
    discussion_kind?: string;
    team_side?: string;
    team_round?: number;
    team_member_index?: number;
    team_specialty?: string;
    jury_round?: number;
    jury_member_index?: number;
    jury_perspective?: string;
    source_role?: string;
}

export interface AgentConfig {
    model?: string;
    provider_type?: string;
    provider_id?: string;
    api_base_url?: string;
    temperature?: number;
}

export interface Session {
    id: string;
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
    team_dialogue_history: DialogueEntry[];
    jury_dialogue_history: DialogueEntry[];
    shared_knowledge?: Record<string, unknown>[];
    current_scores: Record<string, TurnScore>;
    cumulative_scores: Record<string, Record<string, number[]>>;
    agent_configs?: Record<string, AgentConfig>;
    team_config: TeamConfig;
    jury_config: JuryConfig;
    reasoning_config: ReasoningConfig;
    mode_artifacts: ModeArtifact[];
    current_mode_report?: ModeArtifact | Record<string, unknown> | null;
    final_mode_report?: ModeArtifact | Record<string, unknown> | null;
}

export interface SessionListItem {
    id: string;
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
    team_config?: TeamConfig;
    jury_config?: JuryConfig;
    reasoning_config?: ReasoningConfig;
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

export interface ReferenceLibraryEntry {
    id: string;
    session_id: string;
    document_id: string;
    entry_type: ReferenceEntryType;
    title: string | null;
    content: string;
    payload: Record<string, unknown>;
    importance: number;
    source_section: string | null;
    source_order: number;
    created_at: string;
    updated_at: string;
}

export interface ReferenceLibraryResponse {
    documents: SessionDocumentListItem[];
    entries: ReferenceLibraryEntry[];
}
