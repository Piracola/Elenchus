import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BrainCircuit, Database, Monitor, Search, Terminal, X } from 'lucide-react';
import { api } from '../../api/client';
import { useSettingsStore } from '../../stores/settingsStore';
import { useModelConfigManager } from '../../hooks/useModelConfigManager';
import { SearchConfigTab } from './SearchConfigTab';
import type { LogLevel } from '../../types';
import { SettingsDisplayTab } from './settings/SettingsDisplayTab';
import { SettingsContextTab } from './settings/SettingsContextTab';
import { SettingsLoggingTab } from './settings/SettingsLoggingTab';
import { SettingsProvidersTab } from './settings/SettingsProvidersTab';
import { BACKDROP_MOTION, MODAL_MOTION, TRANSITION } from '../../config/motion';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import './settings/settings.css';

export type SettingsTab = 'providers' | 'display' | 'logging' | 'search' | 'context';

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
    {
        value: 'context',
        label: '上下文工程',
        description: '上下文整理与专用模型',
        icon: <BrainCircuit size={17} />,
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
    const { logLevel, setLogLevel, displaySettings, setDisplaySettings, contextRuntime, setContextRuntime } = useSettingsStore();
    const { dialogRef, onKeyDown: onDialogKeyDown } = useDialogA11y({ isOpen, onClose });
    const tabListRef = useRef<HTMLDivElement>(null);

    // Use the extracted hook for provider management
    const modelConfig = useModelConfigManager();

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

    // Tabs are a single stop in the tab ring; arrows move between them. Without
    // this, reaching the last tab takes five Tab presses.
    const handleTabListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        const deltas: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
        const delta = deltas[event.key];
        const currentIndex = SETTINGS_TABS.findIndex((tab) => tab.value === activeTab);

        let nextIndex: number | null = null;
        if (delta !== undefined) {
            nextIndex = (currentIndex + delta + SETTINGS_TABS.length) % SETTINGS_TABS.length;
        } else if (event.key === 'Home') {
            nextIndex = 0;
        } else if (event.key === 'End') {
            nextIndex = SETTINGS_TABS.length - 1;
        }

        if (nextIndex === null) {
            return;
        }

        event.preventDefault();
        setActiveTab(SETTINGS_TABS[nextIndex].value);
        tabListRef.current
            ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
            ?.[nextIndex]
            ?.focus();
    };

    const renderActiveTab = () => {
        if (activeTab === 'providers') {
            return (
                <SettingsProvidersTab
                    modelConfig={modelConfig}
                    onClose={onClose}
                />
            );
        }

        if (activeTab === 'display') {
            return (
                <SettingsDisplayTab
                    displaySettings={displaySettings}
                    setDisplaySettings={setDisplaySettings}
                />
            );
        }

        if (activeTab === 'logging') {
            return (
                <SettingsLoggingTab
                    logLevel={logLevel}
                    onLogLevelChange={handleLogLevelChange}
                />
            );
        }

        if (activeTab === 'context') {
            return (
                <SettingsContextTab
                    providers={modelConfig.providers}
                    contextRuntime={contextRuntime}
                    setContextRuntime={setContextRuntime}
                />
            );
        }

        return <SearchConfigTab />;
    };

    const modalContent = (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        {...BACKDROP_MOTION}
                        onClick={onClose}
                        className="settings-modal-overlay"
                    >
                        <motion.div
                            ref={dialogRef}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="settings-modal-title"
                            tabIndex={-1}
                            onKeyDown={onDialogKeyDown}
                            onClick={(e) => e.stopPropagation()}
                            {...MODAL_MOTION}
                            className="settings-modal-shell"
                        >
                            <div className="settings-modal-header">
                                <div className="settings-modal-title-wrap">
                                    <h2 id="settings-modal-title" className="settings-modal-title">设置</h2>
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
                                <div
                                    ref={tabListRef}
                                    role="tablist"
                                    aria-label="设置分类"
                                    aria-orientation="vertical"
                                    className="settings-nav"
                                    onKeyDown={handleTabListKeyDown}
                                >
                                    {SETTINGS_TABS.map((tab) => (
                                        <button
                                            key={tab.value}
                                            type="button"
                                            role="tab"
                                            id={`settings-tab-${tab.value}`}
                                            aria-selected={activeTab === tab.value}
                                            aria-controls={`settings-tabpanel-${tab.value}`}
                                            tabIndex={activeTab === tab.value ? 0 : -1}
                                            className={`settings-tab-button ${activeTab === tab.value ? 'is-active' : ''}`}
                                            onClick={() => setActiveTab(tab.value)}
                                        >
                                            <span className="settings-tab-icon">{tab.icon}</span>
                                            <span>
                                                <span className="settings-tab-label">{tab.label}</span>
                                                <span className="settings-tab-description">{tab.description}</span>
                                            </span>
                                        </button>
                                    ))}
                                </div>

                                <main className="settings-main">
                                    <AnimatePresence mode="wait" initial={false}>
                                        <motion.div
                                            key={activeTab}
                                            role="tabpanel"
                                            id={`settings-tabpanel-${activeTab}`}
                                            aria-labelledby={`settings-tab-${activeTab}`}
                                            tabIndex={0}
                                            initial={{ opacity: 0, y: 4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -4 }}
                                            transition={TRANSITION.fast}
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
