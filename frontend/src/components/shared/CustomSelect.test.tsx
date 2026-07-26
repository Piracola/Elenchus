import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import CustomSelect from './CustomSelect';

afterEach(() => {
    cleanup();
});

const OPTIONS = [
    { value: 'a', label: '选项 A' },
    { value: 'b', label: '选项 B' },
    { value: 'c', label: '选项 C' },
];

function renderSelect(value = 'b', onChange = vi.fn()) {
    render(
        <CustomSelect
            value={value}
            options={OPTIONS}
            onChange={onChange}
            label="模型"
        />,
    );
    return { trigger: screen.getByRole('combobox'), onChange };
}

function activeOptionLabel(): string | null {
    const listbox = screen.getByRole('listbox');
    const activeId = listbox.getAttribute('aria-activedescendant');
    if (!activeId) return null;
    return document.getElementById(activeId)?.textContent ?? null;
}

describe('CustomSelect keyboard operation', () => {
    it('exposes combobox semantics and is labelled by its own label', () => {
        const { trigger } = renderSelect();

        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
        expect(trigger).toHaveAccessibleName('模型');
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('opens on ArrowDown with the selected option already active', () => {
        const { trigger } = renderSelect('b');

        fireEvent.keyDown(trigger, { key: 'ArrowDown' });

        expect(trigger).toHaveAttribute('aria-expanded', 'true');
        expect(activeOptionLabel()).toBe('选项 B');
    });

    it('moves the active option with arrows and wraps at both ends', () => {
        const { trigger } = renderSelect('a');

        fireEvent.keyDown(trigger, { key: 'ArrowDown' });
        const listbox = screen.getByRole('listbox');

        fireEvent.keyDown(listbox, { key: 'ArrowDown' });
        expect(activeOptionLabel()).toBe('选项 B');

        fireEvent.keyDown(listbox, { key: 'End' });
        expect(activeOptionLabel()).toBe('选项 C');

        fireEvent.keyDown(listbox, { key: 'ArrowDown' });
        expect(activeOptionLabel()).toBe('选项 A');

        fireEvent.keyDown(listbox, { key: 'ArrowUp' });
        expect(activeOptionLabel()).toBe('选项 C');
    });

    it('commits the active option on Enter and closes the menu', () => {
        const onChange = vi.fn();
        const { trigger } = renderSelect('a', onChange);

        fireEvent.keyDown(trigger, { key: 'ArrowDown' });
        fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
        fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Enter' });

        expect(onChange).toHaveBeenCalledWith('b');
        // The exit animation keeps the node mounted for a moment, so collapse is
        // asserted on the trigger's state rather than on removal.
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('closes on Escape without selecting and hands focus back to the trigger', () => {
        const onChange = vi.fn();
        const { trigger } = renderSelect('a', onChange);

        fireEvent.keyDown(trigger, { key: 'ArrowDown' });
        fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
        fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });

        expect(onChange).not.toHaveBeenCalled();
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        expect(trigger).toHaveFocus();
    });

    it('keeps options out of the tab ring so the listbox owns focus', () => {
        const { trigger } = renderSelect('a');

        fireEvent.keyDown(trigger, { key: 'ArrowDown' });

        for (const option of screen.getAllByRole('option')) {
            expect(option).toHaveAttribute('tabindex', '-1');
        }
        expect(screen.getByRole('listbox')).toHaveFocus();
    });

    it('marks only the committed option as selected, not the keyboard cursor', () => {
        const { trigger } = renderSelect('c');

        fireEvent.keyDown(trigger, { key: 'ArrowDown' });
        fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Home' });

        expect(activeOptionLabel()).toBe('选项 A');
        const selected = screen.getAllByRole('option').filter(
            (option) => option.getAttribute('aria-selected') === 'true',
        );
        expect(selected).toHaveLength(1);
        expect(selected[0]).toHaveTextContent('选项 C');
    });
});
