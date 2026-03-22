import type {
    DebatePhase,
    DialogueEntry,
    ModeArtifact,
    RuntimeEvent,
    SearchResult,
    Session,
} from '../types';
import { repairKnownMojibakeText, repairTextTree } from './textRepair';

const MAX_SAFE_CONTENT_LENGTH = 50000;
export const MAX_RUNTIME_EVENTS = 10_000;

export function sanitizeIncomingContent(content: unknown): string {
    const text = repairKnownMojibakeText(typeof content === 'string' ? content : '');
    if (!text) return text;

    if (text.includes('Scoring failed, so a neutral fallback score was used.')) {
        return '评分解析失败，本轮暂按中性分处理。';
    }

    if (text.startsWith('data: {')) {
        return '[已过滤异常的流式响应数据]';
    }

    if (looksLikeHtmlDocument(text)) {
        return '[Provider endpoint returned HTML instead of model output. Check API Base URL (usually ending with /v1).]';
    }

    if (text.length > MAX_SAFE_CONTENT_LENGTH) {
        return `${text.slice(0, MAX_SAFE_CONTENT_LENGTH)}\n\n[内容过长，已截断以保护界面]`;
    }

    return text;
}

function looksLikeHtmlDocument(text: string): boolean {
    const normalized = text.trimStart().toLowerCase();
    if (!normalized) return false;

    if (normalized.startsWith('<!doctype html') || normalized.startsWith('<html')) {
        return true;
    }

    return normalized.includes('<html') && normalized.includes('</html>') && normalized.includes('<body');
}

function sameCitations(a: string[] = [], b: string[] = []): boolean {
    if (a.length !== b.length) return false;
    return a.every((item, index) => item === b[index]);
}

function sameDialogueContent(a: DialogueEntry, b: DialogueEntry): boolean {
    const aScores = JSON.stringify(a.scores ?? null);
    const bScores = JSON.stringify(b.scores ?? null);
    return (
        a.role === b.role &&
        (a.turn ?? -1) === (b.turn ?? -1) &&
        (a.target_role ?? '') === (b.target_role ?? '') &&
        (a.discussion_kind ?? '') === (b.discussion_kind ?? '') &&
        (a.team_side ?? '') === (b.team_side ?? '') &&
        (a.team_round ?? -1) === (b.team_round ?? -1) &&
        (a.team_member_index ?? -1) === (b.team_member_index ?? -1) &&
        (a.team_specialty ?? '') === (b.team_specialty ?? '') &&
        (a.jury_round ?? -1) === (b.jury_round ?? -1) &&
        (a.jury_member_index ?? -1) === (b.jury_member_index ?? -1) &&
        (a.jury_perspective ?? '') === (b.jury_perspective ?? '') &&
        a.agent_name === b.agent_name &&
        a.content === b.content &&
        sameCitations(a.citations, b.citations) &&
        aScores === bScores
    );
}

export function appendDialogueWithDedupe(history: DialogueEntry[], entry: DialogueEntry): DialogueEntry[] {
    if (entry.role === 'judge' && entry.turn !== undefined) {
        const duplicatedJudge = history.some(
            (item) =>
                item.role === 'judge' &&
                item.turn === entry.turn &&
                (item.target_role ?? '') === (entry.target_role ?? '') &&
                sameDialogueContent(item, entry),
        );
        if (duplicatedJudge) {
            return history;
        }
    }

    const lastEntry = history[history.length - 1];
    if (lastEntry && sameDialogueContent(lastEntry, entry)) {
        return history;
    }

    return [...history, entry];
}

export function getPayloadString(payload: Record<string, unknown>, key: string): string | undefined {
    const value = payload[key];
    return typeof value === 'string' ? value : undefined;
}

