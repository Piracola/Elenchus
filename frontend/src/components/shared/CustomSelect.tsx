/**
 * CustomSelect — 自定义下拉选择组件
 * 替代原生select，提供统一的视觉风格和交互体验
 */

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';
import { createPortal } from 'react-dom';

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
    const containerRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [menuStyle, setMenuStyle] = useState({ top: 0, left: 0, width: 0, maxHeight: 280, placement: 'below' as 'above' | 'below' });
    const selectedOption = options.find(opt => opt.value === value);
    const styles = sizeStyles[size];

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

    const handleSelect = (optValue: string) => {
        onChange(optValue);
        setIsOpen(false);
    };

    return (
        <div ref={containerRef} style={{ width, position: 'relative' }}>
            {label && (
                <label style={{
                    display: 'block',
                    fontSize: '16px',
                    marginBottom: '10px',
                    color: 'var(--text-secondary)',
                    fontWeight: 600,
                }}>
                    {label}
                </label>
            )}
            <motion.button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                whileHover={disabled ? {} : { backgroundColor: 'var(--bg-hover)' }}
                whileTap={disabled ? {} : { scale: 0.98 }}
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
                    outline: 'none',
                    transition: 'all 0.15s ease',
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
                    transition={{ duration: 0.2 }}
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
                            initial={{ opacity: 0, y: menuStyle.placement === 'above' ? 8 : -8, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: menuStyle.placement === 'above' ? 8 : -8, scale: 0.96 }}
                            transition={{ duration: 0.15, ease: 'easeOut' }}
                            style={{
                                position: 'fixed',
                                top: menuStyle.top,
                                left: menuStyle.left,
                                width: menuStyle.width,
                                zIndex: 3000,
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
                            {options.map((option) => (
                                <motion.button
                                    key={option.value}
                                    type="button"
                                    onClick={() => handleSelect(option.value)}
                                    whileHover={{ backgroundColor: 'var(--bg-hover)' }}
                                    whileTap={{ scale: 0.98 }}
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
                                        transition: 'all 0.1s ease',
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
                                </motion.button>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body,
            )}
        </div>
    );
}
