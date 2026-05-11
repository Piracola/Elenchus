import { act, renderHook } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    FLOATING_INSPECTOR_STORAGE_KEY,
} from '../../utils/inspector/floatingInspector';
import {
    createCollapsedFloatingInspectorRect,
    createTopDockedFloatingInspectorRect,
    getCollapsedFloatingInspectorSize,
} from '../../utils/inspector/floatingInspectorLayout';
import { useFloatingInspectorState } from './useFloatingInspectorState';

class MockResizeObserver {
    observe() {}
    disconnect() {}
    unobserve() {}
}

function createPanelElement(width = 900, left = 0, top = 0) {
    const element = document.createElement('div');
    Object.defineProperty(element, 'clientWidth', {
        configurable: true,
        value: width,
    });
    element.getBoundingClientRect = () => ({
        x: left,
        y: top,
        left,
        top,
        right: left + width,
        bottom: top,
        width,
        height: 0,
        toJSON: () => ({}),
    });
    return element;
}

async function flushLayout() {
    await act(async () => {
        await Promise.resolve();
    });
}

function dispatchPointerEvent(type: string, clientX: number, clientY: number) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
        clientX: {
            configurable: true,
            value: clientX,
        },
        clientY: {
            configurable: true,
            value: clientY,
        },
    });
    window.dispatchEvent(event);
}

async function dispatchPointerEventAndFlush(type: string, clientX: number, clientY: number) {
    await act(async () => {
        dispatchPointerEvent(type, clientX, clientY);
        await Promise.resolve();
    });
}

function createPointerEvent(clientX: number, clientY: number) {
    return {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX,
        clientY,
    } as unknown as ReactPointerEvent<HTMLElement>;
}

