import { Monitor, PanelTop, RotateCcw, Type } from 'lucide-react';
import {
    MESSAGE_FONT_SIZE_MIN,
    MESSAGE_FONT_SIZE_MAX,
    SETTINGS_FONT_SIZE_MIN,
    SETTINGS_FONT_SIZE_MAX,
    DEFAULT_MESSAGE_FONT_SIZE,
    DEFAULT_SETTINGS_FONT_SIZE,
} from '../../../config/display';
import type { DisplaySettings } from '../../../types';
import { resetStoredFloatingInspectorRect } from '../../../utils/inspector/floatingInspector';
import { toast } from '../../../utils/chat/toast';
import { SettingsRadioCardGroup } from './SettingsRadioCardGroup';
import {
    SettingsButton,
    SettingsField,
    SettingsInput,
    SettingsNotice,
    SettingsPage,
    SettingsSection,
} from './SettingsPrimitives';

const MESSAGE_WIDTH_OPTIONS: { value: DisplaySettings['messageWidth']; label: string; description: string }[] = [
    { value: 'narrow', label: '窄', description: '600px，适合专注阅读' },
    { value: 'medium', label: '中等', description: '900px，平衡显示效果' },
    { value: 'wide', label: '宽', description: '1200px，充分利用屏幕空间' },
    { value: 'full', label: '全宽', description: '100%，最大化显示区域' },
];

type SettingsDisplayTabProps = {
    displaySettings: DisplaySettings;
    setDisplaySettings: (settings: Partial<DisplaySettings>) => void;
};

export function SettingsDisplayTab({ displaySettings, setDisplaySettings }: SettingsDisplayTabProps) {
    const handleFloatingInspectorReset = () => {
        resetStoredFloatingInspectorRect();
        toast('运行观察器已重置到默认位置和大小', 'success');
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

    return (
        <SettingsPage
            title="显示设置"
            description="调整阅读宽度、字号和运行观察器位置，让长文本阅读更稳定。"
        >
            <SettingsSection
                title="消息界面宽度"
                description="控制聊天与裁判内容的最大阅读宽度。"
                icon={<PanelTop size={15} />}
            >
                <SettingsRadioCardGroup
                    options={MESSAGE_WIDTH_OPTIONS}
                    selectedValue={displaySettings.messageWidth}
                    onSelect={(value) => setDisplaySettings({ messageWidth: value })}
                />
            </SettingsSection>

            <SettingsSection
                title="字号"
                description="分别控制阅读内容和设置面板自身字号。"
                icon={<Type size={15} />}
            >
                <div className="settings-form-grid">
                    <SettingsField
                        label="消息界面字体大小"
                        htmlFor="message-font-size"
                        hint={`范围：${MESSAGE_FONT_SIZE_MIN}-${MESSAGE_FONT_SIZE_MAX}px。影响消息正文、裁判评语等阅读区域。`}
                    >
                        <div className="settings-inline-controls">
                            <SettingsInput
                                id="message-font-size"
                                type="number"
                                value={messageFontSize}
                                onChange={(e) => handleMessageFontSizeChange(e.target.value)}
                                min={MESSAGE_FONT_SIZE_MIN}
                                max={MESSAGE_FONT_SIZE_MAX}
                                step={1}
                                style={{ width: 96 }}
                            />
                            <span className="settings-badge settings-badge--muted">px</span>
                        </div>
                    </SettingsField>

                    <SettingsField
                        label="设置界面字体大小"
                        htmlFor="settings-font-size"
                        hint={`范围：${SETTINGS_FONT_SIZE_MIN}-${SETTINGS_FONT_SIZE_MAX}px。只影响设置面板、表单和导航。`}
                    >
                        <div className="settings-inline-controls">
                            <SettingsInput
                                id="settings-font-size"
                                type="number"
                                value={settingsFontSize}
                                onChange={(e) => handleSettingsFontSizeChange(e.target.value)}
                                min={SETTINGS_FONT_SIZE_MIN}
                                max={SETTINGS_FONT_SIZE_MAX}
                                step={1}
                                style={{ width: 96 }}
                            />
                            <span className="settings-badge settings-badge--muted">px</span>
                        </div>
                    </SettingsField>
                </div>

                <SettingsNotice icon={<Monitor size={15} />}>
                    当系统缩放比例较小时，较宽的消息模式通常更适合长文本阅读。
                </SettingsNotice>
            </SettingsSection>

            <SettingsSection
                title="运行观察器"
                description="清空观察器记住的位置和展开尺寸。"
                icon={<Monitor size={15} />}
            >
                <div className="settings-control-row settings-control-row--start">
                    <div>
                        <div className="settings-field-label">重置到默认位置</div>
                        <div className="settings-field-hint" style={{ marginTop: 0 }}>
                            如果观察器尺寸不合适，或想清空已记住的展开大小，可以恢复默认设置。
                        </div>
                    </div>
                    <SettingsButton
                        variant="primary"
                        icon={<RotateCcw size={15} />}
                        onClick={handleFloatingInspectorReset}
                    >
                        立即重置
                    </SettingsButton>
                </div>
            </SettingsSection>
        </SettingsPage>
    );
}
