import type { PointerEvent as ReactPointerEvent } from 'react';
import RuntimeInspector from './RuntimeInspector';
import {
    FLOATING_INSPECTOR_RESIZE_HANDLES,
    getCollapsedFloatingInspectorSize,
    type FloatingInspectorRect,
    type FloatingInspectorResizeHandle,
    type FloatingInspectorViewportOffset,
} from '../../utils/inspector/floatingInspectorLayout';

type FloatingRuntimeInspectorProps = {
    floatingInspectorRect: FloatingInspectorRect | null;
    floatingInspectorViewportOffset: FloatingInspectorViewportOffset;
    floatingInspectorExpanded: boolean;
    floatingInspectorActive: boolean;
    onMoveStart: (event: ReactPointerEvent<HTMLElement>) => void;
    onResizeStart: (handle: FloatingInspectorResizeHandle) => (event: ReactPointerEvent<HTMLElement>) => void;
    onExpandedChange: (expanded: boolean) => void;
};

export default function FloatingRuntimeInspector({
    floatingInspectorRect,
    floatingInspectorViewportOffset,
    floatingInspectorExpanded,
    floatingInspectorActive,
    onMoveStart,
    onResizeStart,
    onExpandedChange,
}: FloatingRuntimeInspectorProps) {
    if (!floatingInspectorRect) {
        return null;
    }

    const collapsedSize = getCollapsedFloatingInspectorSize();
    const showDragHandle = true;
    const wrapperWidth = floatingInspectorExpanded ? floatingInspectorRect.width : collapsedSize.width;
    const wrapperHeight = floatingInspectorExpanded ? floatingInspectorRect.height : collapsedSize.height;

    return (
        <div
            style={{
                position: 'fixed',
                left: `${floatingInspectorViewportOffset.left + floatingInspectorRect.x}px`,
                top: `${floatingInspectorViewportOffset.top + floatingInspectorRect.y}px`,
                zIndex: 12000,
                width: `${wrapperWidth}px`,
                height: `${wrapperHeight}px`,
                pointerEvents: 'auto',
                overflow: 'visible',
            }}
        >
            <div
                style={{
                    position: 'relative',
                    width: '100%',
                    height: '100%',
                    overflow: 'visible',
                }}
            >
                {showDragHandle && (
                    <div
                        onPointerDown={onMoveStart}
                        title="拖动运行观察器入口"
                        style={{
                            position: 'absolute',
                            top: '-10px',
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
                            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.10)',
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
                )}
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
                        width: '100%',
                        height: '100%',
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
                        expanded={floatingInspectorExpanded}
                        fillHeight={floatingInspectorExpanded}
                        mode="floating"
                        onExpandedChange={onExpandedChange}
                    />
                </div>
            </div>
        </div>
    );
}
