import type { MutableRefObject } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import RuntimeInspector from './RuntimeInspector';
import {
    FLOATING_INSPECTOR_RESIZE_HANDLES,
    getCollapsedFloatingInspectorSize,
    type FloatingInspectorInteraction,
    type FloatingInspectorRect,
    type FloatingInspectorResizeHandle,
} from '../../utils/inspector/floatingInspectorLayout';

type FloatingRuntimeInspectorProps = {
    floatingInspectorRect: FloatingInspectorRect | null;
    floatingInspectorExpanded: boolean;
    floatingInspectorActive: boolean;
    floatingInspectorInteractionRef: MutableRefObject<FloatingInspectorInteraction | null>;
    onMoveStart: (event: ReactPointerEvent<HTMLElement>) => void;
    onResizeStart: (handle: FloatingInspectorResizeHandle) => (event: ReactPointerEvent<HTMLElement>) => void;
    onExpandedChange: (expanded: boolean) => void;
};

export default function FloatingRuntimeInspector({
    floatingInspectorRect,
    floatingInspectorExpanded,
    floatingInspectorActive,
    floatingInspectorInteractionRef,
    onMoveStart,
    onResizeStart,
    onExpandedChange,
}: FloatingRuntimeInspectorProps) {
    if (!floatingInspectorRect) {
        return null;
    }

    const collapsedSize = getCollapsedFloatingInspectorSize();
    void floatingInspectorInteractionRef;

    return (
        <div
            style={{
                position: 'absolute',
                left: `${floatingInspectorRect.x}px`,
                top: `${floatingInspectorRect.y}px`,
                zIndex: 10000,
                width: floatingInspectorExpanded ? `${floatingInspectorRect.width}px` : `${collapsedSize.width}px`,
                height: floatingInspectorExpanded ? `${floatingInspectorRect.height}px` : `${collapsedSize.height}px`,
                pointerEvents: 'auto',
            }}
        >
            <div
                style={{
                    position: 'relative',
                    width: '100%',
                    height: '100%',
                    overflow: floatingInspectorExpanded ? 'hidden' : 'visible',
                }}
            >
                <div
                    onPointerDown={onMoveStart}
                    title="拖动运行观察器"
                    style={{
                        position: 'absolute',
                        top: floatingInspectorExpanded ? '8px' : '-10px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 3,
                        width: '52px',
                        height: '16px',
                        borderRadius: '999px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        cursor: floatingInspectorActive ? 'grabbing' : 'grab',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--glass-bg)',
                        backdropFilter: 'blur(10px)',
                        boxShadow: floatingInspectorExpanded
                            ? '0 6px 18px rgba(15, 23, 42, 0.12)'
                            : '0 2px 8px rgba(15, 23, 42, 0.10)',
                        userSelect: 'none',
                        touchAction: 'none',
                    }}
                >
                    {[0, 1, 2].map((dot) => (
                        <span
                            key={`floating-grip-${dot}`}
                            style={{
                                width: '4px',
                                height: '4px',
                                borderRadius: '999px',
                                background: 'var(--text-muted)',
                            }}
                        />
                    ))}
                </div>
                {floatingInspectorExpanded && FLOATING_INSPECTOR_RESIZE_HANDLES.map((handle) => (
                    <div
                        key={handle.key}
                        onPointerDown={onResizeStart(handle.key)}
                        style={{
                            position: 'absolute',
                            zIndex: 2,
                            touchAction: 'none',
                            ...handle.style,
                        }}
                    />
                ))}

                <div
                    style={{
                        width: floatingInspectorExpanded ? '100%' : 'auto',
                        height: floatingInspectorExpanded ? '100%' : 'auto',
                        borderRadius: 'var(--radius-lg)',
                        overflow: floatingInspectorExpanded ? 'hidden' : 'visible',
                        boxSizing: 'border-box',
                        boxShadow: floatingInspectorExpanded
                            ? (
                                floatingInspectorActive
                                    ? '0 20px 48px rgba(15, 23, 42, 0.18)'
                                    : '0 14px 34px rgba(15, 23, 42, 0.12)'
                            )
                            : 'none',
                    }}
                >
                    <RuntimeInspector
                        key="floating-inspector"
                        defaultExpanded={floatingInspectorExpanded}
                        fillHeight={floatingInspectorExpanded}
                        onExpandedChange={onExpandedChange}
                    />
                </div>
            </div>
        </div>
    );
}
