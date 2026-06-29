import type { DebatePhase, DialogueEntry, RuntimeEvent } from '../../types';
import { sanitizeIncomingContent } from '../agent/debateStoreHelpers';
import { payloadNumber, payloadString } from '../runtime/runtimeEventPayload';

export type LiveSpeechViewModel = {
    entry: DialogueEntry;
    content: string;
    status: string;
    source: 'stream' | 'placeholder';
};

export type LiveTranscriptViewModel = {
    speech: LiveSpeechViewModel | null;
};

export const EMPTY_LIVE_TRANSCRIPT: LiveTranscriptViewModel = {
    speech: null,
};

type LiveTranscriptArgs = {
    currentSessionId: string | null;
    currentTurn: number;
    participants?: string[];
    dialogueHistory: DialogueEntry[];
    runtimeEvents: RuntimeEvent[];
    streamingEntry: DialogueEntry | null;
    streamingContent: string;
    phase: DebatePhase;
    currentNode: string;
    currentStatus: string;
    isDebating: boolean;
};

const SPEECH_STATUS = '正在发言...';
const RUNTIME_NODE_PREFIX = 'runtime.node.';

function sanitizeStreamContent(content: string): string {
    return sanitizeIncomingContent(content);
}

function isSpeech(entry: DialogueEntry | null | undefined, participants?: string[]): boolean {
    if (!entry) return false;
    const speakerRoles = new Set(participants && participants.length ? participants : ['proposer', 'opposer']);
    return speakerRoles.has(entry.role) && !entry.discussion_kind;
}

function hasSpeechFor(history: DialogueEntry[], role: string, turn?: number): boolean {
    return history.some((entry) => (
        entry.role === role
        && (turn === undefined || entry.turn === turn)
    ));
}

function createEntryFromEvent(event: RuntimeEvent, fallbackRole = ''): DialogueEntry {
    return {
        role: payloadString(event, 'role') ?? fallbackRole,
        agent_name: payloadString(event, 'agent_name') ?? payloadString(event, 'role') ?? fallbackRole,
        content: sanitizeIncomingContent(payloadString(event, 'content')),
        citations: [],
        timestamp: event.timestamp || new Date().toISOString(),
        event_id: event.event_id,
        turn: payloadNumber(event, 'turn'),
    };
}

function getEventNode(event: RuntimeEvent): string {
    const payloadNode = payloadString(event, 'node');
    if (payloadNode) return payloadNode;
    return event.source.startsWith(RUNTIME_NODE_PREFIX)
        ? event.source.slice(RUNTIME_NODE_PREFIX.length)
        : '';
}

function getLastEvent(runtimeEvents: RuntimeEvent[], predicate: (event: RuntimeEvent) => boolean): RuntimeEvent | null {
    for (let index = runtimeEvents.length - 1; index >= 0; index -= 1) {
        const event = runtimeEvents[index];
        if (predicate(event)) {
            return event;
        }
    }
    return null;
}

function hasTerminalEventAfter(
    runtimeEvents: RuntimeEvent[],
    startSeq: number,
    predicate: (event: RuntimeEvent) => boolean,
): boolean {
    return runtimeEvents.some((event) => event.seq > startSeq && predicate(event));
}

function inferCurrentSpeaker({
    currentTurn,
    participants,
    dialogueHistory,
}: Pick<LiveTranscriptArgs, 'currentTurn' | 'participants' | 'dialogueHistory'>): string | null {
    const speakerRoles = participants && participants.length ? participants : ['proposer', 'opposer'];
    for (const role of speakerRoles) {
        if (!hasSpeechFor(dialogueHistory, role, currentTurn)) {
            return role;
        }
    }
    return speakerRoles[speakerRoles.length - 1] ?? null;
}

function buildSpeechPlaceholder(args: LiveTranscriptArgs): LiveSpeechViewModel | null {
    if (!args.isDebating) return null;
    if (args.currentNode !== 'speaker' && args.currentNode !== 'sophistry_speaker' && args.phase !== 'speaking') {
        return null;
    }

    const role = inferCurrentSpeaker(args);
    if (!role || hasSpeechFor(args.dialogueHistory, role, args.currentTurn)) {
        return null;
    }

    return {
        entry: {
            role,
            agent_name: role,
            content: '',
            citations: [],
            timestamp: '',
            turn: args.currentTurn,
        },
        content: '',
        status: args.currentStatus || SPEECH_STATUS,
        source: 'placeholder',
    };
}

function buildLiveSpeech(args: LiveTranscriptArgs): LiveSpeechViewModel | null {
    if (!args.currentSessionId) return null;

    const streamingEntry = args.streamingEntry;
    if (streamingEntry && isSpeech(streamingEntry, args.participants)) {
        const role = streamingEntry.role;
        const turn = streamingEntry.turn;
        if (!hasSpeechFor(args.dialogueHistory, role, turn)) {
            return {
                entry: {
                    ...streamingEntry,
                    content: '',
                },
                content: sanitizeStreamContent(args.streamingContent),
                status: SPEECH_STATUS,
                source: 'stream',
            };
        }
    }

    const speechStart = getLastEvent(args.runtimeEvents, (event) => event.type === 'speech_start');
    if (speechStart) {
        const entry = createEntryFromEvent(speechStart);
        const role = entry.role;
        const turn = entry.turn;
        const finalized = !role
            || hasSpeechFor(args.dialogueHistory, role, turn)
            || hasTerminalEventAfter(
                args.runtimeEvents,
                speechStart.seq,
                (event) => event.type === 'speech_cancel' || event.type === 'speech_end',
            );
        if (!finalized) {
            return {
                entry,
                content: '',
                status: SPEECH_STATUS,
                source: 'placeholder',
            };
        }
    }

    const speechStatus = getLastEvent(
        args.runtimeEvents,
        (event) => event.type === 'status' && ['speaker', 'sophistry_speaker'].includes(getEventNode(event)),
    );
    if (speechStatus) {
        const finalized = hasTerminalEventAfter(
            args.runtimeEvents,
            speechStatus.seq,
            (event) => (
                event.type === 'speech_start'
                || event.type === 'speech_cancel'
                || event.type === 'speech_end'
                || event.type === 'fact_check_start'
                || event.type === 'judge_start'
                || getEventNode(event) === 'tool_executor'
                || getEventNode(event) === 'judge'
            ),
        );
        if (!finalized) {
            return buildSpeechPlaceholder({
                ...args,
                isDebating: true,
                phase: 'speaking',
                currentNode: getEventNode(speechStatus),
                currentStatus: payloadString(speechStatus, 'content') || SPEECH_STATUS,
            });
        }
    }

    return buildSpeechPlaceholder(args);
}

export function buildLiveTranscriptViewModel(args: LiveTranscriptArgs): LiveTranscriptViewModel {
    return {
        speech: buildLiveSpeech(args),
    };
}
