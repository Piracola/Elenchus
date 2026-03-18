import type { RuntimeEvent } from '../types';
import type { DialogueRow } from './groupDialogue';

export interface RowFocusState {
    agent: boolean;
    judge: boolean;
    system: boolean;
}

const EMPTY_FOCUS: RowFocusState = { agent: false, judge: false, system: false };

function payloadString(event: RuntimeEvent, key: string): string | undefined {
    const value = event.payload[key];
    return typeof value === 'string' ? value : undefined;
}

function payloadNumber(event: RuntimeEvent, key: string): number | undefined {
    const value = event.payload[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function getEventNode(event: RuntimeEvent | null): string | null {
    if (!event) return null;

    const payloadNode = payloadString(event, 'node');
    if (payloadNode) return payloadNode;

    const source = event.source;
    const prefix = 'runtime.node.';
    if (source.startsWith(prefix)) {
        return source.slice(prefix.length) || null;
    }

    return null;
}

export function resolveRowFocus(row: DialogueRow, event: RuntimeEvent | null): RowFocusState {
    if (!event) return EMPTY_FOCUS;

    if (event.type === 'speech_end') {
        if (row.agent?.timestamp && row.agent.timestamp === event.timestamp) {
            return { agent: true, judge: false, system: false };
        }
        return EMPTY_FOCUS;
    }

    if (event.type === 'judge_score') {
        if (row.judge?.timestamp && row.judge.timestamp === event.timestamp) {
            return { agent: false, judge: true, system: false };
        }

        const role = payloadString(event, 'role');
        const turn = payloadNumber(event, 'turn');
        if (
            row.judge &&
            row.judge.role === 'judge' &&
            (role ? row.judge.target_role === role : true) &&
            (turn !== undefined ? row.judge.turn === turn : true)
        ) {
            return { agent: false, judge: true, system: false };
        }
        return EMPTY_FOCUS;
    }

    if (event.type === 'audience_message') {
        const audienceTimestamp = payloadString(event, 'timestamp') ?? event.timestamp;
        if (
            row.system &&
            row.system.role === 'audience' &&
            row.system.timestamp === audienceTimestamp
        ) {
            return { agent: false, judge: false, system: true };
        }
        return EMPTY_FOCUS;
    }

    if (event.type === 'error') {
        if (row.system?.role === 'error' && row.system.timestamp === event.timestamp) {
            return { agent: false, judge: false, system: true };
        }
        return EMPTY_FOCUS;
    }

    return EMPTY_FOCUS;
}
