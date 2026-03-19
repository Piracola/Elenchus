import type { RuntimeEvent } from '../types';
import { getEventNode } from './eventFocus';
import { getRuntimeEventNodeHint } from './runtimeEventDictionary';

export interface LiveGraphNode {
    id: string;
    label: string;
    x: number;
    y: number;
}

export interface LiveGraphEdge {
    id: string;
    from: string;
    to: string;
    curve?: number;
}

export const LIVE_GRAPH_NODES: LiveGraphNode[] = [
    { id: 'manage_context', label: '上下文', x: 90, y: 130 },
    { id: 'set_speaker', label: '切换发言方', x: 240, y: 130 },
    { id: 'team_discussion', label: '组内讨论', x: 390, y: 130 },
    { id: 'speaker', label: '辩手发言', x: 540, y: 78 },
    { id: 'tool_executor', label: '工具执行', x: 540, y: 182 },
    { id: 'jury_discussion', label: '陪审团讨论', x: 710, y: 78 },
    { id: 'judge', label: '裁判', x: 860, y: 78 },
    { id: 'advance_turn', label: '推进回合', x: 1000, y: 78 },
    { id: 'consensus', label: '共识收敛', x: 1000, y: 182 },
    { id: 'end', label: '结束', x: 1140, y: 130 },
];

export const LIVE_GRAPH_EDGES: LiveGraphEdge[] = [
    { id: 'manage_context->set_speaker', from: 'manage_context', to: 'set_speaker' },
    { id: 'set_speaker->team_discussion', from: 'set_speaker', to: 'team_discussion', curve: -18 },
    { id: 'set_speaker->speaker', from: 'set_speaker', to: 'speaker', curve: -44 },
    { id: 'team_discussion->speaker', from: 'team_discussion', to: 'speaker', curve: -16 },
    { id: 'speaker->tool_executor', from: 'speaker', to: 'tool_executor', curve: 40 },
    { id: 'tool_executor->speaker', from: 'tool_executor', to: 'speaker', curve: -40 },
    { id: 'speaker->jury_discussion', from: 'speaker', to: 'jury_discussion', curve: 12 },
    { id: 'speaker->judge', from: 'speaker', to: 'judge', curve: -24 },
    { id: 'jury_discussion->judge', from: 'jury_discussion', to: 'judge', curve: 18 },
    { id: 'judge->advance_turn', from: 'judge', to: 'advance_turn' },
    { id: 'advance_turn->manage_context', from: 'advance_turn', to: 'manage_context', curve: 72 },
    { id: 'advance_turn->consensus', from: 'advance_turn', to: 'consensus', curve: 18 },
    { id: 'advance_turn->end', from: 'advance_turn', to: 'end', curve: -20 },
    { id: 'consensus->end', from: 'consensus', to: 'end', curve: 18 },
];

const NODE_SET = new Set(LIVE_GRAPH_NODES.map((node) => node.id));
const NODE_LABEL_MAP = Object.fromEntries(
    LIVE_GRAPH_NODES.map((node) => [node.id, node.label]),
) as Record<string, string>;

export function getLiveGraphNodeLabel(nodeId: string | null | undefined): string {
    if (!nodeId) return '';
    return NODE_LABEL_MAP[nodeId] ?? nodeId;
}

export function eventToGraphNode(event: RuntimeEvent | null): string | null {
    if (!event) return null;
    const direct = getEventNode(event);
    if (direct && NODE_SET.has(direct)) return direct;
    return getRuntimeEventNodeHint(event.type);
}

export function buildNodeHeat(events: RuntimeEvent[]): Record<string, number> {
    const heat: Record<string, number> = {};
    for (const event of events) {
        const node = eventToGraphNode(event);
        if (!node) continue;
        heat[node] = (heat[node] ?? 0) + 1;
    }
    return heat;
}

export function findLatestEventIdByNode(events: RuntimeEvent[], nodeId: string): string | null {
    for (let i = events.length - 1; i >= 0; i--) {
        if (eventToGraphNode(events[i]) === nodeId) {
            return events[i].event_id;
        }
    }
    return null;
}

export function findPreviousNode(events: RuntimeEvent[], eventId: string): string | null {
    const index = events.findIndex((event) => event.event_id === eventId);
    if (index <= 0) return null;
    for (let i = index - 1; i >= 0; i--) {
        const node = eventToGraphNode(events[i]);
        if (node) return node;
    }
    return null;
}

export function edgeId(from: string, to: string): string {
    return `${from}->${to}`;
}

export function hasEdge(from: string, to: string): boolean {
    return LIVE_GRAPH_EDGES.some((edge) => edge.from === from && edge.to === to);
}
