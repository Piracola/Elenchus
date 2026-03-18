import { describe, expect, it } from 'vitest';

import { normalizeRuntimeEvent } from './runtimeEvents';

describe('normalizeRuntimeEvent', () => {
    it('keeps canonical envelope fields', () => {
        const event = normalizeRuntimeEvent({
            schema_version: '2026-03-17',
            event_id: 'evt_123',
            session_id: 'abc123def456',
            seq: 3,
            timestamp: '2026-03-17T00:00:00+00:00',
            source: 'runtime.node.speaker',
            type: 'speech_end',
            phase: 'speaking',
            payload: {
                role: 'proposer',
                content: 'hello',
            },
        });

        expect(event).not.toBeNull();
        expect(event?.event_id).toBe('evt_123');
        expect(event?.seq).toBe(3);
        expect(event?.payload.content).toBe('hello');
    });

    it('converts legacy flat messages into payload envelope', () => {
        const event = normalizeRuntimeEvent({
            type: 'judge_score',
            role: 'proposer',
            turn: 1,
            scores: { overall_comment: 'ok' },
        });

        expect(event).not.toBeNull();
        expect(event?.schema_version).toBe('legacy');
        expect(event?.type).toBe('judge_score');
        expect(event?.payload.role).toBe('proposer');
        expect(event?.payload.turn).toBe(1);
    });
});
