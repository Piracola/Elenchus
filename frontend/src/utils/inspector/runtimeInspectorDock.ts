export type RuntimeInspectorPanelId = 'timeline' | 'graph' | 'memory';

export type RuntimeInspectorPanelSize = {
    width: number;
    height: number;
};

type RuntimeInspectorPanelSizeMap = Record<RuntimeInspectorPanelId, RuntimeInspectorPanelSize>;

export const RUNTIME_INSPECTOR_PANEL_STORAGE_KEY = 'elenchus:runtime-inspector-panels';
export const RUNTIME_INSPECTOR_PANEL_RESET_EVENT = 'elenchus:runtime-inspector-panels-reset';
export const RUNTIME_INSPECTOR_PANEL_MIN_SIZE: RuntimeInspectorPanelSize = {
    width: 320,
    height: 280,
};

export const DEFAULT_RUNTIME_INSPECTOR_PANEL_SIZES: RuntimeInspectorPanelSizeMap = {
    timeline: { width: 980, height: 520 },
    graph: { width: 820, height: 430 },
    memory: { width: 860, height: 470 },
};

function normalizePanelSize(
    size: Partial<RuntimeInspectorPanelSize> | null | undefined,
    fallback: RuntimeInspectorPanelSize,
): RuntimeInspectorPanelSize {
    const width = typeof size?.width === 'number' && Number.isFinite(size.width)
        ? Math.max(RUNTIME_INSPECTOR_PANEL_MIN_SIZE.width, Math.round(size.width))
        : fallback.width;
    const height = typeof size?.height === 'number' && Number.isFinite(size.height)
        ? Math.max(RUNTIME_INSPECTOR_PANEL_MIN_SIZE.height, Math.round(size.height))
        : fallback.height;

    return { width, height };
}

export function readStoredRuntimeInspectorPanelSizes(): Partial<Record<RuntimeInspectorPanelId, RuntimeInspectorPanelSize>> {
    if (typeof window === 'undefined') {
        return {};
    }

    const raw = window.localStorage.getItem(RUNTIME_INSPECTOR_PANEL_STORAGE_KEY);
    if (!raw) {
        return {};
    }

    try {
        const parsed = JSON.parse(raw) as Partial<Record<RuntimeInspectorPanelId, Partial<RuntimeInspectorPanelSize>>>;
        return {
            timeline: normalizePanelSize(parsed.timeline, DEFAULT_RUNTIME_INSPECTOR_PANEL_SIZES.timeline),
            graph: normalizePanelSize(parsed.graph, DEFAULT_RUNTIME_INSPECTOR_PANEL_SIZES.graph),
            memory: normalizePanelSize(parsed.memory, DEFAULT_RUNTIME_INSPECTOR_PANEL_SIZES.memory),
        };
    } catch {
        return {};
    }
}

export function getRuntimeInspectorPanelSize(panel: RuntimeInspectorPanelId): RuntimeInspectorPanelSize {
    const stored = readStoredRuntimeInspectorPanelSizes();
    return stored[panel] ?? DEFAULT_RUNTIME_INSPECTOR_PANEL_SIZES[panel];
}

export function writeStoredRuntimeInspectorPanelSize(
    panel: RuntimeInspectorPanelId,
    size: RuntimeInspectorPanelSize,
): void {
    if (typeof window === 'undefined') {
        return;
    }

    const stored = readStoredRuntimeInspectorPanelSizes();
    const next = {
        ...stored,
        [panel]: normalizePanelSize(size, DEFAULT_RUNTIME_INSPECTOR_PANEL_SIZES[panel]),
    };

    window.localStorage.setItem(RUNTIME_INSPECTOR_PANEL_STORAGE_KEY, JSON.stringify(next));
}

export function resetStoredRuntimeInspectorPanelSizes(): void {
    if (typeof window === 'undefined') {
        return;
    }

    window.localStorage.removeItem(RUNTIME_INSPECTOR_PANEL_STORAGE_KEY);
    window.dispatchEvent(new Event(RUNTIME_INSPECTOR_PANEL_RESET_EVENT));
}
