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
                    source_kind: 'tool_call',
                    source_role: 'proposer',
                    source_agent_name: '正方',
                },
            }),
            makeEvent({
                event_id: 'evt_2',
                seq: 2,
                source: 'runtime.node.tool_executor',
                payload: {
                    memory_type: 'memo',
                    memory: { agent_name: 'Proposer', content: 'Memo content' },
                    source_kind: 'dialogue',
                    source_timestamp: '2026-03-17T00:00:01+00:00',
                    source_role: 'proposer',
                    source_agent_name: '正方一辩',
                    source_excerpt: '原始发言',
                },
            }),
        ]);

        expect(items).toHaveLength(2);
        expect(items[0].title).toContain('事实');
        expect(items[1].title).toContain('备忘');
        expect(items[1].importance).toBeGreaterThanOrEqual(items[0].importance);
        expect(items[0].sourceKey).toBe('context');
        expect(items[1].sourceKey).toBe('tool');
        expect(items[1].sourceLabel).toBe('工具检索');
        expect(items[0].sourceSummary).toBe('来源检索：正方');
        expect(items[1].sourceTimestamp).toBe('2026-03-17T00:00:01+00:00');
        expect(items[1].sourceExcerpt).toBe('原始发言');
    });

    it('summarizes memory types', () => {
        const summary = summarizeMemoryTypes([
            {
                eventId: '1',
                seq: 1,
                timestamp: '',
                type: 'fact',
                source: '',
                sourceKey: 'runtime',
                sourceLabel: '运行时写入',
                title: '',
                content: '',
                importance: 80,
                decay: 0.4,
                agentName: '',
                memoryIndex: 0,
                totalMemories: 3,
                sourceKind: 'runtime',
                sourceTimestamp: '',
                sourceRole: '',
                sourceAgentName: '',
                sourceExcerpt: '',
                sourceSummary: '运行时写入',
            },
            {
                eventId: '2',
                seq: 2,
                timestamp: '',
                type: 'memo',
                source: '',
                sourceKey: 'runtime',
                sourceLabel: '运行时写入',
                title: '',
                content: '',
                importance: 70,
                decay: 0.5,
                agentName: '',
                memoryIndex: 1,
                totalMemories: 3,
                sourceKind: 'runtime',
                sourceTimestamp: '',
                sourceRole: '',
                sourceAgentName: '',
                sourceExcerpt: '',
                sourceSummary: '运行时写入',
            },
            {
                eventId: '3',
                seq: 3,
                timestamp: '',
                type: 'memo',
                source: '',
                sourceKey: 'runtime',
                sourceLabel: '运行时写入',
                title: '',
                content: '',
                importance: 75,
                decay: 0.3,
                agentName: '',
                memoryIndex: 2,
                totalMemories: 3,
                sourceKind: 'runtime',
                sourceTimestamp: '',
                sourceRole: '',
                sourceAgentName: '',
                sourceExcerpt: '',
                sourceSummary: '运行时写入',
            },
        ]);

        expect(summary.fact).toBe(1);
        expect(summary.memo).toBe(2);
        expect(summary.context).toBe(0);
    });
});
