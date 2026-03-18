import { describe, expect, it } from 'vitest';

import type { RuntimeEvent } from '../types';
import { buildMemoryWriteViews, summarizeMemoryTypes } from './memoryView';

function makeEvent(overrides: Partial<RuntimeEvent>): RuntimeEvent {
    return {
        schema_version: '2026-03-17',
        event_id: 'evt_default',
        session_id: 'abc123def456',
        seq: 1,
        timestamp: '2026-03-17T00:00:00+00:00',
        source: 'runtime.node.manage_context',
        type: 'memory_write',
        payload: {},
        ...overrides,
    };
}

describe('memoryView utils', () => {
    it('builds memory write cards from runtime events', () => {
        const items = buildMemoryWriteViews([
            makeEvent({
                event_id: 'evt_1',
                seq: 1,
                payload: {
                    memory_type: 'fact',
                    memory: { query: 'AI', result: 'Fact result' },
                },
            }),
            makeEvent({
                event_id: 'evt_2',
                seq: 2,
                source: 'runtime.node.tool_executor',
                payload: {
                    memory_type: 'memo',
                    memory: { agent_name: 'Proposer', content: 'Memo content' },
                },
            }),
        ]);

        expect(items).toHaveLength(2);
        expect(items[0].title).toContain('事实');
        expect(items[1].title).toContain('备忘');
        expect(items[1].importance).toBeGreaterThanOrEqual(items[0].importance);
    });

    it('summarizes memory types', () => {
        const summary = summarizeMemoryTypes([
            {
                eventId: '1',
                seq: 1,
                timestamp: '',
                type: 'fact',
                source: '',
                title: '',
                content: '',
                importance: 80,
                decay: 0.4,
            },
            {
                eventId: '2',
                seq: 2,
                timestamp: '',
                type: 'memo',
                source: '',
                title: '',
                content: '',
                importance: 70,
                decay: 0.5,
            },
            {
                eventId: '3',
                seq: 3,
                timestamp: '',
                type: 'memo',
                source: '',
                title: '',
                content: '',
                importance: 75,
                decay: 0.3,
            },
        ]);

        expect(summary.fact).toBe(1);
        expect(summary.memo).toBe(2);
        expect(summary.context).toBe(0);
    });
});
