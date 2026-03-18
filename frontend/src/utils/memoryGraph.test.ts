import { describe, expect, it } from 'vitest';

import { buildMemoryGraph } from './memoryGraph';
import type { MemoryWriteView } from './memoryView';

function makeWrite(overrides: Partial<MemoryWriteView>): MemoryWriteView {
    return {
        eventId: 'evt_default',
        seq: 1,
        timestamp: '2026-03-18T00:00:00Z',
        type: 'memo',
        source: 'runtime.node.manage_context',
        sourceKey: 'context',
        sourceLabel: '上下文整理',
        title: '备忘：默认条目',
        content: '默认内容',
        importance: 72,
        decay: 0.5,
        agentName: 'Proposer',
        memoryIndex: 0,
        totalMemories: 1,
        sourceKind: 'dialogue',
        sourceTimestamp: '2026-03-18T00:00:00Z',
        sourceRole: 'proposer',
        sourceAgentName: 'Proposer',
        sourceExcerpt: '默认发言片段',
        sourceSummary: '来源发言：Proposer',
        ...overrides,
    };
}

describe('memoryGraph utils', () => {
    it('builds graph nodes and relationship edges for recent writes', () => {
        const graph = buildMemoryGraph([
            makeWrite({
                eventId: 'evt_1',
                seq: 3,
                type: 'fact',
                source: 'runtime.node.tool_executor',
                sourceKey: 'tool',
                sourceLabel: '工具检索',
                title: '事实：AI',
                content: 'Fact',
                agentName: '',
                memoryIndex: 0,
                totalMemories: 3,
            }),
            makeWrite({
                eventId: 'evt_2',
                seq: 4,
                type: 'memo',
                title: '备忘：正方',
                content: 'Memo A',
                memoryIndex: 1,
                totalMemories: 3,
            }),
            makeWrite({
                eventId: 'evt_3',
                seq: 5,
                type: 'memo',
                title: '备忘：反方',
                content: 'Memo B',
                agentName: 'Opposer',
                memoryIndex: 2,
                totalMemories: 3,
            }),
        ]);

        expect(graph.memoryNodes).toHaveLength(3);
        expect(graph.edges.filter((edge) => edge.kind === 'source')).toHaveLength(3);
        expect(graph.edges.filter((edge) => edge.kind === 'timeline')).toHaveLength(2);
        expect(graph.edges.filter((edge) => edge.kind === 'continuity')).toHaveLength(1);
        expect(graph.sourceNodes.find((node) => node.key === 'tool')?.active).toBe(true);
        expect(graph.sourceNodes.find((node) => node.key === 'runtime')?.active).toBe(false);
    });

    it('builds cumulative knowledge timeline counts', () => {
        const graph = buildMemoryGraph([
            makeWrite({
                eventId: 'evt_1',
                seq: 7,
                type: 'fact',
                source: 'runtime.node.tool_executor',
                sourceKey: 'tool',
                sourceLabel: '工具检索',
                title: '事实：搜索',
                agentName: '',
                memoryIndex: 0,
                totalMemories: 3,
            }),
            makeWrite({
                eventId: 'evt_2',
                seq: 8,
                type: 'context',
                sourceLabel: '上下文整理',
                title: '上下文：压缩',
                agentName: '',
                memoryIndex: 1,
                totalMemories: 3,
            }),
            makeWrite({
                eventId: 'evt_3',
                seq: 9,
                type: 'memo',
                title: '备忘：总结',
                memoryIndex: 2,
                totalMemories: 3,
            }),
        ]);

        expect(graph.timeline).toHaveLength(3);
        expect(graph.timeline[0].counts.fact).toBe(1);
        expect(graph.timeline[1].counts.context).toBe(1);
        expect(graph.timeline[2].counts.memo).toBe(1);
        expect(graph.timeline[2].total).toBe(3);
        expect(graph.maxTimelineTotal).toBe(3);
    });
});
