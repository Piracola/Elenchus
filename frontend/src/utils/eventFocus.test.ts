import { describe, expect, it } from 'vitest';

import type { RuntimeEvent } from '../types';
import { resolveRowFocus, getEventNode } from './eventFocus';
import type { DialogueRow } from './groupDialogue';

function makeEvent(overrides: Partial<RuntimeEvent>): RuntimeEvent {
    return {
        schema_version: '2026-03-17',
        event_id: 'evt_test',
        session_id: 'abc123def456',
        seq: 1,
        timestamp: '2026-03-17T00:00:00+00:00',
        source: 'runtime.node.speaker',
        type: 'speech_end',
        payload: {},
        ...overrides,
    };
}

function makeRow(overrides: Partial<DialogueRow>): DialogueRow {
    return {
        agent: null,
        judge: null,
        system: undefined,
        ...overrides,
    };
}

describe('eventFocus', () => {
    it('extracts node from payload first, then from source', () => {
        const payloadNodeEvent = makeEvent({
            source: 'runtime.orchestrator',
            payload: { node: 'judge' },
        });
        const sourceNodeEvent = makeEvent({
            payload: {},
            source: 'runtime.node.tool_executor',
        });

        expect(getEventNode(payloadNodeEvent)).toBe('judge');
        expect(getEventNode(sourceNodeEvent)).toBe('tool_executor');
    });

    it('matches speech_end to agent row by timestamp', () => {
        const event = makeEvent({
            type: 'speech_end',
            timestamp: '2026-03-17T01:00:00+00:00',
        });
        const row = makeRow({
            agent: {
                role: 'proposer',
                agent_name: 'Proposer',
                content: '观点',
                citations: [],
                timestamp: '2026-03-17T01:00:00+00:00',
            },
        });

        expect(resolveRowFocus(row, event)).toEqual({
            agent: true,
            judge: false,
            system: false,
        });
    });

    it('matches judge_score by turn + target when timestamp differs', () => {
        const event = makeEvent({
            type: 'judge_score',
            timestamp: '2026-03-17T01:00:02+00:00',
            payload: { role: 'proposer', turn: 2 },
        });
        const row = makeRow({
            judge: {
                role: 'judge',
                agent_name: '裁判组视角',
                target_role: 'proposer',
                turn: 2,
                content: '评分',
                citations: [],
                timestamp: '2026-03-17T01:00:03+00:00',
            },
        });

        expect(resolveRowFocus(row, event)).toEqual({
            agent: false,
            judge: true,
            system: false,
        });
    });

    it('matches memory_write back to the original source row by source timestamp', () => {
        const event = makeEvent({
            type: 'memory_write',
            source: 'runtime.node.manage_context',
            payload: {
                source_timestamp: '2026-03-17T01:00:00+00:00',
                source_role: 'proposer',
            },
        });
        const row = makeRow({
            agent: {
                role: 'proposer',
                agent_name: '正方一辩',
                content: '这是原始发言',
                citations: [],
                timestamp: '2026-03-17T01:00:00+00:00',
            },
        });

        expect(resolveRowFocus(row, event)).toEqual({
            agent: true,
            judge: false,
            system: false,
        });
    });

    it('matches sophistry report events to observer report rows', () => {
        const event = makeEvent({
            type: 'sophistry_round_report',
            source: 'runtime.node.sophistry_observer',
            payload: { turn: 1 },
        });
        const row = makeRow({
            judge: {
                role: 'sophistry_round_report',
                agent_name: 'Observer',
                content: 'Detected a false dichotomy.',
                citations: [],
                turn: 1,
                timestamp: '2026-03-17T01:00:05+00:00',
            },
        });

        expect(resolveRowFocus(row, event)).toEqual({
            agent: false,
            judge: true,
            system: false,
        });
    });
});
