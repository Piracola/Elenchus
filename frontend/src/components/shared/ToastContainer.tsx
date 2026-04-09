import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle, CheckCircle, Info } from 'lucide-react';
import type { ToastType } from '../../utils/chat/toast';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContainerProps {
    toasts: Toast[];
    removeToast: (id: string) => void;
}

export function ToastContainer({ toasts, removeToast }: ToastContainerProps) {
    const getIcon = (type: ToastType) => {
        switch (type) {
            case 'success': return <CheckCircle size={16} />;
            case 'error': return <AlertCircle size={16} />;
            default: return <Info size={16} />;
        }
    };

    const getColors = (type: ToastType) => {
        switch (type) {
            case 'success': return {
                bg: 'rgba(52, 199, 89, 0.1)',
                border: 'var(--accent-emerald)',
                color: 'var(--accent-emerald)',
            };
            case 'error': return {
                bg: 'rgba(239, 68, 68, 0.1)',
                border: 'var(--accent-rose)',
                color: 'var(--accent-rose)',
            };
            default: return {
                bg: 'var(--bg-tertiary)',
                border: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
            };
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxWidth: '360px',
        }}>
            <AnimatePresence>
                {toasts.map(toast => {
                    const colors = getColors(toast.type);
                    return (
                        <motion.div
                            key={toast.id}
                            initial={{ opacity: 0, x: 50, scale: 0.9 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 50, scale: 0.9 }}
                            transition={{ duration: 0.2 }}
                            style={{
                                padding: '12px 16px',
                                background: colors.bg,
                                border: `1px solid ${colors.border}`,
                                borderRadius: 'var(--radius-lg)',
                                boxShadow: 'var(--shadow-md)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                            }}
                        >
                            <span style={{ color: colors.color, flexShrink: 0 }}>
                                {getIcon(toast.type)}
                            </span>
                            <span style={{
                                flex: 1,
                                fontSize: '13px',
                                color: 'var(--text-primary)',
                            }}>
                                {toast.message}
                            </span>
                            <button
                                onClick={() => removeToast(toast.id)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--text-muted)',
                                    padding: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                }}
                            >
                                <X size={14} />
                            </button>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}
