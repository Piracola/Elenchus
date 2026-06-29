import { describe, expect, it } from 'vitest';

import { resolveHistoryRowStart } from './chatHistoryWindow';

describe('chatHistoryWindow', () => {
    it('keeps expanded older history visible when new rows arrive', () => {
        expect(resolveHistoryRowStart({
            currentStart: 20,
            rowsLength: 260,
            previousRowsLength: 200,
            sessionChanged: false,
            initialWindowSize: 120,
        })).toBe(20);
    });

    it('follows the latest window when the user is already at the live tail', () => {
        expect(resolveHistoryRowStart({
            currentStart: 80,
            rowsLength: 260,
            previousRowsLength: 200,
            sessionChanged: false,
            initialWindowSize: 120,
        })).toBe(140);
    });

    it('resets to the latest real-history window when the session changes', () => {
        expect(resolveHistoryRowStart({
            currentStart: 12,
            rowsLength: 260,
            previousRowsLength: 200,
            sessionChanged: true,
            initialWindowSize: 120,
        })).toBe(140);
    });
});
