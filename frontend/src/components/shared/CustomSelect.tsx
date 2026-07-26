/**
 * CustomSelect — 自定义下拉选择组件
 * 替代原生select，提供统一的视觉风格和交互体验
 *
 * Implements the ARIA listbox pattern: the trigger is a combobox, the portaled
 * menu is a listbox that owns keyboard focus, and the highlighted row is tracked
 * with `aria-activedescendant` rather than by moving DOM focus between rows.
 */

import { useState, useRef, useEffect, useLayoutEffect, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';
import { createPortal } from 'react-dom';
import { POPOVER_MOTION, PRESSABLE, PRESSABLE_TEXT, TRANSITION } from '../../config/motion';

interface Option {
    value: string;
    label: string;
    icon?: React.ReactNode;
}

interface CustomSelectProps {
    value: string;
    options: Option[];
    onChange: (value: string) => void;
    placeholder?: string;
    size?: 'sm' | 'md' | 'lg';
    width?: string;
    disabled?: boolean;
    label?: string;
}

const sizeStyles = {
    sm: {
        padding: '6px 10px',
        fontSize: '12px',
        height: '32px',
        iconSize: 14,
    },
    md: {
        padding: '12px 16px',
        fontSize: '16px',
        height: '46px',
        iconSize: 18,
    },
    lg: {
        padding: '10px 14px',
        fontSize: '14px',
        height: '40px',
        iconSize: 18,
    },
};

export default function CustomSelect({
    value,
    options,
    onChange,
    placeholder = '请选择',
    size = 'md',
    width = 'auto',
    disabled = false,
    label,
}: CustomSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [menuStyle, setMenuStyle] = useState({ top: 0, left: 0, width: 0, maxHeight: 280, placement: 'below' as 'above' | 'below' });
    const selectedOption = options.find(opt => opt.value === value);
    const styles = sizeStyles[size];

    const baseId = useId();
    const listboxId = `${baseId}-listbox`;
    const labelId = `${baseId}-label`;
    const optionIdFor = (index: number) => `${baseId}-option-${index}`;

    const updateMenuPosition = () => {
        if (!containerRef.current) {
            return;
        }

        const rect = containerRef.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const spaceBelow = viewportHeight - rect.bottom - 12;
        const spaceAbove = rect.top - 12;
        const shouldOpenAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
        const maxHeight = Math.max(160, Math.min(280, shouldOpenAbove ? spaceAbove : spaceBelow));
        const menuHeight = menuRef.current?.offsetHeight ?? maxHeight;

        setMenuStyle({
            top: shouldOpenAbove ? Math.max(12, rect.top - menuHeight - 6) : rect.bottom + 6,
            left: rect.left,
            width: rect.width,
            maxHeight,
            placement: shouldOpenAbove ? 'above' : 'below',
        });
    };

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                containerRef.current
                && !containerRef.current.contains(target)
                && !menuRef.current?.contains(target)
            ) {
                setIsOpen(false);
                setActiveIndex(-1);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useLayoutEffect(() => {
        if (!isOpen) {
            return;
        }

        updateMenuPosition();
        const rafId = window.requestAnimationFrame(updateMenuPosition);

        const handleViewportChange = () => updateMenuPosition();

        window.addEventListener('resize', handleViewportChange);
        window.addEventListener('scroll', handleViewportChange, true);

        return () => {
            window.cancelAnimationFrame(rafId);
            window.removeEventListener('resize', handleViewportChange);
            window.removeEventListener('scroll', handleViewportChange, true);
        };
    }, [isOpen]);

    // The listbox itself takes focus so arrow keys reach it wherever the portal
    // lands in the DOM; individual rows never receive focus.
    useEffect(() => {
        if (isOpen) {
            menuRef.current?.focus();
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || activeIndex < 0) {
            return;
        }
        document.getElementById(optionIdFor(activeIndex))?.scrollIntoView?.({ block: 'nearest' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, activeIndex]);

    const openMenu = () => {
        if (disabled) {
            return;
        }
        const selectedIndex = options.findIndex(opt => opt.value === value);
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
        setIsOpen(true);
    };

    const closeMenu = ({ returnFocus }: { returnFocus: boolean }) => {
        setIsOpen(false);
        setActiveIndex(-1);
        if (returnFocus) {
            triggerRef.current?.focus();
        }
    };

    const handleSelect = (optValue: string) => {
        onChange(optValue);
        closeMenu({ returnFocus: true });
    };

    const moveActive = (delta: number) => {
        setActiveIndex((prev) => {
            if (options.length === 0) {
                return -1;
            }
            const next = prev + delta;
            if (next < 0) return options.length - 1;
            if (next >= options.length) return 0;
            return next;
        });
    };

    const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (disabled || isOpen) {
            return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
            // Handled here rather than through the synthesised click so Enter and
            // Space cannot toggle the menu twice.
            event.preventDefault();
            openMenu();
        }
    };

    const handleListboxKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                moveActive(1);
                break;
            case 'ArrowUp':
                event.preventDefault();
                moveActive(-1);
                break;
            case 'Home':
                event.preventDefault();
                setActiveIndex(0);
                break;
            case 'End':
                event.preventDefault();
                setActiveIndex(options.length - 1);
                break;
            case 'Enter':
            case ' ':
                event.preventDefault();
                if (activeIndex >= 0 && activeIndex < options.length) {
                    handleSelect(options[activeIndex].value);
                }
                break;
            case 'Escape':
                event.preventDefault();
                closeMenu({ returnFocus: true });
                break;
            case 'Tab':
                // The menu is portaled to <body>, so letting Tab run would drop
                // focus at the end of the document. Collapse back to the trigger
                // and let the next Tab continue from its real position.
                event.preventDefault();
                closeMenu({ returnFocus: true });
                break;
            default:
                break;
        }
    };

    return (
        <div ref={containerRef} style={{ width, position: 'relative' }}>
            {label && (
                <span
                    id={labelId}
                    style={{
                        display: 'block',
                        fontSize: '16px',
                        marginBottom: '10px',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                    }}
                >
                    {label}
                </span>
            )}
            <motion.button
                ref={triggerRef}
                type="button"
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-controls={isOpen ? listboxId : undefined}
                aria-labelledby={label ? labelId : undefined}
                aria-disabled={disabled || undefined}
                onClick={() => (isOpen ? closeMenu({ returnFocus: false }) : openMenu())}
                onKeyDown={handleTriggerKeyDown}
                {...PRESSABLE}
                whileHover={disabled ? {} : { backgroundColor: 'var(--bg-hover)' }}
                whileTap={disabled ? {} : PRESSABLE.whileTap}
                style={{
                    width: '100%',
                    height: styles.height,
                    padding: styles.padding,
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    background: disabled ? 'var(--bg-tertiary)' : 'var(--bg-card)',
                    color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
                    fontSize: styles.fontSize,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    // `background-color` is deliberately absent: framer owns it via
                    // whileHover, and a CSS transition on the same property fights it.
                    transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast), opacity var(--transition-fast)',
                    boxShadow: isOpen ? '0 0 0 2px var(--accent-indigo-alpha, rgba(99, 102, 241, 0.2))' : 'var(--shadow-xs)',
                    opacity: disabled ? 0.6 : 1,
                }}
            >
                <span style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 500,
                }}>
                    {selectedOption?.icon}
                    {selectedOption?.label || placeholder}
                </span>
                <motion.div
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={TRANSITION.normal}
                    style={{ flexShrink: 0 }}
                >
                    <ChevronDown size={styles.iconSize} style={{ opacity: 0.6 }} />
                </motion.div>
            </motion.button>

            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            ref={menuRef}
                            id={listboxId}
                            role="listbox"
                            tabIndex={-1}
                            aria-labelledby={label ? labelId : undefined}
                            aria-activedescendant={activeIndex >= 0 ? optionIdFor(activeIndex) : undefined}
                            onKeyDown={handleListboxKeyDown}
                            data-floating-select-menu="true"
                            {...POPOVER_MOTION}
                            // Placement-aware offsets: the menu always grows from the
                            // trigger's edge, so the sign of `y` follows the placement.
                            initial={{
                                ...POPOVER_MOTION.initial,
                                y: menuStyle.placement === 'above' ? -POPOVER_MOTION.initial.y : POPOVER_MOTION.initial.y,
                            }}
                            exit={{
                                ...POPOVER_MOTION.exit,
                                y: menuStyle.placement === 'above' ? -POPOVER_MOTION.exit.y : POPOVER_MOTION.exit.y,
                            }}
                            style={{
                                position: 'fixed',
                                top: menuStyle.top,
                                left: menuStyle.left,
                                width: menuStyle.width,
                                // Above --z-modal: selects inside the settings dialog
                                // must not be clipped behind it.
                                zIndex: 'var(--z-select)',
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: 'var(--radius-md)',
                                boxShadow: 'var(--shadow-lg)',
                                maxHeight: `${menuStyle.maxHeight}px`,
                                overflowY: 'auto',
                                padding: '6px',
                                transformOrigin: menuStyle.placement === 'above' ? 'bottom center' : 'top center',
                            }}
                        >
                            {options.map((option, index) => (
                                <motion.div
                                    key={option.value}
                                    id={optionIdFor(index)}
                                    role="option"
                                    aria-selected={value === option.value}
                                    // framer adds tabIndex={0} to anything with a tap
                                    // gesture; a listbox option must never be its own
                                    // tab stop — the listbox owns focus for all of them.
                                    tabIndex={-1}
                                    onClick={() => handleSelect(option.value)}
                                    {...PRESSABLE_TEXT}
                                    whileHover={{ backgroundColor: 'var(--bg-hover)' }}
                                    style={{
                                        width: '100%',
                                        padding: styles.padding,
                                        borderRadius: 'var(--radius-sm)',
                                        border: 'none',
                                        background: value === option.value ? 'var(--bg-tertiary)' : 'transparent',
                                        color: 'var(--text-primary)',
                                        fontSize: styles.fontSize,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '10px',
                                        textAlign: 'left',
                                        // The keyboard cursor is drawn with an inset bar
                                        // instead of a background: framer owns
                                        // background-color through whileHover and would
                                        // otherwise overwrite it.
                                        boxShadow: index === activeIndex
                                            ? 'inset 2px 0 0 var(--accent-indigo)'
                                            : 'none',
                                        // Same reasoning as the trigger: framer drives
                                        // background-color, CSS only handles colour.
                                        transition: 'color var(--transition-fast), box-shadow var(--transition-fast)',
                                    }}
                                >
                                    <span style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}>
                                        {option.icon}
                                        {option.label}
                                    </span>
                                    {value === option.value && (
                                        <Check size={16} style={{ color: 'var(--accent-indigo)', flexShrink: 0 }} />
                                    )}
                                </motion.div>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body,
            )}
        </div>
    );
}
