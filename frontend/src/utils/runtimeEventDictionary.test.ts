import { describe, expect, it } from 'vitest';

import {
    getRuntimeEventGroup,
    getRuntimeEventNodeHint,
} from './runtimeEventDictionary';

describe('runtimeEventDictionary', () => {
    it('maps event types to timeline groups', () => {
        expect(getRuntimeEventGroup('speech_end')).toBe('speech');
        expect(getRuntimeEventGroup('team_discussion')).toBe('speech');
        expect(getRuntimeEventGroup('jury_summary')).toBe('speech');
        expect(getRuntimeEventGroup('consensus_summary')).toBe('speech');
        expect(getRuntimeEventGroup('judge_score')).toBe('judge');
        expect(getRuntimeEventGroup('fact_check_result')).toBe('tool');
        expect(getRuntimeEventGroup('memory_write')).toBe('memory');
        expect(getRuntimeEventGroup('error')).toBe('error');
        expect(getRuntimeEventGroup('custom_event')).toBe('status');
    });

    it('maps event types to graph node hints', () => {
        expect(getRuntimeEventNodeHint('speech_start')).toBe('speaker');
        expect(getRuntimeEventNodeHint('team_summary')).toBe('team_discussion');
        expect(getRuntimeEventNodeHint('jury_discussion')).toBe('jury_discussion');
        expect(getRuntimeEventNodeHint('consensus_summary')).toBe('consensus');
        expect(getRuntimeEventNodeHint('judge_start')).toBe('judge');
        expect(getRuntimeEventNodeHint('memory_write')).toBe('manage_context');
        expect(getRuntimeEventNodeHint('turn_complete')).toBe('advance_turn');
        expect(getRuntimeEventNodeHint('debate_complete')).toBe('end');
        expect(getRuntimeEventNodeHint('system')).toBeNull();
    });
});
