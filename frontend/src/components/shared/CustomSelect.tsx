/**
 * CustomSelect — 自定义下拉选择组件
 * 替代原生select，提供统一的视觉风格和交互体验
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';

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
        padding: '8px 12px',
        fontSize: '13px',
        height: '36px',
        iconSize: 16,
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
    const selectedOption = options.find(opt => opt.value === value);
    const styles = sizeStyles[size];

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (optValue: string) => {
        onChange(optValue);
        setIsOpen(false);
    };

    return (
        <div ref={containerRef} style={{ width, position: 'relative' }}>
            {label && (
                <label style={{
                    display: 'block',
                    fontSize: '12px',
                    marginBottom: '4px',
                    color: 'var(--text-secondary)',
                    fontWeight: 500,
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

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.96 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        style={{
                            position: 'absolute',
                            top: 'calc(100% + 4px)',
                            left: 0,
                            right: 0,
                            zIndex: 100,
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-md)',
                            boxShadow: 'var(--shadow-lg)',
                            maxHeight: '240px',
                            overflowY: 'auto',
                            padding: '4px',
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
                                    gap: '8px',
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
                                    <Check size={14} style={{ color: 'var(--accent-indigo)', flexShrink: 0 }} />
                                )}
                            </motion.button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
