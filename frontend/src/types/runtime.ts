import type { SearchResult } from './search';
import type { TurnScore } from './scoring';

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
    | 'mode_notice'
    | 'status'
    | 'team_discussion'
    | 'team_summary'
    | 'jury_discussion'
    | 'jury_summary'
    | 'consensus_summary'
    | 'sophistry_round_report'
    | 'sophistry_final_report'
    | 'speech_start'
    | 'speech_token'
    | 'speech_cancel'
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
    content?: string;
    phase?: DebatePhase;
    node?: string;
    role?: string;
    agent_name?: string;
    token?: string;
    citations?: string[];
    results?: SearchResult[];
    count?: number;
    memory_type?: string;
    memory?: Record<string, unknown>;
    memory_index?: number;
    total_memories?: number;
    scores?: TurnScore;
    turn?: number;
    current_scores?: Record<string, TurnScore>;
    cumulative_scores?: Record<string, Record<string, number[]>>;
    final_scores?: Record<string, Record<string, number[]>>;
    total_turns?: number;
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
