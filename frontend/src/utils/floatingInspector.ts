export const FLOATING_INSPECTOR_STORAGE_KEY = 'elenchus:floating-inspector-rect';
export const FLOATING_INSPECTOR_RESET_EVENT = 'elenchus:floating-inspector-reset';

export function resetStoredFloatingInspectorRect(): void {
    if (typeof window === 'undefined') {
        return;
    }

    window.localStorage.removeItem(FLOATING_INSPECTOR_STORAGE_KEY);
    window.dispatchEvent(new Event(FLOATING_INSPECTOR_RESET_EVENT));
}
