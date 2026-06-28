import { FileText, Terminal } from 'lucide-react';
import type { LogLevel } from '../../../types';
import { SettingsRadioCardGroup } from './SettingsRadioCardGroup';
import { SettingsPage, SettingsSection } from './SettingsPrimitives';

const LOG_LEVELS: { value: LogLevel; label: string; description: string }[] = [
    { value: 'DEBUG', label: 'DEBUG', description: '详细调试信息，包含所有操作细节' },
    { value: 'INFO', label: 'INFO', description: '常规运行信息，记录关键操作' },
    { value: 'WARNING', label: 'WARNING', description: '警告信息，潜在问题提示' },
    { value: 'ERROR', label: 'ERROR', description: '错误信息，功能异常记录' },
    { value: 'CRITICAL', label: 'CRITICAL', description: '严重错误，系统级故障' },
];

type SettingsLoggingTabProps = {
    logLevel: LogLevel;
    onLogLevelChange: (level: LogLevel) => void;
};

export function SettingsLoggingTab({ logLevel, onLogLevelChange }: SettingsLoggingTabProps) {
    return (
        <SettingsPage
            title="日志打印等级"
            description="控制后端服务的日志输出范围，便于排查运行问题。"
        >
            <SettingsSection
                title="输出级别"
                description="级别越低记录越详细，也会产生更多日志内容。"
                icon={<Terminal size={15} />}
            >
                <SettingsRadioCardGroup
                    layout="list"
                    options={LOG_LEVELS}
                    selectedValue={logLevel}
                    onSelect={onLogLevelChange}
                />
            </SettingsSection>

            <SettingsSection
                title="日志文件"
                description="后端运行日志默认写入 runtime 日志目录。"
                icon={<FileText size={15} />}
            >
                <code className="settings-code-row">./runtime/logs/elenchus_YYYY-MM-DD.log</code>
            </SettingsSection>
        </SettingsPage>
    );
}