describe('useFloatingInspectorState', () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    const originalResizeObserver = globalThis.ResizeObserver;
    const originalActEnvironment = (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;

    beforeEach(() => {
        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            value: 1440,
        });
        Object.defineProperty(window, 'innerHeight', {
            configurable: true,
            value: 900,
        });
        Object.defineProperty(globalThis, 'ResizeObserver', {
            configurable: true,
            value: MockResizeObserver,
        });
        (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
        window.localStorage.clear();
    });

    afterEach(() => {
        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            value: originalInnerWidth,
        });
        Object.defineProperty(window, 'innerHeight', {
            configurable: true,
            value: originalInnerHeight,
        });
        Object.defineProperty(globalThis, 'ResizeObserver', {
            configurable: true,
            value: originalResizeObserver,
        });
        (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
        vi.restoreAllMocks();
    });

    it('starts collapsed at the top-right edge and tracks the panel viewport offset', async () => {
        const panelRef = { current: createPanelElement(900, 120, 56) };
        const { result } = renderHook(() => useFloatingInspectorState({
            panelRef,
            messageWidth: 'comfortable',
            topOverlayHeight: 64,
        }));

        await flushLayout();

        expect(result.current.floatingInspectorRect).toEqual(
            createCollapsedFloatingInspectorRect({ width: 900, height: 900 }, 72),
        );
        expect(result.current.floatingInspectorViewportOffset).toEqual({
            left: 120,
            top: 56,
        });
        expect(result.current.floatingInspectorExpanded).toBe(false);
        expect(result.current.floatingInspectorTopDocked).toBe(false);
        expect(result.current.floatingInspectorLayoutMode).toBe('collapsed');
    });

    it('uses the panel top offset when deriving available floating height', async () => {
        const panelRef = { current: createPanelElement(900, 40, 120) };
        const { result } = renderHook(() => useFloatingInspectorState({
            panelRef,
            messageWidth: 'comfortable',
            topOverlayHeight: 64,
        }));

        await flushLayout();

        act(() => {
            result.current.handleFloatingInspectorExpandedChange(true);
        });
        await flushLayout();

        expect(result.current.floatingInspectorViewportOffset).toEqual({
            left: 40,
            top: 120,
        });
        expect(result.current.floatingInspectorRect).toEqual(
            createTopDockedFloatingInspectorRect({ width: 900, height: 780 }, 72),
        );
    });

    it('expands into the top-docked layout by default', async () => {
        const panelRef = { current: createPanelElement() };
        const { result } = renderHook(() => useFloatingInspectorState({
            panelRef,
            messageWidth: 'comfortable',
            topOverlayHeight: 64,
        }));

        await flushLayout();

        act(() => {
            result.current.handleFloatingInspectorExpandedChange(true);
        });
        await flushLayout();

        expect(result.current.floatingInspectorExpanded).toBe(true);
        expect(result.current.floatingInspectorTopDocked).toBe(true);
        expect(result.current.floatingInspectorLayoutMode).toBe('top-docked');
        expect(result.current.floatingInspectorRect).toEqual(
            createTopDockedFloatingInspectorRect({ width: 900, height: 900 }, 72),
        );
    });

    it('preserves a user-chosen collapsed position across expand, collapse, and re-expand', async () => {
        const storedCollapsedRect = {
            x: 620,
            y: 188,
            width: 148,
            height: 38,
        };
        window.localStorage.setItem(FLOATING_INSPECTOR_STORAGE_KEY, JSON.stringify(storedCollapsedRect));

        const panelRef = { current: createPanelElement() };
        const { result } = renderHook(() => useFloatingInspectorState({
            panelRef,
            messageWidth: 'comfortable',
            topOverlayHeight: 64,
        }));

        await flushLayout();

        expect(result.current.floatingInspectorRect).toMatchObject(storedCollapsedRect);

        act(() => {
            result.current.handleFloatingInspectorExpandedChange(true);
        });
        await flushLayout();

        const expandedRect = result.current.floatingInspectorRect;
        expect(expandedRect).not.toBeNull();

        act(() => {
            result.current.handleFloatingInspectorMoveStart(
                createPointerEvent(expandedRect?.x ?? 0, expandedRect?.y ?? 0),
            );
        });

        expect(result.current.floatingInspectorInteractionRef.current?.mode).toBe('move');
        expect(result.current.floatingInspectorTopDocked).toBe(true);
        expect(result.current.floatingInspectorLayoutMode).toBe('top-docked');

        await dispatchPointerEventAndFlush('pointermove', (expandedRect?.x ?? 0) - 140, (expandedRect?.y ?? 0) + 120);
        await dispatchPointerEventAndFlush('pointerup', (expandedRect?.x ?? 0) - 140, (expandedRect?.y ?? 0) + 120);

        const movedRect = result.current.floatingInspectorRect;
        expect(movedRect).not.toBeNull();
        expect(movedRect?.y).not.toBe(expandedRect?.y);
        expect(movedRect?.width).toBe(expandedRect?.width);
        expect(result.current.floatingInspectorTopDocked).toBe(false);
        expect(result.current.floatingInspectorLayoutMode).toBe('floating');
        expect(result.current.floatingInspectorInteractionRef.current).toBeNull();

        act(() => {
            result.current.handleFloatingInspectorExpandedChange(false);
        });
        await flushLayout();

        expect(result.current.floatingInspectorExpanded).toBe(false);
        expect(result.current.floatingInspectorRect).toMatchObject({
            x: storedCollapsedRect.x,
            y: storedCollapsedRect.y,
            width: getCollapsedFloatingInspectorSize().width,
            height: getCollapsedFloatingInspectorSize().height,
        });

        act(() => {
            result.current.handleFloatingInspectorExpandedChange(true);
        });
        await flushLayout();

        expect(result.current.floatingInspectorExpanded).toBe(true);
        expect(result.current.floatingInspectorTopDocked).toBe(false);
        expect(result.current.floatingInspectorLayoutMode).toBe('floating');
        expect(result.current.floatingInspectorRect).toMatchObject(movedRect ?? {});
    });

    it('allows resizing the expanded inspector and reuses the resized rect when expanded again', async () => {
        const panelRef = { current: createPanelElement() };
        const { result } = renderHook(() => useFloatingInspectorState({
            panelRef,
            messageWidth: 'comfortable',
            topOverlayHeight: 64,
        }));

        await flushLayout();

        act(() => {
            result.current.handleFloatingInspectorExpandedChange(true);
        });
        await flushLayout();

        const expandedRect = result.current.floatingInspectorRect;
        expect(expandedRect).not.toBeNull();

        act(() => {
            result.current.handleFloatingInspectorResizeStart('bottom-right')(
                createPointerEvent(
                    (expandedRect?.x ?? 0) + (expandedRect?.width ?? 0),
                    (expandedRect?.y ?? 0) + (expandedRect?.height ?? 0),
                ),
            );
        });

        expect(result.current.floatingInspectorInteractionRef.current?.mode).toBe('resize');
        expect(result.current.floatingInspectorTopDocked).toBe(true);
        expect(result.current.floatingInspectorLayoutMode).toBe('top-docked');

        await dispatchPointerEventAndFlush(
            'pointermove',
            (expandedRect?.x ?? 0) + (expandedRect?.width ?? 0) - 180,
            (expandedRect?.y ?? 0) + (expandedRect?.height ?? 0) - 140,
        );
        await dispatchPointerEventAndFlush(
            'pointerup',
            (expandedRect?.x ?? 0) + (expandedRect?.width ?? 0) - 180,
            (expandedRect?.y ?? 0) + (expandedRect?.height ?? 0) - 140,
        );

        const resizedRect = result.current.floatingInspectorRect;
        expect(resizedRect).not.toBeNull();
        expect(resizedRect?.width).toBeLessThan(expandedRect?.width ?? Number.POSITIVE_INFINITY);
        expect(resizedRect?.height).toBeLessThan(expandedRect?.height ?? Number.POSITIVE_INFINITY);
        expect(result.current.floatingInspectorTopDocked).toBe(false);
        expect(result.current.floatingInspectorLayoutMode).toBe('floating');

        act(() => {
            result.current.handleFloatingInspectorExpandedChange(false);
        });
        await flushLayout();

        act(() => {
            result.current.handleFloatingInspectorExpandedChange(true);
        });
        await flushLayout();

        expect(result.current.floatingInspectorTopDocked).toBe(false);
        expect(result.current.floatingInspectorLayoutMode).toBe('floating');
        expect(result.current.floatingInspectorRect).toMatchObject(resizedRect ?? {});
    });

    it('restores the stored collapsed position on remount without inflating the collapsed size', async () => {
        const storedRect = {
            x: 640,
            y: 88,
            width: 148,
            height: 38,
        };
        window.localStorage.setItem(FLOATING_INSPECTOR_STORAGE_KEY, JSON.stringify(storedRect));

        const panelRef = { current: createPanelElement() };
        const { result, unmount } = renderHook(() => useFloatingInspectorState({
            panelRef,
            messageWidth: 'comfortable',
            topOverlayHeight: 64,
        }));

        await flushLayout();
        expect(result.current.floatingInspectorRect).toMatchObject(storedRect);
        expect(result.current.floatingInspectorRect).toMatchObject(getCollapsedFloatingInspectorSize());

        unmount();

        const next = renderHook(() => useFloatingInspectorState({
            panelRef,
            messageWidth: 'comfortable',
            topOverlayHeight: 64,
        }));
        await flushLayout();
        expect(next.result.current.floatingInspectorRect).toMatchObject(storedRect);
    });

    it('persists a user-moved collapsed position across remount', async () => {
        const panelRef = { current: createPanelElement() };
        const { result, unmount } = renderHook(() => useFloatingInspectorState({
            panelRef,
            messageWidth: 'comfortable',
            topOverlayHeight: 64,
        }));

        await flushLayout();

        act(() => {
            result.current.handleFloatingInspectorMoveStart(createPointerEvent(760, 72));
        });
        await dispatchPointerEventAndFlush('pointermove', 620, 180);
        await dispatchPointerEventAndFlush('pointerup', 620, 180);

        const movedCollapsedRect = result.current.floatingInspectorRect;
        expect(movedCollapsedRect).not.toBeNull();
        expect(window.localStorage.getItem(FLOATING_INSPECTOR_STORAGE_KEY)).toContain(`"x":${movedCollapsedRect?.x}`);
        expect(window.localStorage.getItem(FLOATING_INSPECTOR_STORAGE_KEY)).toContain(`"y":${movedCollapsedRect?.y}`);

        unmount();

        const next = renderHook(() => useFloatingInspectorState({
            panelRef,
            messageWidth: 'comfortable',
            topOverlayHeight: 64,
        }));
        await flushLayout();

        expect(next.result.current.floatingInspectorRect).toMatchObject({
            x: movedCollapsedRect?.x,
            y: movedCollapsedRect?.y,
            width: getCollapsedFloatingInspectorSize().width,
            height: getCollapsedFloatingInspectorSize().height,
        });
    });

    it('clears the floating overlay on small screens and rebuilds the remembered collapsed position when wide layout returns', async () => {
        const storedCollapsedRect = {
            x: 612,
            y: 204,
            width: 148,
            height: 38,
        };
        window.localStorage.setItem(FLOATING_INSPECTOR_STORAGE_KEY, JSON.stringify(storedCollapsedRect));

        const panelRef = { current: createPanelElement() };
        const { result } = renderHook(() => useFloatingInspectorState({
            panelRef,
            messageWidth: 'comfortable',
            topOverlayHeight: 64,
        }));

        await flushLayout();

        expect(result.current.floatingInspectorRect).toMatchObject(storedCollapsedRect);

        act(() => {
            result.current.handleFloatingInspectorExpandedChange(true);
        });
        await flushLayout();

        act(() => {
            result.current.handleFloatingInspectorMoveStart(createPointerEvent(20, 80));
        });
        await dispatchPointerEventAndFlush('pointermove', 180, 220);
        await dispatchPointerEventAndFlush('pointerup', 180, 220);

        const floatingRectBeforeSmallScreen = result.current.floatingInspectorRect;
        expect(result.current.floatingInspectorTopDocked).toBe(false);
        expect(floatingRectBeforeSmallScreen).not.toBeNull();

        act(() => {
            Object.defineProperty(window, 'innerWidth', {
                configurable: true,
                value: 1024,
            });
            window.dispatchEvent(new Event('resize'));
        });
        await flushLayout();

        expect(result.current.isWideLayout).toBe(false);
        expect(result.current.floatingInspectorExpanded).toBe(false);
        expect(result.current.floatingInspectorLayoutMode).toBe('collapsed');
        expect(result.current.floatingInspectorRect).toBeNull();

        act(() => {
            Object.defineProperty(window, 'innerWidth', {
                configurable: true,
                value: 1440,
            });
            window.dispatchEvent(new Event('resize'));
        });
        await flushLayout();

        expect(result.current.isWideLayout).toBe(true);
        expect(result.current.floatingInspectorExpanded).toBe(false);
        expect(result.current.floatingInspectorLayoutMode).toBe('collapsed');
        expect(result.current.floatingInspectorRect).toMatchObject({
            x: storedCollapsedRect.x,
            y: storedCollapsedRect.y,
            width: getCollapsedFloatingInspectorSize().width,
            height: getCollapsedFloatingInspectorSize().height,
        });

        act(() => {
            result.current.handleFloatingInspectorExpandedChange(true);
        });
        await flushLayout();

        expect(result.current.floatingInspectorExpanded).toBe(true);
        expect(result.current.floatingInspectorTopDocked).toBe(false);
        expect(result.current.floatingInspectorLayoutMode).toBe('floating');
        expect(result.current.floatingInspectorRect).toMatchObject(floatingRectBeforeSmallScreen ?? {});
    });

    it('restores the top-docked expanded state after a narrow-layout detour', async () => {
        const panelRef = { current: createPanelElement() };
        const { result } = renderHook(() => useFloatingInspectorState({
            panelRef,
            messageWidth: 'comfortable',
            topOverlayHeight: 64,
        }));

        await flushLayout();

        act(() => {
            result.current.handleFloatingInspectorExpandedChange(true);
        });
        await flushLayout();

        expect(result.current.floatingInspectorLayoutMode).toBe('top-docked');
        const topDockedRect = result.current.floatingInspectorRect;

        act(() => {
            Object.defineProperty(window, 'innerWidth', {
                configurable: true,
                value: 1024,
            });
            window.dispatchEvent(new Event('resize'));
        });
        await flushLayout();

        expect(result.current.isWideLayout).toBe(false);
        expect(result.current.floatingInspectorExpanded).toBe(false);
        expect(result.current.floatingInspectorRect).toBeNull();

        act(() => {
            Object.defineProperty(window, 'innerWidth', {
                configurable: true,
                value: 1440,
            });
            window.dispatchEvent(new Event('resize'));
        });
        await flushLayout();

        act(() => {
            result.current.handleFloatingInspectorExpandedChange(true);
        });
        await flushLayout();

        expect(result.current.floatingInspectorExpanded).toBe(true);
        expect(result.current.floatingInspectorTopDocked).toBe(true);
        expect(result.current.floatingInspectorLayoutMode).toBe('top-docked');
        expect(result.current.floatingInspectorRect).toEqual(topDockedRect);
    });

    it('does not snap a restored collapsed inspector upward on the first drag movement', async () => {
        const storedRect = {
            x: 640,
            y: 240,
            width: 148,
            height: 38,
        };
        window.localStorage.setItem(FLOATING_INSPECTOR_STORAGE_KEY, JSON.stringify(storedRect));

        const panelRef = { current: createPanelElement() };
        const { result } = renderHook(() => useFloatingInspectorState({
            panelRef,
            messageWidth: 'comfortable',
            topOverlayHeight: 64,
        }));

        await flushLayout();

        act(() => {
            result.current.handleFloatingInspectorMoveStart(
                createPointerEvent(storedRect.x, storedRect.y),
            );
        });

        await dispatchPointerEventAndFlush('pointermove', storedRect.x + 12, storedRect.y + 20);
        await dispatchPointerEventAndFlush('pointerup', storedRect.x + 12, storedRect.y + 20);

        expect(result.current.floatingInspectorRect?.y).toBeGreaterThan(storedRect.y);
    });

    it('keeps top-docked mode after a no-op drag interaction', async () => {
        const panelRef = { current: createPanelElement() };
        const { result } = renderHook(() => useFloatingInspectorState({
            panelRef,
            messageWidth: 'comfortable',
            topOverlayHeight: 64,
        }));

        await flushLayout();

        act(() => {
            result.current.handleFloatingInspectorExpandedChange(true);
        });
        await flushLayout();

        const expandedRect = result.current.floatingInspectorRect;
        act(() => {
            result.current.handleFloatingInspectorMoveStart(
                createPointerEvent(expandedRect?.x ?? 0, expandedRect?.y ?? 0),
            );
        });
        await dispatchPointerEventAndFlush('pointerup', expandedRect?.x ?? 0, expandedRect?.y ?? 0);

        expect(result.current.floatingInspectorTopDocked).toBe(true);
        expect(result.current.floatingInspectorLayoutMode).toBe('top-docked');
    });

    it('keeps top-docked mode after a no-op resize interaction', async () => {
        const panelRef = { current: createPanelElement() };
        const { result } = renderHook(() => useFloatingInspectorState({
            panelRef,
            messageWidth: 'comfortable',
            topOverlayHeight: 64,
        }));

        await flushLayout();

        act(() => {
            result.current.handleFloatingInspectorExpandedChange(true);
        });
        await flushLayout();

        const expandedRect = result.current.floatingInspectorRect;
        act(() => {
            result.current.handleFloatingInspectorResizeStart('bottom-right')(
                createPointerEvent(
                    (expandedRect?.x ?? 0) + (expandedRect?.width ?? 0),
                    (expandedRect?.y ?? 0) + (expandedRect?.height ?? 0),
                ),
            );
        });
        await dispatchPointerEventAndFlush(
            'pointerup',
            (expandedRect?.x ?? 0) + (expandedRect?.width ?? 0),
            (expandedRect?.y ?? 0) + (expandedRect?.height ?? 0),
        );

        expect(result.current.floatingInspectorTopDocked).toBe(true);
        expect(result.current.floatingInspectorLayoutMode).toBe('top-docked');
    });
});
