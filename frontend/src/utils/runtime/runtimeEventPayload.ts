import type { RuntimeEvent } from '../../types';
import { isRecord } from '../type/typeGuards';

export function payloadString(event: RuntimeEvent, key: string): string | undefined {
    const value = event.payload[key];
    return typeof value === 'string' ? value : undefined;
}

export function payloadNumber(event: RuntimeEvent, key: string): number | undefined {
    const value = event.payload[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function payloadRecord(
    event: RuntimeEvent,
    key: string,
): Record<string, unknown> | undefined {
    const value = event.payload[key];
    return isRecord(value) && !Array.isArray(value) ? value : undefined;
}
