import type { DebateMode, RuntimeEvent } from '../types';
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

export interface LiveGraphDefinition {
    nodes: LiveGraphNode[];
    edges: LiveGraphEdge[];
}

const STANDARD_LIVE_GRAPH: LiveGraphDefinition = {
    nodes: [
        { id: 'manage_context', label: '上下文', x: 90, y: 130 },
        { id: 'set_speaker', label: '切换发言', x: 240, y: 130 },
        { id: 'team_discussion', label: '组内讨论', x: 390, y: 130 },
        { id: 'speaker', label: '辩手发言', x: 540, y: 78 },
        { id: 'tool_executor', label: '工具执行', x: 540, y: 182 },
        { id: 'jury_discussion', label: '陪审讨论', x: 710, y: 78 },
        { id: 'judge', label: '裁判', x: 860, y: 78 },
        { id: 'advance_turn', label: '推进回合', x: 1000, y: 78 },
        { id: 'consensus', label: '共识收束', x: 1000, y: 182 },
        { id: 'end', label: '结束', x: 1140, y: 130 },
    ],
    edges: [
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
    ],
};

const SOPHISTRY_LIVE_GRAPH: LiveGraphDefinition = {
    nodes: [
        { id: 'manage_context', label: '上下文', x: 100, y: 130 },
        { id: 'set_speaker', label: '切换发言', x: 280, y: 130 },
        { id: 'sophistry_speaker', label: '诡辩发言', x: 480, y: 130 },
        { id: 'sophistry_observer', label: '观察报告', x: 700, y: 130 },
        { id: 'advance_turn', label: '推进回合', x: 900, y: 130 },
        { id: 'sophistry_postmortem', label: '实验总览', x: 1100, y: 130 },
        { id: 'end', label: '结束', x: 1280, y: 130 },
    ],
    edges: [
        { id: 'manage_context->set_speaker', from: 'manage_context', to: 'set_speaker' },
        { id: 'set_speaker->sophistry_speaker', from: 'set_speaker', to: 'sophistry_speaker', curve: -24 },
        { id: 'sophistry_speaker->set_speaker', from: 'sophistry_speaker', to: 'set_speaker', curve: 30 },
        { id: 'sophistry_speaker->sophistry_observer', from: 'sophistry_speaker', to: 'sophistry_observer' },
        { id: 'sophistry_observer->advance_turn', from: 'sophistry_observer', to: 'advance_turn' },
        { id: 'advance_turn->manage_context', from: 'advance_turn', to: 'manage_context', curve: 84 },
        { id: 'advance_turn->sophistry_postmortem', from: 'advance_turn', to: 'sophistry_postmortem', curve: -22 },
        { id: 'sophistry_postmortem->end', from: 'sophistry_postmortem', to: 'end' },
    ],
};

export function getLiveGraphDefinition(
    debateMode: DebateMode = 'standard',
): LiveGraphDefinition {
    return debateMode === 'sophistry_experiment'
        ? SOPHISTRY_LIVE_GRAPH
        : STANDARD_LIVE_GRAPH;
}

function translateDirectNode(node: string, debateMode: DebateMode): string {
    if (debateMode !== 'sophistry_experiment') {
        return node;
    }
    if (node === 'speaker') return 'sophistry_speaker';
    return node;
}

function buildNodeSet(definition: LiveGraphDefinition): Set<string> {
    return new Set(definition.nodes.map((node) => node.id));
}

function buildNodeLabelMap(definition: LiveGraphDefinition): Record<string, string> {
    return Object.fromEntries(definition.nodes.map((node) => [node.id, node.label])) as Record<string, string>;
}

export function getLiveGraphNodeLabel(
    nodeId: string | null | undefined,
    debateMode: DebateMode = 'standard',
): string {
    if (!nodeId) return '';
    const labels = buildNodeLabelMap(getLiveGraphDefinition(debateMode));
    return labels[nodeId] ?? nodeId;
}

export function eventToGraphNode(
    event: RuntimeEvent | null,
    debateMode: DebateMode = 'standard',
): string | null {
    if (!event) return null;

    const definition = getLiveGraphDefinition(debateMode);
    const nodeSet = buildNodeSet(definition);
    const direct = getEventNode(event);
    if (direct) {
        const translated = translateDirectNode(direct, debateMode);
        if (nodeSet.has(translated)) return translated;
    }

    const hinted = getRuntimeEventNodeHint(event.type, debateMode);
    return hinted && nodeSet.has(hinted) ? hinted : null;
}

export function buildNodeHeat(
    events: RuntimeEvent[],
    debateMode: DebateMode = 'standard',
): Record<string, number> {
    const heat: Record<string, number> = {};
    for (const event of events) {
        const node = eventToGraphNode(event, debateMode);
        if (!node) continue;
        heat[node] = (heat[node] ?? 0) + 1;
    }
    return heat;
}

export function findLatestEventIdByNode(
    events: RuntimeEvent[],
    nodeId: string,
    debateMode: DebateMode = 'standard',
): string | null {
    for (let index = events.length - 1; index >= 0; index -= 1) {
        if (eventToGraphNode(events[index], debateMode) === nodeId) {
            return events[index].event_id;
        }
    }
    return null;
}

export function findPreviousNode(
    events: RuntimeEvent[],
    eventId: string,
    debateMode: DebateMode = 'standard',
): string | null {
    const index = events.findIndex((event) => event.event_id === eventId);
    if (index <= 0) return null;

    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        const node = eventToGraphNode(events[cursor], debateMode);
        if (node) return node;
    }
    return null;
}

export function edgeId(from: string, to: string): string {
    return `${from}->${to}`;
}

export function hasEdge(
    from: string,
    to: string,
    debateMode: DebateMode = 'standard',
): boolean {
    return getLiveGraphDefinition(debateMode).edges.some((edge) => edge.from === from && edge.to === to);
}
