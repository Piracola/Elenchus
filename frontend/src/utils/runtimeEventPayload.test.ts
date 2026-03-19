import { describe, expect, it } from 'vitest';

import type { RuntimeEvent } from '../types';
import { payloadNumber, payloadRecord, payloadString } from './runtimeEventPayload';

function makeEvent(payload: Record<string, unknown>): RuntimeEvent {
    return {
        schema_version: '2026-03-17',
        event_id: 'evt_1',
        session_id: 'session_1',
        seq: 1,
        timestamp: '2026-03-17T00:00:00+00:00',
        source: 'runtime.test',
        type: 'status',
        payload,
    };
}

describe('runtimeEventPayload', () => {
    it('reads string payload values safely', () => {
        const event = makeEvent({ content: 'hello', turn: 2 });

        expect(payloadString(event, 'content')).toBe('hello');
        expect(payloadString(event, 'turn')).toBeUndefined();
    });

    it('reads finite numeric payload values safely', () => {
        const event = makeEvent({ turn: 2, invalid: Number.NaN });

        expect(payloadNumber(event, 'turn')).toBe(2);
        expect(payloadNumber(event, 'invalid')).toBeUndefined();
    });

    it('returns only plain record-like payload objects', () => {
        const memory = { query: 'AI' };
        const event = makeEvent({ memory, list: ['a', 'b'] });

        expect(payloadRecord(event, 'memory')).toBe(memory);
        expect(payloadRecord(event, 'list')).toBeUndefined();
    });
});
