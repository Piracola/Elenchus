const MODEL_CONFIGS_CHANGED_EVENT = 'elenchus:model-configs-changed';

export function notifyModelConfigsChanged(): void {
    if (typeof window === 'undefined') {
        return;
    }
    window.dispatchEvent(new Event(MODEL_CONFIGS_CHANGED_EVENT));
}

export function subscribeModelConfigsChanged(handler: () => void): () => void {
    if (typeof window === 'undefined') {
        return () => undefined;
    }

    window.addEventListener(MODEL_CONFIGS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(MODEL_CONFIGS_CHANGED_EVENT, handler);
}
