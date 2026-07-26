import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useDialogA11y } from './useDialogA11y';

afterEach(() => {
    cleanup();
});

function Dialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const { dialogRef, onKeyDown } = useDialogA11y({ isOpen, onClose });

    return (
        <div>
            <button type="button">外部触发器</button>
            {isOpen && (
                <div
                    ref={dialogRef}
                    role="dialog"
                    aria-modal="true"
                    aria-label="测试弹层"
                    tabIndex={-1}
                    onKeyDown={onKeyDown}
                >
                    <button type="button">第一项</button>
                    <button type="button">第二项</button>
                    <button type="button">最后一项</button>
                </div>
            )}
        </div>
    );
}

describe('useDialogA11y', () => {
    it('moves focus into the dialog when it opens', async () => {
        render(<Dialog isOpen onClose={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByRole('dialog')).toHaveFocus();
        });
    });

    it('closes on Escape', async () => {
        const onClose = vi.fn();
        render(<Dialog isOpen onClose={onClose} />);

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('enters the tab ring from the dialog shell rather than skipping past it', () => {
        render(<Dialog isOpen onClose={vi.fn()} />);
        const dialog = screen.getByRole('dialog');
        dialog.focus();

        fireEvent.keyDown(dialog, { key: 'Tab' });

        expect(screen.getByRole('button', { name: '第一项' })).toHaveFocus();
    });

    it('wraps forward from the last control back to the first', () => {
        render(<Dialog isOpen onClose={vi.fn()} />);
        const last = screen.getByRole('button', { name: '最后一项' });
        last.focus();

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });

        expect(screen.getByRole('button', { name: '第一项' })).toHaveFocus();
    });

    it('wraps backward from the first control to the last', () => {
        render(<Dialog isOpen onClose={vi.fn()} />);
        const first = screen.getByRole('button', { name: '第一项' });
        first.focus();

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true });

        expect(screen.getByRole('button', { name: '最后一项' })).toHaveFocus();
    });

    it('leaves focus alone in the middle of the ring', () => {
        render(<Dialog isOpen onClose={vi.fn()} />);
        const second = screen.getByRole('button', { name: '第二项' });
        second.focus();

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });

        // The browser's own sequencing takes over here, so the hook must not
        // reposition focus.
        expect(second).toHaveFocus();
    });

    it('restores focus to the opener when the dialog closes', async () => {
        const { rerender } = render(<Dialog isOpen={false} onClose={vi.fn()} />);
        const opener = screen.getByRole('button', { name: '外部触发器' });
        opener.focus();

        rerender(<Dialog isOpen onClose={vi.fn()} />);
        await waitFor(() => {
            expect(screen.getByRole('dialog')).toHaveFocus();
        });

        rerender(<Dialog isOpen={false} onClose={vi.fn()} />);

        expect(opener).toHaveFocus();
    });
});
