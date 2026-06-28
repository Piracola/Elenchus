/**
 * Read-only list of allowed models in demo mode.
 */

import { useMemo } from 'react';
import { CheckCircle2, Database } from 'lucide-react';
import { useDemoModeStore } from '../../../stores/demoModeStore';
import { SettingsPage, SettingsSection } from './SettingsPrimitives';

interface Props {
    /** Optional list of model strings to show. Falls back to store. */
    models?: string[];
}

export function DemoModelsList({ models }: Props) {
    const { demoModels } = useDemoModeStore();
    const list = useMemo(() => models ?? demoModels, [models, demoModels]);

    return (
        <SettingsPage
            title="模型服务商"
            description="演示模式下仅展示公开允许的模型，配置修改需要管理员权限。"
        >
            <SettingsSection
                title="可用模型"
                description="这些模型可以在演示模式中被用于创建辩题。"
                icon={<Database size={15} />}
            >
                {list.length === 0 ? (
                    <div className="settings-empty">暂无可用模型</div>
                ) : (
                    <div className="settings-demo-list">
                        {list.map((model) => (
                            <div className="settings-demo-model" key={model}>
                                <CheckCircle2 size={15} style={{ color: 'var(--color-green-600)', flexShrink: 0 }} />
                                <span>{model}</span>
                            </div>
                        ))}
                    </div>
                )}
            </SettingsSection>
        </SettingsPage>
    );
}
