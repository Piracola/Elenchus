import { describe, expect, it } from 'vitest';

import type { RuntimeEvent } from '../../types';
import {
    buildNodeHeat,
    eventToGraphNode,
    findLatestEventIdByNode,
    findPreviousNode,
    getLiveGraphDefinition,
    hasEdge,
} from './liveGraph';

function makeEvent(overrides: Partial<RuntimeEvent>): RuntimeEvent {
    return {
        schema_version: '2026-03-17',
        event_id: 'evt_1',
        session_id: 'abc123def456',
        seq: 1,
        timestamp: '2026-03-17T00:00:00+00:00',
        source: 'runtime.orchestrator',
        type: 'status',
        payload: {},
        ...overrides,
    };
}

describe('liveGraph utils', () => {
    it('maps standard events to graph nodes via source or type', () => {
        const bySource = makeEvent({
            source: 'runtime.node.judge',
            type: 'status',
            payload: {},
        });
        const byType = makeEvent({
            source: 'runtime.orchestrator',
            type: 'judge_score',
            payload: { role: 'proposer' },
        });

        expect(eventToGraphNode(bySource)).toBe('judge');
        expect(eventToGraphNode(byType)).toBe('judge');
        expect(eventToGraphNode(makeEvent({
            source: 'runtime.node.team_discussion',
            type: 'team_discussion',
            payload: { team_side: 'proposer' },
        }))).toBe('team_discussion');
        expect(eventToGraphNode(makeEvent({
            source: 'runtime.node.jury_discussion',
            type: 'jury_summary',
            payload: { turn: 0 },
        }))).toBe('jury_discussion');
        expect(eventToGraphNode(makeEvent({
            source: 'runtime.node.consensus',
            type: 'consensus_summary',
            payload: { turn: 3 },
        }))).toBe('consensus');
    });

    it('maps sophistry events to standalone mode nodes', () => {
        expect(eventToGraphNode(makeEvent({
            source: 'runtime.node.speaker',
            type: 'speech_start',
            payload: { role: 'proposer' },
        }), 'sophistry_experiment')).toBe('sophistry_speaker');

        expect(eventToGraphNode(makeEvent({
            source: 'runtime.node.sophistry_observer',
            type: 'sophistry_round_report',
            payload: { turn: 0 },
        }), 'sophistry_experiment')).toBe('sophistry_observer');

        expect(eventToGraphNode(makeEvent({
            source: 'runtime.node.sophistry_postmortem',
            type: 'sophistry_final_report',
            payload: {},
        }), 'sophistry_experiment')).toBe('sophistry_postmortem');
    });

    it('builds node heat and latest event lookup correctly', () => {
        const events = [
            makeEvent({
                event_id: 'evt_a',
                seq: 1,
                source: 'runtime.node.manage_context',
                payload: {},
            }),
            makeEvent({
                event_id: 'evt_b',
                seq: 2,
                type: 'speech_end',
                payload: { role: 'proposer' },
            }),
            makeEvent({
                event_id: 'evt_c',
                seq: 3,
                type: 'speech_end',
                payload: { role: 'opposer' },
            }),
        ];

        const heat = buildNodeHeat(events);
        expect(heat.manage_context).toBe(1);
        expect(heat.speaker).toBe(2);
        expect(findLatestEventIdByNode(events, 'speaker')).toBe('evt_c');
        expect(findPreviousNode(events, 'evt_c')).toBe('speaker');
    });

    it('validates graph edges for both modes', () => {
        expect(hasEdge('speaker', 'judge')).toBe(true);
        expect(hasEdge('team_discussion', 'speaker')).toBe(true);
        expect(hasEdge('speaker', 'jury_discussion')).toBe(true);
        expect(hasEdge('jury_discussion', 'judge')).toBe(true);
        expect(hasEdge('advance_turn', 'consensus')).toBe(true);
        expect(hasEdge('judge', 'speaker')).toBe(false);

        expect(hasEdge('set_speaker', 'sophistry_speaker', 'sophistry_experiment')).toBe(true);
        expect(hasEdge('sophistry_speaker', 'sophistry_observer', 'sophistry_experiment')).toBe(true);
        expect(hasEdge('advance_turn', 'sophistry_postmortem', 'sophistry_experiment')).toBe(true);
    });

    it('returns standalone graph definitions for sophistry mode', () => {
        const definition = getLiveGraphDefinition('sophistry_experiment');
        expect(definition.nodes.map((node) => node.id)).toEqual([
            'manage_context',
            'set_speaker',
            'sophistry_speaker',
            'sophistry_observer',
            'advance_turn',
            'sophistry_postmortem',
            'end',
        ]);
    });
});
