import { describe, expect, it, vi } from 'vitest';

vi.mock('./referenceLibrary/ReferenceLibraryPopover', () => ({
    ReferenceLibraryPopover: () => null,
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

vi.mock('../../hooks/useDebateViewState', () => ({
    useSessionActions: () => ({
        setCurrentSession: vi.fn(),
    }),
}));

vi.mock('framer-motion', () => ({
    motion: new Proxy({}, {
        get: () => 'button',
    }),
}));

vi.mock('lucide-react', () => ({
    BookOpenText: () => null,
}));

describe('ReferenceLibraryPanel import smoke', () => {
    it('imports the component module', async () => {
        const module = await import('./ReferenceLibraryPanel');

        expect(module.default).toBeDefined();
    });
});
