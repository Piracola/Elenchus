import type { MemorySourceKey, MemoryType, MemoryWriteView } from './memoryView';

export interface MemoryGraphSourceNode {
    id: string;
    key: MemorySourceKey;
    label: string;
    x: number;
    y: number;
    active: boolean;
}

export interface MemoryGraphNode {
    id: string;
    eventId: string;
    seq: number;
    x: number;
    y: number;
    radius: number;
    type: MemoryType;
    title: string;
    shortLabel: string;
    sourceLabel: string;
    memoryIndex: number;
    totalMemories: number;
    importance: number;
}

export interface MemoryGraphEdge {
    id: string;
    from: string;
    to: string;
    kind: 'source' | 'timeline' | 'continuity';
}

export interface KnowledgeTimelinePoint {
    id: string;
    eventId: string;
    seq: number;
    x: number;
    total: number;
    counts: Record<MemoryType, number>;
    type: MemoryType;
}

export interface MemoryGraphModel {
    sourceNodes: MemoryGraphSourceNode[];
    memoryNodes: MemoryGraphNode[];
    edges: MemoryGraphEdge[];
    timeline: KnowledgeTimelinePoint[];
    maxTimelineTotal: number;
}

const SOURCE_LAYOUT: Record<MemorySourceKey, { x: number; y: number; label: string }> = {
    tool: { x: 92, y: 72, label: '工具检索' },
    context: { x: 92, y: 148, label: '上下文整理' },
    runtime: { x: 92, y: 224, label: '运行时写入' },
};

const MEMORY_LANES: Record<MemoryType, number> = {
    fact: 72,
    memo: 148,
    context: 224,
    unknown: 224,
};

function truncateLabel(value: string, maxLength = 10): string {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength)}...`;
}

function buildShortLabel(item: MemoryWriteView): string {
    const withoutPrefix = item.title.replace(/^(事实|备忘|上下文)：/, '');
    if (withoutPrefix && withoutPrefix !== item.title) {
        return truncateLabel(withoutPrefix, 9);
    }

    if (item.agentName) {
        return truncateLabel(item.agentName, 9);
    }

    return truncateLabel(item.title, 9);
}

export function getMemoryLaneY(type: MemoryType): number {
    return MEMORY_LANES[type] ?? MEMORY_LANES.unknown;
}

export function buildMemoryGraph(writes: MemoryWriteView[], maxNodes = 8): MemoryGraphModel {
    const visibleWrites = writes.slice(-Math.max(1, maxNodes));
    const activeSources = new Set<MemorySourceKey>(visibleWrites.map((item) => item.sourceKey));
    const sourceNodes: MemoryGraphSourceNode[] = (Object.keys(SOURCE_LAYOUT) as MemorySourceKey[]).map((key) => ({
        id: `source:${key}`,
        key,
        label: SOURCE_LAYOUT[key].label,
        x: SOURCE_LAYOUT[key].x,
        y: SOURCE_LAYOUT[key].y,
        active: activeSources.has(key),
    }));

    if (!visibleWrites.length) {
        return {
            sourceNodes,
            memoryNodes: [],
            edges: [],
            timeline: [],
            maxTimelineTotal: 0,
        };
    }

    const xStart = 240;
    const xEnd = 860;
    const step = visibleWrites.length > 1 ? (xEnd - xStart) / (visibleWrites.length - 1) : 0;

    const memoryNodes: MemoryGraphNode[] = [];
    const edges: MemoryGraphEdge[] = [];
    const timeline: KnowledgeTimelinePoint[] = [];
    const runningCounts: Record<MemoryType, number> = {
        fact: 0,
        memo: 0,
        context: 0,
        unknown: 0,
    };

    let previousNode: MemoryGraphNode | null = null;
    const previousByType = new Map<MemoryType, MemoryGraphNode>();

    visibleWrites.forEach((item, index) => {
        const x = visibleWrites.length === 1 ? (xStart + xEnd) / 2 : xStart + step * index;
        const node: MemoryGraphNode = {
            id: `memory:${item.eventId}`,
            eventId: item.eventId,
            seq: item.seq,
            x,
            y: getMemoryLaneY(item.type),
            radius: 14 + Math.round((item.importance / 100) * 8),
            type: item.type,
            title: item.title,
            shortLabel: buildShortLabel(item),
            sourceLabel: item.sourceSummary,
            memoryIndex: item.memoryIndex,
            totalMemories: item.totalMemories,
            importance: item.importance,
        };
        memoryNodes.push(node);

        edges.push({
            id: `source:${item.sourceKey}:${item.eventId}`,
            from: `source:${item.sourceKey}`,
            to: node.id,
            kind: 'source',
        });

        if (previousNode) {
            edges.push({
                id: `timeline:${previousNode.eventId}:${item.eventId}`,
                from: previousNode.id,
                to: node.id,
                kind: 'timeline',
            });
        }

        const previousSameType = previousByType.get(item.type);
        if (previousSameType) {
            edges.push({
                id: `continuity:${previousSameType.eventId}:${item.eventId}`,
                from: previousSameType.id,
                to: node.id,
                kind: 'continuity',
            });
        }

        previousNode = node;
        previousByType.set(item.type, node);
        runningCounts[item.type] += 1;

        timeline.push({
            id: `timeline-point:${item.eventId}`,
            eventId: item.eventId,
            seq: item.seq,
            x,
            total: index + 1,
            counts: { ...runningCounts },
            type: item.type,
        });
    });

    return {
        sourceNodes,
        memoryNodes,
        edges,
        timeline,
        maxTimelineTotal: timeline[timeline.length - 1]?.total ?? 0,
    };
}