export function getPayloadNumber(payload: Record<string, unknown>, key: string): number | undefined {
    const value = payload[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function getPayloadCitations(payload: Record<string, unknown>): string[] {
    const value = payload.citations;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string');
}

export function computeLastEventSeq(events: RuntimeEvent[]): number {
    return events.reduce((maxSeq, event) => {
        if (event.seq >= 0 && event.seq > maxSeq) {
            return event.seq;
        }
        return maxSeq;
    }, -1);
}

export function coerceSearchResults(payload: Record<string, unknown>): SearchResult[] {
    const value = payload.results;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is SearchResult => typeof item === 'object' && item !== null) as SearchResult[];
}

export function appendModeArtifact(artifacts: ModeArtifact[], artifact: ModeArtifact): ModeArtifact[] {
    const duplicate = artifacts.some((item) =>
        item.type === artifact.type
        && (item.turn ?? -1) === (artifact.turn ?? -1)
        && item.content === artifact.content,
    );
    if (duplicate) {
        return artifacts;
    }
    return [...artifacts, artifact];
}

export function sanitizeDialogueEntry(entry: DialogueEntry): DialogueEntry {
    return {
        ...entry,
        content: sanitizeIncomingContent(entry.content),
        agent_name: repairKnownMojibakeText(entry.agent_name),
    };
}

export function sanitizeRuntimeEvent(event: RuntimeEvent): RuntimeEvent {
    return {
        ...event,
        payload: repairTextTree(event.payload) as Record<string, unknown>,
    };
}

export function shouldRecordRuntimeEvent(event: RuntimeEvent): boolean {
    return event.type !== 'speech_token';
}

function sortRuntimeEvents(a: RuntimeEvent, b: RuntimeEvent): number {
    const aSeq = a.seq >= 0 ? a.seq : Number.MAX_SAFE_INTEGER;
    const bSeq = b.seq >= 0 ? b.seq : Number.MAX_SAFE_INTEGER;
    if (aSeq !== bSeq) {
        return aSeq - bSeq;
    }

    const aTime = Date.parse(a.timestamp);
    const bTime = Date.parse(b.timestamp);
    const safeATime = Number.isFinite(aTime) ? aTime : 0;
    const safeBTime = Number.isFinite(bTime) ? bTime : 0;
    if (safeATime !== safeBTime) {
        return safeATime - safeBTime;
    }

    return a.event_id.localeCompare(b.event_id);
}

export function normalizeRuntimeEvents(events: RuntimeEvent[]): RuntimeEvent[] {
    const sorted = [...events]
        .map((event) => sanitizeRuntimeEvent(event))
        .sort(sortRuntimeEvents);
    const seenIds = new Set<string>();
    const unique: RuntimeEvent[] = [];

    for (const event of sorted) {
        if (!shouldRecordRuntimeEvent(event)) continue;
        if (seenIds.has(event.event_id)) continue;
        seenIds.add(event.event_id);
        unique.push(event);
    }

    return unique.length > MAX_RUNTIME_EVENTS ? unique.slice(-MAX_RUNTIME_EVENTS) : unique;
}

export function sanitizeSession(session: Session | null): Session | null {
    if (!session) return null;
    return {
        ...session,
        debate_mode: session.debate_mode ?? 'standard',
        mode_config: session.mode_config ?? {},
        dialogue_history: (session.dialogue_history ?? []).map(sanitizeDialogueEntry),
        team_dialogue_history: (session.team_dialogue_history ?? []).map(sanitizeDialogueEntry),
        jury_dialogue_history: (session.jury_dialogue_history ?? []).map(sanitizeDialogueEntry),
        team_config: session.team_config ?? { agents_per_team: 0, discussion_rounds: 0 },
        jury_config: session.jury_config ?? { agents_per_jury: 0, discussion_rounds: 0 },
        reasoning_config: session.reasoning_config ?? {
            steelman_enabled: true,
            counterfactual_enabled: true,
            consensus_enabled: true,
        },
        mode_artifacts: Array.isArray(session.mode_artifacts) ? session.mode_artifacts : [],
        current_mode_report: session.current_mode_report ?? null,
        final_mode_report: session.final_mode_report ?? null,
    };
}

export function getSessionRuntimeFallback(session: Session | null): {
    isDebating: boolean;
    phase: DebatePhase;
    status: string;
    node: string;
} {
    if (!session) {
        return {
            isDebating: false,
            phase: 'idle',
            status: '',
            node: '',
        };
    }

    if (session.status === 'in_progress') {
        return {
            isDebating: false,
            phase: 'idle',
            status: '',
            node: '',
        };
    }

    if (session.status === 'completed') {
        return {
            isDebating: false,
            phase: 'complete',
            status: '辩论已完成',
            node: '',
        };
    }

    if (session.status === 'error') {
        return {
            isDebating: false,
            phase: 'error',
            status: '会话发生错误',
            node: '',
        };
    }

    return {
        isDebating: false,
        phase: 'idle',
        status: '',
        node: '',
    };
}
