import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../api/client';
import { useSettingsStore } from '../../stores/settingsStore';
import { useModelConfigManager } from '../../hooks/useModelConfigManager';
import { SearchConfigTab } from './SearchConfigTab';
import type { LogLevel } from '../../types';
import { SettingsDisplayTab } from './settings/SettingsDisplayTab';
import { SettingsLoggingTab } from './settings/SettingsLoggingTab';
import { SettingsProvidersTab } from './settings/SettingsProvidersTab';
import { createSettingsFonts } from '../../config/settingsFonts';
import { DEFAULT_SETTINGS_FONT_SIZE } from '../../config/display';

export type SettingsTab = 'providers' | 'display' | 'logging' | 'search';

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
    
    // Create fonts config based on user's settings font size
    const userSettingsFontSize = displaySettings.settingsFontSize ?? DEFAULT_SETTINGS_FONT_SIZE;
    const fonts = createSettingsFonts(userSettingsFontSize);

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

    const modalContent = (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(0,0,0,0.5)',
                            backdropFilter: 'blur(8px)',
                            zIndex: 1000,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <motion.div
                            onClick={(e) => e.stopPropagation()}
                            initial={{ opacity: 0, scale: 0.9, y: 30 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 30 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            style={{
                                width: '92%',
                                maxWidth: '1100px',
                                height: '82vh',
                                maxHeight: '760px',
                                background: 'var(--bg-secondary)',
                                borderRadius: 'var(--radius-xl)',
                                boxShadow: 'var(--shadow-2xl)',
                                display: 'flex',
                                overflow: 'hidden',
                                border: '1px solid var(--border-subtle)',
                            }}
                        >
                            {/* Sidebar */}
                            <div style={{
                                width: '200px',
                                background: 'var(--bg-tertiary)',
                                display: 'flex',
                                flexDirection: 'column',
                                padding: '20px 14px',
                                gap: '6px',
                            }}>
                                <div style={{
                                    padding: '0 8px 16px',
                                    borderBottom: '1px solid var(--border-subtle)',
                                    marginBottom: '8px',
                                }}>
                                    <h2 style={{
                                        margin: 0,
                                        fontSize: '20px',
                                        fontWeight: 700,
                                        color: 'var(--text-primary)',
                                    }}>
                                        设置
                                    </h2>
                                </div>

                                <motion.div
                                    whileHover={{ scale: 1.02 }}
                                    onClick={() => setActiveTab('providers')}
                                    style={{
                                        padding: `${fonts.spacingSm} ${fonts.spacingSm}`,
                                        borderRadius: 'var(--radius-lg)',
                                        background: activeTab === 'providers' ? 'var(--bg-card)' : 'transparent',
                                        cursor: 'pointer',
                                        color: activeTab === 'providers' ? 'var(--text-primary)' : 'var(--text-secondary)',
                                        fontWeight: activeTab === 'providers' ? 600 : 500,
                                        fontSize: `${fonts.navItem}px`,
                                        boxShadow: activeTab === 'providers' ? 'var(--shadow-xs)' : 'none',
                                        transition: 'all var(--transition-fast)',
                                    }}
                                >
                                    模型服务商
                                </motion.div>

                                <motion.div
                                    whileHover={{ scale: 1.02 }}
                                    onClick={() => setActiveTab('display')}
                                    style={{
                                        padding: `${fonts.spacingSm} ${fonts.spacingSm}`,
                                        borderRadius: 'var(--radius-lg)',
                                        background: activeTab === 'display' ? 'var(--bg-card)' : 'transparent',
                                        cursor: 'pointer',
                                        color: activeTab === 'display' ? 'var(--text-primary)' : 'var(--text-secondary)',
                                        fontWeight: activeTab === 'display' ? 600 : 500,
                                        fontSize: `${fonts.navItem}px`,
                                        boxShadow: activeTab === 'display' ? 'var(--shadow-xs)' : 'none',
                                        transition: 'all var(--transition-fast)',
                                    }}
                                >
                                    显示设置
                                </motion.div>

                                <motion.div
                                    whileHover={{ scale: 1.02 }}
                                    onClick={() => setActiveTab('logging')}
                                    style={{
                                        padding: `${fonts.spacingSm} ${fonts.spacingSm}`,
                                        borderRadius: 'var(--radius-lg)',
                                        background: activeTab === 'logging' ? 'var(--bg-card)' : 'transparent',
                                        cursor: 'pointer',
                                        color: activeTab === 'logging' ? 'var(--text-primary)' : 'var(--text-secondary)',
                                        fontWeight: activeTab === 'logging' ? 600 : 500,
                                        fontSize: `${fonts.navItem}px`,
                                        boxShadow: activeTab === 'logging' ? 'var(--shadow-xs)' : 'none',
                                        transition: 'all var(--transition-fast)',
                                    }}
                                >
                                    日志打印等级
                                </motion.div>

                                <motion.div
                                    whileHover={{ scale: 1.02 }}
                                    onClick={() => setActiveTab('search')}
                                    style={{
                                        padding: `${fonts.spacingSm} ${fonts.spacingSm}`,
                                        borderRadius: 'var(--radius-lg)',
                                        background: activeTab === 'search' ? 'var(--bg-card)' : 'transparent',
                                        cursor: 'pointer',
                                        color: activeTab === 'search' ? 'var(--text-primary)' : 'var(--text-secondary)',
                                        fontWeight: activeTab === 'search' ? 600 : 500,
                                        fontSize: `${fonts.navItem}px`,
                                        boxShadow: activeTab === 'search' ? 'var(--shadow-xs)' : 'none',
                                        transition: 'all var(--transition-fast)',
                                    }}
                                >
                                    搜索引擎
                                </motion.div>
                            </div>

                            {/* Content Area */}
                            <div style={{
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                position: 'relative',
                                overflow: 'hidden',
                                padding: '18px',
                            }}>
                                {activeTab !== 'providers' && <motion.button
                                    whileHover={{ scale: 1.1, color: 'var(--text-primary)' }}
                                    onClick={onClose}
                                    style={{
                                        position: 'absolute',
                                        top: '12px',
                                        right: '18px',
                                        zIndex: 10,
                                        background: 'var(--bg-tertiary)',
                                        border: 'none',
                                        color: 'var(--text-muted)',
                                        cursor: 'pointer',
                                        fontSize: '32px',
                                        width: '36px',
                                        height: '36px',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        boxShadow: 'var(--shadow-xs)',
                                    }}
                                >
                                    ×
                                </motion.button>}

                                {activeTab === 'providers' && (
                                    <SettingsProvidersTab
                                        modelConfig={modelConfig}
                                        onClose={onClose}
                                    />
                                )}
                                {activeTab === 'display' && (
                                    <SettingsDisplayTab
                                        displaySettings={displaySettings}
                                        setDisplaySettings={setDisplaySettings}
                                    />
                                )}
                                {activeTab === 'logging' && (
                                    <SettingsLoggingTab
                                        logLevel={logLevel}
                                        onLogLevelChange={handleLogLevelChange}
                                    />
                                )}
                                {activeTab === 'search' && <SearchConfigTab />}
                            </div>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );

    return createPortal(modalContent, document.body);
}
