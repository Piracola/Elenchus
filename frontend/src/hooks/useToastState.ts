import { useState, useEffect } from 'react';
import type { ToastType } from '../utils/toast';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface Window {
    __elenchusToast?: (message: string, type?: ToastType) => void;
}

export function useToastState() {
    const [toasts, setToasts] = useState<Toast[]>([]);

    useEffect(() => {
        const handleToast = (message: string, type: ToastType = 'info') => {
            const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            setToasts(prev => [...prev, { id, message, type }]);
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id));
            }, 4000);
        };

        (window as Window).__elenchusToast = handleToast;
        return () => {
            (window as Window).__elenchusToast = undefined;
        };
    }, []);

    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    return { toasts, removeToast };
}
