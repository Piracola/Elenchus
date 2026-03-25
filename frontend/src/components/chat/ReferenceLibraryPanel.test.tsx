import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
    ReferenceLibraryResponse,
    Session,
    SessionDocumentResponse,
} from '../../types';
import { api } from '../../api/client';
import { useDebateStore } from '../../stores/debateStore';
import { toast } from '../../utils/toast';
import ReferenceLibraryPanel from './ReferenceLibraryPanel';

vi.mock('framer-motion', () => {
    const createPrimitive = (tag: keyof HTMLElementTagNameMap) => {
        const Component = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & {
            children?: React.ReactNode;
            animate?: unknown;
            exit?: unknown;
            initial?: unknown;
            transition?: unknown;
            whileHover?: unknown;
            whileTap?: unknown;
        }>((props, ref) => {
            const {
                children,
                animate,
                exit,
                initial,
                transition,
                whileHover,
                whileTap,
                ...rest
            } = props;
            void animate;
            void exit;
            void initial;
            void transition;
            void whileHover;
            void whileTap;
            return React.createElement(tag, { ...rest, ref }, children);
        });
        Component.displayName = `MockMotion(${tag})`;
        return Component;
    };

    return {
        motion: new Proxy({}, {
            get: (_target, property: string) => createPrimitive(property as keyof HTMLElementTagNameMap),
        }),
    };
});

vi.mock('lucide-react', () => new Proxy({}, {
    get: () => () => null,
}));

vi.mock('../../api/client', () => ({
    api: {
        sessions: {
            getReferenceLibrary: vi.fn(),
            uploadDocument: vi.fn(),
            deleteDocument: vi.fn(),
            get: vi.fn(),
        },
    },
}));

vi.mock('../../utils/toast', () => ({
    toast: vi.fn(),
}));

function makeSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session_reference',
        topic: 'Reference session',
        debate_mode: 'standard',
        mode_config: {},
        participants: ['proposer', 'opposer'],
        max_turns: 5,
        current_turn: 0,
        status: 'pending',
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
        ...overrides,
    };
}

function makeDocument(overrides: Partial<SessionDocumentResponse> = {}): SessionDocumentResponse {
    return {
        id: 'doc_1',
        session_id: 'session_reference',
        filename: 'outline.md',
        mime_type: 'text/markdown',
        size_bytes: 512,
        status: 'processed',
        summary_short: 'Layered control notes',
        error_message: null,
        created_at: '2026-03-25T00:00:00Z',
        updated_at: '2026-03-25T00:00:00Z',
        raw_text: '# Outline',
        normalized_text: '# Outline',
        ...overrides,
    };
}

function makeLibrary(overrides: Partial<ReferenceLibraryResponse> = {}): ReferenceLibraryResponse {
    return {
        documents: [makeDocument()],
        entries: [
            {
                id: 'entry_1',
                session_id: 'session_reference',
                document_id: 'doc_1',
                entry_type: 'reference_summary',
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
        ...overrides,
    };
}

describe('ReferenceLibraryPanel', () => {
    beforeEach(() => {
        useDebateStore.getState().reset();
        vi.clearAllMocks();
    });

    afterEach(() => {
        useDebateStore.getState().reset();
    });

    it('loads existing references and uploads new material', async () => {
        const file = new File(['# Notes'], 'notes.md', { type: 'text/markdown' });
        const uploadedDocument = makeDocument({
            id: 'doc_2',
            filename: 'notes.md',
            normalized_text: '# Notes',
            raw_text: '# Notes',
        });

        vi.mocked(api.sessions.getReferenceLibrary)
            .mockResolvedValueOnce(makeLibrary())
            .mockResolvedValueOnce(makeLibrary({
                documents: [
                    makeDocument(),
                    uploadedDocument,
                ],
                entries: [
                    ...makeLibrary().entries,
                    {
                        id: 'entry_2',
                        session_id: 'session_reference',
                        document_id: 'doc_2',
                        entry_type: 'reference_summary',
                        title: 'Notes',
                        content: 'New reference summary',
                        payload: {},
                        importance: 2,
                        source_section: null,
                        source_order: 1,
                        created_at: '2026-03-25T00:00:00Z',
                        updated_at: '2026-03-25T00:00:00Z',
                    },
                ],
            }));
        vi.mocked(api.sessions.uploadDocument).mockResolvedValue(uploadedDocument);
        vi.mocked(api.sessions.get).mockResolvedValue(makeSession({
            topic: 'Reference session refreshed',
            shared_knowledge: [{ type: 'reference_summary', content: 'New reference summary' }],
        }));

        render(
            <ReferenceLibraryPanel
                currentSessionId="session_reference"
                isSophistryMode={false}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /参考资料/i }));

        expect(await screen.findByText('outline.md')).toBeInTheDocument();
        expect(screen.getByText('Layered control notes')).toBeInTheDocument();

        fireEvent.change(screen.getByTestId('reference-upload-input'), {
            target: { files: [file] },
        });

        await waitFor(() => {
            expect(api.sessions.uploadDocument).toHaveBeenCalledWith('session_reference', file);
        });
        await waitFor(() => {
            expect(api.sessions.get).toHaveBeenCalledWith('session_reference');
        });

        expect(await screen.findByText('notes.md')).toBeInTheDocument();
        expect(toast).toHaveBeenCalledWith('参考资料已上传：notes.md', 'success');
        expect(useDebateStore.getState().currentSession?.topic).toBe('Reference session refreshed');
    });
});
