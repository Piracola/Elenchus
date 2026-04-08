/**
 * Read-only list of allowed models in demo mode.
 */

import { useMemo } from 'react';
import { useDemoModeStore } from '../../../stores/demoModeStore';

interface Props {
    /** Optional list of model strings to show. Falls back to store. */
    models?: string[];
}

export function DemoModelsList({ models }: Props) {
    const { demoModels } = useDemoModeStore();
    const list = useMemo(() => models ?? demoModels, [models, demoModels]);

    if (list.length === 0) {
        return (
            <div style={{
                padding: '16px',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-lg)',
            }}>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
                    暂无可用模型
                </p>
            </div>
        );
    }

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
        }}>
            {list.map((model) => (
                <div
                    key={model}
                    style={{
                        padding: '10px 14px',
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '13px',
                        color: 'var(--text-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                    }}
                >
                    <span style={{ color: 'var(--color-green-600)' }}>✓</span>
                    {model}
                </div>
            ))}
        </div>
    );
}
