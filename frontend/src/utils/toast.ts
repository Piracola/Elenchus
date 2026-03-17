export type ToastType = 'success' | 'error' | 'info';

declare global {
    interface Window {
        __elenchusToast?: (message: string, type?: ToastType) => void;
    }
}

export function toast(message: string, type: ToastType = 'info') {
    if (window.__elenchusToast) {
        window.__elenchusToast(message, type);
    } else {
        console.log(`[Toast ${type}] ${message}`);
    }
}
