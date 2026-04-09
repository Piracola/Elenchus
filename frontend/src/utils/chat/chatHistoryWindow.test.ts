import { describe, expect, it } from 'vitest';

import { revealFocusedHistoryRow, resolveHistoryRowStart } from './chatHistoryWindow';

describe('chatHistoryWindow', () => {
    it('keeps expanded older history visible when new rows arrive', () => {
        expect(resolveHistoryRowStart({
            currentStart: 20,
            rowsLength: 260,
            previousRowsLength: 200,
            replayEnabled: false,
            sessionChanged: false,
            replayChanged: false,
            initialWindowSize: 120,
        })).toBe(20);
    });

    it('follows the latest window when the user is already at the live tail', () => {
        expect(resolveHistoryRowStart({
            currentStart: 80,
            rowsLength: 260,
            previousRowsLength: 200,
            replayEnabled: false,
            sessionChanged: false,
            replayChanged: false,
            initialWindowSize: 120,
        })).toBe(140);
    });

    it('resets to the latest real-history window when the session changes', () => {
        expect(resolveHistoryRowStart({
            currentStart: 12,
            rowsLength: 260,
            previousRowsLength: 200,
            replayEnabled: false,
            sessionChanged: true,
            replayChanged: false,
            initialWindowSize: 120,
        })).toBe(140);
    });

    it('resets to full history in replay mode', () => {
        expect(resolveHistoryRowStart({
            currentStart: 80,
            rowsLength: 260,
            previousRowsLength: 200,
            replayEnabled: true,
            sessionChanged: false,
            replayChanged: false,
            initialWindowSize: 120,
        })).toBe(0);
    });

    it('reveals a focused row that is still hidden by the collapsed history window', () => {
        expect(revealFocusedHistoryRow(140, 32)).toBe(32);
    });

    it('keeps the current window when the focused row is already rendered', () => {
        expect(revealFocusedHistoryRow(32, 60)).toBe(32);
    });
});
