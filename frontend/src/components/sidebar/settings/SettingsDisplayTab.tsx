import { motion } from 'framer-motion';
import { DISPLAY_FONT_SIZE_OPTIONS } from '../../../config/display';
import type { DisplaySettings } from '../../../types';
import { resetStoredFloatingInspectorRect } from '../../../utils/floatingInspector';
import { toast } from '../../../utils/toast';
import { SettingsRadioCardGroup } from './SettingsRadioCardGroup';

const MESSAGE_WIDTH_OPTIONS: { value: DisplaySettings['messageWidth']; label: string; description: string }[] = [
    { value: 'narrow', label: '窄', description: '600px — 适合专注阅读' },
    { value: 'medium', label: '中等', description: '900px — 平衡显示效果' },
    { value: 'wide', label: '宽', description: '1200px — 充分利用屏幕空间' },
    { value: 'full', label: '全宽', description: '100% — 最大化显示区域' },
];

type SettingsDisplayTabProps = {
    displaySettings: DisplaySettings;
    setDisplaySettings: (settings: Partial<DisplaySettings>) => void;
};

export function SettingsDisplayTab({ displaySettings, setDisplaySettings }: SettingsDisplayTabProps) {
    const handleFloatingInspectorReset = () => {
        resetStoredFloatingInspectorRect();
        toast('运行观察器已重置到默认位置', 'success');
    };

    return (
        <div style={{
            padding: '24px',
            overflowY: 'auto',
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-xs)',
        }}>
            <div style={{
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: '20px',
                marginBottom: '24px',
            }}>
                <h3 style={{
                    fontSize: '20px',
                    margin: '0 0 8px',
                    color: 'var(--text-primary)',
                    fontWeight: 700,
                }}>
                    显示设置
                </h3>
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)' }}>
                    自定义消息界面的显示效果，调整宽度与阅读字号以适应不同的屏幕尺寸和使用偏好。
                </p>
            </div>

            <div style={{ marginBottom: '24px' }}>
                <h4 style={{
                    fontSize: '14px',
                    margin: '0 0 16px',
                    color: 'var(--text-primary)',
                    fontWeight: 600,
                }}>
                    消息界面宽度
                </h4>
                <SettingsRadioCardGroup
                    options={MESSAGE_WIDTH_OPTIONS}
                    selectedValue={displaySettings.messageWidth}
                    onSelect={(value) => setDisplaySettings({ messageWidth: value })}
                />
            </div>

            <div style={{ marginBottom: '24px' }}>
                <h4 style={{
                    fontSize: '14px',
                    margin: '0 0 16px',
                    color: 'var(--text-primary)',
                    fontWeight: 600,
                }}>
                    字体大小
                </h4>
                <SettingsRadioCardGroup
                    options={DISPLAY_FONT_SIZE_OPTIONS}
                    selectedValue={displaySettings.fontSize}
                    onSelect={(value) => setDisplaySettings({ fontSize: value })}
                />
            </div>

            <div style={{
                padding: '16px 20px',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-inner)',
            }}>
                <div style={{
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    fontWeight: 500,
                }}>
                    提示：当屏幕缩放比例较小时，建议选择较宽的显示模式以获得更好的阅读体验。
                </div>
            </div>

            <div style={{
                marginTop: '24px',
                padding: '20px',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                flexWrap: 'wrap',
            }}>
                <div style={{ flex: '1 1 320px' }}>
                    <h4 style={{
                        fontSize: '14px',
                        margin: '0 0 8px',
                        color: 'var(--text-primary)',
                        fontWeight: 600,
                    }}>
                        运行观察器
                    </h4>
                    <div style={{
                        fontSize: '14px',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        marginBottom: '4px',
                    }}>
                        重置到默认位置
                    </div>
                    <p style={{
                        margin: 0,
                        fontSize: '13px',
                        color: 'var(--text-muted)',
                        lineHeight: 1.6,
                    }}>
                        如果观察器被拖到异常位置或尺寸不合适，可以恢复到默认位置和大小。
                    </p>
                </div>

                <motion.button
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleFloatingInspectorReset}
                    style={{
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--accent-indigo)',
                        color: 'white',
                        padding: '10px 16px',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: 'var(--shadow-sm)',
                        flexShrink: 0,
                    }}
                >
                    立即重置
                </motion.button>
            </div>
        </div>
    );
}
