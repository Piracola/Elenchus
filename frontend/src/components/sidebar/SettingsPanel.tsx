import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, Monitor, Search, Terminal, X } from 'lucide-react';
import { api } from '../../api/client';
import { useSettingsStore } from '../../stores/settingsStore';
import { useDemoModeStore } from '../../stores/demoModeStore';
import { useModelConfigManager } from '../../hooks/useModelConfigManager';
import { SearchConfigTab } from './SearchConfigTab';
import type { LogLevel } from '../../types';
import { SettingsDisplayTab } from './settings/SettingsDisplayTab';
import { SettingsLoggingTab } from './settings/SettingsLoggingTab';
import { SettingsProvidersTab } from './settings/SettingsProvidersTab';
import { DemoModelsList } from './settings/DemoModelsList';
import { DemoFeatureNotice } from './settings/DemoFeatureNotice';
import './settings/settings.css';

export type SettingsTab = 'providers' | 'display' | 'logging' | 'search';

const SETTINGS_TAB_TRANSITION = {
    duration: 0.16,
    ease: 'easeOut' as const,
};

const SETTINGS_SHELL_TRANSITION = {
    duration: 0.18,
    ease: 'easeOut' as const,
};

const SETTINGS_TABS: Array<{
    value: SettingsTab;
    label: string;
    description: string;
    icon: React.ReactNode;
}> = [
    {
        value: 'providers',
        label: '模型服务商',
        description: '模型、密钥与参数',
        icon: <Database size={17} />,
    },
    {
        value: 'display',
        label: '显示设置',
        description: '宽度与阅读字号',
        icon: <Monitor size={17} />,
    },
    {
        value: 'logging',
        label: '日志打印等级',
        description: '后端日志输出',
        icon: <Terminal size={17} />,
    },
    {
        value: 'search',
        label: '搜索引擎',
        description: '检索 provider 配置',
        icon: <Search size={17} />,
    },
];

interface Props {
    isOpen: boolean;
    onClose: () => void;
    initialTab?: SettingsTab;
}

export default function SettingsPanel({
    isOpen,
    onClose,
    initialTab = 'providers',
}: Props) {
    const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
    const { logLevel, setLogLevel, displaySettings, setDisplaySettings } = useSettingsStore();
    const { demoMode, isAdmin } = useDemoModeStore();

    // Use the extracted hook for provider management
    const modelConfig = useModelConfigManager();

    const isInDemoMode = demoMode && !isAdmin;

    useEffect(() => {
        if (isOpen) {
            setActiveTab(initialTab);
            modelConfig.fetchConfigs();
            syncLogLevelFromServer();
        } else {
            modelConfig.startNew();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialTab, isOpen]);

    const syncLogLevelFromServer = async () => {
        try {
            const result = await api.log.getLevel();
            setLogLevel(result.level as LogLevel);
        } catch (err) {
            console.error("Failed to sync log level", err);
        }
    };

    const handleLogLevelChange = async (level: LogLevel) => {
        try {
            await api.log.setLevel(level);
            setLogLevel(level);
        } catch (err) {
            console.error("Failed to set log level", err);
        }
    };

    const renderActiveTab = () => {
        if (activeTab === 'providers') {
            return isInDemoMode
                ? <DemoModelsList />
                : (
                    <SettingsProvidersTab
                        modelConfig={modelConfig}
                        onClose={onClose}
                    />
                );
        }

        if (activeTab === 'display') {
            return isInDemoMode
                ? <DemoFeatureNotice feature="显示设置" />
                : (
                    <SettingsDisplayTab
                        displaySettings={displaySettings}
                        setDisplaySettings={setDisplaySettings}
                    />
                );
        }

        if (activeTab === 'logging') {
            return isInDemoMode
                ? <DemoFeatureNotice feature="日志级别" />
                : (
                    <SettingsLoggingTab
                        logLevel={logLevel}
                        onLogLevelChange={handleLogLevelChange}
                    />
                );
        }

        return isInDemoMode
            ? <DemoModelsList />
            : <SearchConfigTab />;
    };

    const modalContent = (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={SETTINGS_SHELL_TRANSITION}
                        onClick={onClose}
                        className="settings-modal-overlay"
                    >
                        <motion.div
                            onClick={(e) => e.stopPropagation()}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={SETTINGS_SHELL_TRANSITION}
                            className="settings-modal-shell"
                        >
                            <div className="settings-modal-header">
                                <div className="settings-modal-title-wrap">
                                    <h2 className="settings-modal-title">设置</h2>
                                    <p className="settings-modal-description">
                                        管理模型、搜索、显示和运行日志。
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    className="settings-close-button"
                                    onClick={onClose}
                                    aria-label="关闭设置"
                                    title="关闭设置"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="settings-modal-body">
                                <nav className="settings-nav" aria-label="设置分类">
                                    {SETTINGS_TABS.map((tab) => (
                                        <button
                                            key={tab.value}
                                            type="button"
                                            className={`settings-tab-button ${activeTab === tab.value ? 'is-active' : ''}`}
                                            onClick={() => setActiveTab(tab.value)}
                                            aria-current={activeTab === tab.value ? 'page' : undefined}
                                        >
                                            <span className="settings-tab-icon">{tab.icon}</span>
                                            <span>
                                                <span className="settings-tab-label">{tab.label}</span>
                                                <span className="settings-tab-description">{tab.description}</span>
                                            </span>
                                        </button>
                                    ))}
                                </nav>

                                <main className="settings-main">
                                    <AnimatePresence mode="wait" initial={false}>
                                        <motion.div
                                            key={activeTab}
                                            initial={{ opacity: 0, y: 4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -4 }}
                                            transition={SETTINGS_TAB_TRANSITION}
                                            className="settings-tab-panel"
                                        >
                                            {renderActiveTab()}
                                        </motion.div>
                                    </AnimatePresence>
                                </main>
                            </div>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );

    return createPortal(modalContent, document.body);
}
