import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import FloatingRuntimeInspector from './FloatingRuntimeInspector';

vi.mock('./RuntimeInspector', () => ({
    default: () => <div data-testid="runtime-inspector" />,
}));

describe('FloatingRuntimeInspector', () => {
    it('positions the fixed overlay using both panel left and panel top offsets', () => {
        const { container } = render(
            <FloatingRuntimeInspector
                floatingInspectorRect={{ x: 120, y: 84, width: 148, height: 38 }}
                floatingInspectorViewportOffset={{ left: 36, top: 52 }}
                floatingInspectorExpanded={false}
                floatingInspectorActive={false}
                onMoveStart={() => {}}
                onResizeStart={() => () => {}}
                onExpandedChange={() => {}}
            />,
        );

        expect(screen.getByTestId('runtime-inspector')).toBeInTheDocument();
        expect(container.firstChild).toHaveStyle({
            left: '156px',
            top: '136px',
            position: 'fixed',
        });
    });
});
