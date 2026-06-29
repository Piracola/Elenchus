import { afterEach, describe, expect, it, vi } from 'vitest';

describe('api client URL handling', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('resolves relative API paths against the test origin', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify([]), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        }));

        const { api } = await import('./client');
        await api.models.list();

        expect(fetchMock).toHaveBeenNthCalledWith(1, `${window.location.origin}/api/models`, expect.objectContaining({
            credentials: 'include',
        }));
    });
});
