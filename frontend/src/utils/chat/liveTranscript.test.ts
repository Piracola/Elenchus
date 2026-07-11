import { describe, expect, it } from 'vitest';

import type { DialogueEntry, RuntimeEvent } from '../../types';
import { makeRuntimeEvent } from '../../test/runtimeEventFactory';
import { buildLiveTranscriptViewModel } from './liveTranscript';

function baseArgs(overrides: Partial<Parameters<typeof buildLiveTranscriptViewModel>[0]> = {}) {
    return {
        currentSessionId: 'session_1',
        currentTurn: 0,
        participants: ['proposer', 'opposer'],
        dialogueHistory: [] as DialogueEntry[],
        runtimeEvents: [] as RuntimeEvent[],
        streamingEntry: null,
        streamingContent: '',
        phase: 'idle' as const,
        currentNode: '',
        currentStatus: '',
        isDebating: false,
        ...overrides,
    };
}

describe('buildLiveTranscriptViewModel', () => {
    it('keeps a speech placeholder visible when the speaker node is active before tokens arrive', () => {
        const live = buildLiveTranscriptViewModel(baseArgs({
            phase: 'speaking',
            currentNode: 'speaker',
            currentStatus: '辩手正在组织发言...',
            isDebating: true,
        }));

        expect(live.speech).toMatchObject({
            content: '',
            status: '辩手正在组织发言...',
            source: 'placeholder',
            entry: {
                role: 'proposer',
                turn: 0,
            },
        });
    });

    it('restores a persisted speech_start as a live speech placeholder after session switching', () => {
        const live = buildLiveTranscriptViewModel(baseArgs({
            isDebating: true,
            runtimeEvents: [
                makeRuntimeEvent({
                    event_id: 'evt_start',
                    session_id: 'session_1',
                    seq: 4,
                    type: 'speech_start',
                    payload: {
                        role: 'opposer',
                        agent_name: '反方',
                        turn: 0,
                    },
                }),
            ],
        }));

        expect(live.speech).toMatchObject({
            content: '',
            status: '正在发言...',
            source: 'placeholder',
            entry: {
                role: 'opposer',
                agent_name: '反方',
                turn: 0,
            },
        });
    });

    it('does not restore a speaker placeholder from old events when the run is idle', () => {
        const live = buildLiveTranscriptViewModel(baseArgs({
            isDebating: false,
            runtimeEvents: [
                makeRuntimeEvent({
                    event_id: 'evt_status_speaker',
                    session_id: 'session_1',
                    seq: 5,
                    type: 'status',
                    phase: 'speaking',
                    payload: {
                        content: '辩手正在组织发言...',
                        node: 'speaker',
                    },
                }),
            ],
        }));

        expect(live.speech).toBeNull();
    });

    it('restores a speaker status event as a placeholder before speech_start is emitted while running', () => {
        const live = buildLiveTranscriptViewModel(baseArgs({
            isDebating: true,
            runtimeEvents: [
                makeRuntimeEvent({
                    event_id: 'evt_status_speaker',
                    session_id: 'session_1',
                    seq: 5,
                    type: 'status',
                    phase: 'speaking',
                    payload: {
                        content: '辩手正在组织发言...',
                        node: 'speaker',
                    },
                }),
            ],
        }));

        expect(live.speech).toMatchObject({
            content: '',
            status: '辩手正在组织发言...',
            source: 'placeholder',
            entry: {
                role: 'proposer',
                turn: 0,
            },
        });
    });

    it('shows an independent group discussion placeholder while that node is active', () => {
        const live = buildLiveTranscriptViewModel(baseArgs({
            phase: 'processing',
            currentNode: 'group_discussion',
            currentStatus: '组内讨论正在生成本轮赛前简报...',
            isDebating: true,
        }));

        expect(live.groupDiscussion).toMatchObject({
            content: '',
            status: '组内讨论正在生成本轮赛前简报...',
            source: 'placeholder',
            entry: {
                role: 'group_discussion',
                turn: 0,
                discussion_kind: 'group_discussion',
            },
        });
        expect(live.speech).toBeNull();
    });

});
