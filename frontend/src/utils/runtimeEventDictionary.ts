export type RuntimeEventGroup = 'status' | 'speech' | 'judge' | 'tool' | 'memory' | 'system' | 'error';

export function getRuntimeEventGroup(type: string): RuntimeEventGroup {
    if (
        type === 'team_discussion'
        || type === 'team_summary'
        || type === 'jury_discussion'
        || type === 'jury_summary'
        || type === 'consensus_summary'
    ) return 'speech';
    if (type.startsWith('speech_')) return 'speech';
    if (type.startsWith('fact_check')) return 'tool';
    if (type.startsWith('memory_')) return 'memory';
    if (type === 'judge_score' || type === 'judge_start') return 'judge';
    if (type === 'status' || type === 'turn_complete' || type === 'debate_complete') return 'status';
    if (type === 'system' || type === 'audience_message' || type === 'pong') return 'system';
    if (type === 'error') return 'error';
    return 'status';
}

export function getRuntimeEventNodeHint(type: string): string | null {
    if (type === 'team_discussion' || type === 'team_summary') return 'team_discussion';
    if (type === 'jury_discussion' || type === 'jury_summary') return 'jury_discussion';
    if (type === 'consensus_summary') return 'consensus';
    if (type.startsWith('speech_')) return 'speaker';
    if (type.startsWith('fact_check')) return 'tool_executor';
    if (type.startsWith('memory_')) return 'manage_context';
    if (type === 'judge_start' || type === 'judge_score') return 'judge';
    if (type === 'turn_complete') return 'advance_turn';
    if (type === 'debate_complete') return 'end';
    return null;
}
