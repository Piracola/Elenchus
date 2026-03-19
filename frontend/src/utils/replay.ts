import type { DebatePhase, RuntimeEvent } from '../types';
import { payloadString } from './runtimeEventPayload';

export interface RuntimeViewState {
    phase: DebatePhase;
    status: string;
    node: string;
    isDebating: boolean;
}

export function clampReplayCursor(cursor: number, eventCount: number): number {
    if (eventCount <= 0) return -1;
    if (!Number.isFinite(cursor)) return eventCount - 1;
    return Math.max(-1, Math.min(eventCount - 1, Math.trunc(cursor)));
}

export function getVisibleRuntimeEvents(
    events: RuntimeEvent[],
    replayEnabled: boolean,
    replayCursor: number,
): RuntimeEvent[] {
    if (!replayEnabled) return events;

    const cursor = clampReplayCursor(replayCursor, events.length);
    if (cursor < 0) return [];
    return events.slice(0, cursor + 1);
}

export function deriveRuntimeViewState(
    events: RuntimeEvent[],
    fallback: RuntimeViewState,
): RuntimeViewState {
    let phase = fallback.phase;
    let status = fallback.status;
    let node = fallback.node;
    let isDebating = fallback.isDebating;

    for (const event of events) {
        switch (event.type) {
            case 'status':
                phase = (event.phase ?? payloadString(event, 'phase') ?? phase) as DebatePhase;
                status = payloadString(event, 'content') ?? status;
                node = payloadString(event, 'node') ?? node;
                break;

            case 'speech_start':
                phase = 'speaking';
                isDebating = true;
                break;

            case 'fact_check_start':
                phase = 'fact_checking';
                status = '正在核查事实...';
                node = 'tool_executor';
                break;

            case 'judge_start':
                phase = 'judging';
                status = '裁判评估中...';
                node = 'judge';
                break;

            case 'turn_complete':
                phase = 'advancing';
                break;

            case 'debate_complete':
                phase = 'complete';
                status = '辩论已完成';
                isDebating = false;
                break;

            case 'error':
                phase = 'error';
                status = payloadString(event, 'content') ?? '出现错误';
                isDebating = false;
                break;

            default:
                break;
        }
    }

    return { phase, status, node, isDebating };
}
