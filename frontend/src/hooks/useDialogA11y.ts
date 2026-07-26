/**
 * useDialogA11y — 让弹层具备真正的模态语义
 *
 * Gives a modal the three behaviours a keyboard user needs and that neither
 * `createPortal` nor framer provides: initial focus inside the dialog, Escape to
 * dismiss, and focus restored to whatever opened it.
 *
 * Tab is wrapped inside the dialog rather than hard-trapped at the document
 * level. Selects in these dialogs portal their menus to <body>, so a document
 * level trap would fight them; the listbox handles its own Tab and never joins
 * the dialog's tab ring.
 */

import { useCallback, useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

function visibleFocusables(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((element) => element.getAttribute('aria-hidden') !== 'true');
}

export function useDialogA11y({
    isOpen,
    onClose,
}: {
    isOpen: boolean;
    onClose: () => void;
}) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const previouslyFocused = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        previouslyFocused.current = document.activeElement as HTMLElement | null;

        // The dialog container is focused rather than its first control: landing
        // on a control would read that control instead of the dialog's own name.
        const focusFrame = window.requestAnimationFrame(() => {
            dialogRef.current?.focus?.();
        });

        return () => {
            window.cancelAnimationFrame(focusFrame);
            previouslyFocused.current?.focus?.();
        };
    }, [isOpen]);

    const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
            return;
        }

        if (event.key !== 'Tab') {
            return;
        }

        const container = dialogRef.current;
        if (!container) {
            return;
        }

        const focusables = visibleFocusables(container);
        if (focusables.length === 0) {
            return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;

        // The container itself is focusable (tabIndex -1) but not part of the
        // ring, so entering from it must land on a real control.
        if (active === container) {
            event.preventDefault();
            (event.shiftKey ? last : first).focus();
            return;
        }

        if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
            return;
        }

        if (event.shiftKey && active === first) {
            event.preventDefault();
            last.focus();
        }
    }, [onClose]);

    return { dialogRef, onKeyDown };
}
