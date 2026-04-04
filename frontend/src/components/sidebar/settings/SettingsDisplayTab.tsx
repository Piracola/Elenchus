import { motion } from 'framer-motion';
import { createSettingsFonts } from '../../../config/settingsFonts';
import { 
    MESSAGE_FONT_SIZE_MIN, 
    MESSAGE_FONT_SIZE_MAX, 
    SETTINGS_FONT_SIZE_MIN, 
    SETTINGS_FONT_SIZE_MAX,
    DEFAULT_MESSAGE_FONT_SIZE,
    DEFAULT_SETTINGS_FONT_SIZE 
} from '../../../config/display';
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

    const handleMessageFontSizeChange = (value: string) => {
        const num = parseInt(value, 10);
        if (!isNaN(num)) {
            const clamped = Math.max(MESSAGE_FONT_SIZE_MIN, Math.min(MESSAGE_FONT_SIZE_MAX, num));
            setDisplaySettings({ messageFontSize: clamped });
        }
    };

    const handleSettingsFontSizeChange = (value: string) => {
        const num = parseInt(value, 10);
        if (!isNaN(num)) {
            const clamped = Math.max(SETTINGS_FONT_SIZE_MIN, Math.min(SETTINGS_FONT_SIZE_MAX, num));
            setDisplaySettings({ settingsFontSize: clamped });
        }
    };

    const messageFontSize = displaySettings.messageFontSize ?? DEFAULT_MESSAGE_FONT_SIZE;
    const settingsFontSize = displaySettings.settingsFontSize ?? DEFAULT_SETTINGS_FONT_SIZE;
    
    // Create fonts config based on user's settings font size
    const fonts = createSettingsFonts(settingsFontSize);

    return (
        <div style={{
            padding: fonts.spacingMd,
            overflowY: 'auto',
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-xs)',
        }}>
            <div style={{
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: fonts.spacingMd,
                marginBottom: fonts.spacingMd,
            }}>
                <h3 style={{
                    fontSize: `${fonts.sectionTitle}px`,
                    margin: '0 0 8px',
                    color: 'var(--text-primary)',
                    fontWeight: 700,
                }}>
                    显示设置
                </h3>
                <p style={{ margin: 0, fontSize: `${fonts.description}px`, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    自定义界面的显示效果，调整宽度与阅读字号以适应不同的屏幕尺寸和使用偏好。
                </p>
            </div>

            <div style={{ marginBottom: fonts.spacingMd }}>
                <h4 style={{
                    fontSize: `${fonts.subsectionTitle}px`,
                    margin: `0 0 ${fonts.spacingSm}`,
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

            {/* Message Font Size Input */}
            <div style={{
                marginBottom: fonts.spacingMd,
                padding: fonts.spacingSm,
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-lg)',
            }}>
                <h4 style={{
                    fontSize: `${fonts.subsectionTitle}px`,
                    margin: `0 0 ${fonts.spacingSm}`,
                    color: 'var(--text-primary)',
                    fontWeight: 600,
                }}>
                    消息界面字体大小
                </h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <input
                        type="number"
                        value={messageFontSize}
                        onChange={(e) => handleMessageFontSizeChange(e.target.value)}
                        min={MESSAGE_FONT_SIZE_MIN}
                        max={MESSAGE_FONT_SIZE_MAX}
                        step={1}
                        style={{
                            width: '80px',
                            padding: '8px 10px',
                            borderRadius: 'var(--radius-md)',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-primary)',
                            fontSize: `${fonts.input}px`,
                            outline: 'none',
                        }}
                        onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-indigo)'}
                        onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
                    />
                    <span style={{ fontSize: `${fonts.label}px`, color: 'var(--text-secondary)' }}>
                        px（范围：{MESSAGE_FONT_SIZE_MIN}-{MESSAGE_FONT_SIZE_MAX}）
                    </span>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: `${fonts.hint}px`, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    调整消息正文、裁判评语等阅读区域的字体大小。
                </p>
            </div>

            {/* Settings Font Size Input */}
            <div style={{
                marginBottom: fonts.spacingMd,
                padding: fonts.spacingSm,
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-lg)',
            }}>
                <h4 style={{
                    fontSize: `${fonts.subsectionTitle}px`,
                    margin: `0 0 ${fonts.spacingSm}`,
                    color: 'var(--text-primary)',
                    fontWeight: 600,
                }}>
                    设置界面字体大小
                </h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <input
                        type="number"
                        value={settingsFontSize}
                        onChange={(e) => handleSettingsFontSizeChange(e.target.value)}
                        min={SETTINGS_FONT_SIZE_MIN}
                        max={SETTINGS_FONT_SIZE_MAX}
                        step={1}
                        style={{
                            width: '80px',
                            padding: '8px 10px',
                            borderRadius: 'var(--radius-md)',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-primary)',
                            fontSize: `${fonts.input}px`,
                            outline: 'none',
                        }}
                        onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-indigo)'}
                        onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
                    />
                    <span style={{ fontSize: `${fonts.label}px`, color: 'var(--text-secondary)' }}>
                        px（范围：{SETTINGS_FONT_SIZE_MIN}-{SETTINGS_FONT_SIZE_MAX}）
                    </span>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: `${fonts.hint}px`, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    调整设置面板、表单和导航的字体大小，不影响消息界面。
                </p>
            </div>

            <div style={{
                padding: fonts.spacingSm,
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-inner)',
            }}>
                <div style={{
                    fontSize: `${fonts.label}px`,
                    color: 'var(--text-secondary)',
                    fontWeight: 500,
                    lineHeight: 1.6,
                }}>
                    提示：当屏幕缩放比例较小时，建议选择较宽的显示模式以获得更好的阅读体验。
                </div>
            </div>

            <div style={{
                marginTop: fonts.spacingMd,
                padding: fonts.spacingMd,
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: fonts.spacingMd,
                flexWrap: 'wrap',
            }}>
                <div style={{ flex: '1 1 320px' }}>
                    <h4 style={{
                        fontSize: `${fonts.subsectionTitle}px`,
                        margin: '0 0 6px',
                        color: 'var(--text-primary)',
                        fontWeight: 600,
                    }}>
                        运行观察器
                    </h4>
                    <div style={{
                        fontSize: `${fonts.label}px`,
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        marginBottom: '4px',
                    }}>
                        重置到默认位置
                    </div>
                    <p style={{
                        margin: 0,
                        fontSize: `${fonts.description}px`,
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
                        fontSize: `${fonts.button}px`,
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
