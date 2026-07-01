import { describe, expect, it } from 'vitest';

import { normalizeRuntimeEvent } from './runtimeEvents';

describe('normalizeRuntimeEvent', () => {
    it('keeps canonical envelope fields', () => {
        const event = normalizeRuntimeEvent({
            schema_version: '2026-03-17',
            event_id: 'evt_123',
            run_id: 'run123def456',
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

    it('rejects canonical envelopes without run_id', () => {
        const event = normalizeRuntimeEvent({
            schema_version: '2026-03-17',
            event_id: 'evt_missing_run',
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

        expect(event).toBeNull();
    });

    it('does not treat legacy session_id as run_id', () => {
        const event = normalizeRuntimeEvent({
            type: 'status',
            session_id: 'session123456',
            content: 'legacy status',
        });

        expect(event).toBeNull();
    });

    it('converts legacy flat messages into payload envelope', () => {
        const event = normalizeRuntimeEvent({
            type: 'judge_score',
            run_id: 'run123def456',
            session_id: 'session123456',
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
