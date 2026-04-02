import type { RuntimeEvent } from '../types';

export function makeRuntimeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
    return {
        schema_version: '2026-03-17',
        event_id: 'evt-default',
        session_id: 'session-1',
        seq: 1,
        timestamp: '2026-03-17T00:00:00Z',
        source: 'runtime.test',
        type: 'status',
        payload: {},
        ...overrides,
    };
}
