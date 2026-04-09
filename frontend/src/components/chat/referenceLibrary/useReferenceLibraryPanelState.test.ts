import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../api/client';
import { toast } from '../../../utils/chat/toast';
import { useReferenceLibraryPanelState } from './useReferenceLibraryPanelState';

const mockSetCurrentSession = vi.fn();

vi.mock('../../../api/client', () => ({
    api: {
        sessions: {
            getReferenceLibrary: vi.fn(),
            uploadDocument: vi.fn(),
            deleteDocument: vi.fn(),
            get: vi.fn(),
        },
    },
}));

vi.mock('../../../utils/chat/toast', () => ({
    toast: vi.fn(),
}));

vi.mock('../../../hooks/useDebateViewState', () => ({
    useSessionActions: () => ({
        setCurrentSession: mockSetCurrentSession,
    }),
}));

const sessionsApi = vi.mocked(api.sessions);
const toastMock = vi.mocked(toast);

function makeLibrary() {
    return {
        documents: [
            {
                id: 'doc_1',
                session_id: 'session_reference',
                filename: 'outline.md',
                mime_type: 'text/markdown',
                size_bytes: 512,
                status: 'processed' as const,
                summary_short: 'Layered control notes',
                error_message: null,
                created_at: '2026-03-25T00:00:00Z',
                updated_at: '2026-03-25T00:00:00Z',
                raw_text: '# Outline',
                normalized_text: '# Outline',
            },
        ],
        entries: [
            {
                id: 'entry_1',
                session_id: 'session_reference',
                document_id: 'doc_1',
                entry_type: 'reference_summary' as const,
                title: 'Summary',
                content: 'Layered control summary',
                payload: {},
                importance: 2,
                source_section: null,
                source_order: 0,
                created_at: '2026-03-25T00:00:00Z',
                updated_at: '2026-03-25T00:00:00Z',
            },
        ],
    };
}

function makeSession() {
    return {
        id: 'session_reference',
        topic: 'Reference session refreshed',
        debate_mode: 'standard' as const,
        mode_config: {},
        participants: ['proposer', 'opposer'],
        max_turns: 5,
        current_turn: 0,
        status: 'pending' as const,
        created_at: '2026-03-25T00:00:00Z',
        updated_at: '2026-03-25T00:00:00Z',
        dialogue_history: [],
        team_dialogue_history: [],
        jury_dialogue_history: [],
        current_scores: {},
        cumulative_scores: {},
        team_config: { agents_per_team: 0, discussion_rounds: 0 },
        jury_config: { agents_per_jury: 0, discussion_rounds: 0 },
        reasoning_config: {
            steelman_enabled: true,
            counterfactual_enabled: true,
            consensus_enabled: true,
        },
        mode_artifacts: [],
        current_mode_report: null,
        final_mode_report: null,
        shared_knowledge: [{ type: 'reference_summary', content: 'New reference summary' }],
    };
}

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockSetCurrentSession.mockReset();
});

describe('useReferenceLibraryPanelState', () => {
    it('loads reference library after opening the panel', async () => {
        sessionsApi.getReferenceLibrary.mockResolvedValue(makeLibrary());

        const { result } = renderHook(() => useReferenceLibraryPanelState({ currentSessionId: 'session_reference' }));

        act(() => {
            result.current.setIsOpen(true);
        });

        await waitFor(() => {
            expect(result.current.hasLoaded).toBe(true);
        });

        expect(sessionsApi.getReferenceLibrary).toHaveBeenCalledWith('session_reference');
        expect(result.current.referenceLibrary.documents[0]?.filename).toBe('outline.md');
    });

    it('uploads a file and refreshes session state', async () => {
        const file = new File(['# Notes'], 'notes.md', { type: 'text/markdown' });
        const refreshedLibrary = {
            ...makeLibrary(),
            documents: [
                ...makeLibrary().documents,
                {
                    ...makeLibrary().documents[0],
                    id: 'doc_2',
                    filename: 'notes.md',
                    raw_text: '# Notes',
                    normalized_text: '# Notes',
                },
            ],
        };

        sessionsApi.uploadDocument.mockResolvedValue(refreshedLibrary.documents[1]);
        sessionsApi.getReferenceLibrary.mockResolvedValue(refreshedLibrary);
        sessionsApi.get.mockResolvedValue(makeSession());

        const { result } = renderHook(() => useReferenceLibraryPanelState({ currentSessionId: 'session_reference' }));

        const input = document.createElement('input');
        Object.defineProperty(input, 'files', {
            configurable: true,
            value: [file],
        });

        await act(async () => {
            await result.current.handleFileChange({
                target: input,
            } as unknown as React.ChangeEvent<HTMLInputElement>);
        });

        expect(sessionsApi.uploadDocument).toHaveBeenCalledWith('session_reference', file);
        expect(sessionsApi.getReferenceLibrary).toHaveBeenCalledWith('session_reference');
        expect(sessionsApi.get).toHaveBeenCalledWith('session_reference');
        expect(toastMock).toHaveBeenCalledWith('参考资料已上传：notes.md', 'success');
        expect(mockSetCurrentSession).toHaveBeenCalledWith(expect.objectContaining({
            topic: 'Reference session refreshed',
        }));
    });
});
