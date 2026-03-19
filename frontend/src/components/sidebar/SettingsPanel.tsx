import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../api/client';
import { useSettingsStore } from '../../stores/settingsStore';
import { useModelConfigManager } from '../../hooks/useModelConfigManager';
import { ProviderSidebar } from './ProviderSidebar';
import { ProviderForm } from './ProviderForm';
import { SearchConfigTab } from './SearchConfigTab';
import type { LogLevel, DisplaySettings } from '../../types';
import { resetStoredFloatingInspectorRect } from '../../utils/floatingInspector';
import { toast } from '../../utils/toast';

export type SettingsTab = 'providers' | 'display' | 'logging' | 'search';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    initialTab?: SettingsTab;
}

const LOG_LEVELS: { value: LogLevel; label: string; description: string }[] = [
    { value: 'DEBUG', label: 'DEBUG', description: '详细调试信息，包含所有操作细节' },
    { value: 'INFO', label: 'INFO', description: '常规运行信息，记录关键操作' },
    { value: 'WARNING', label: 'WARNING', description: '警告信息，潜在问题提示' },
    { value: 'ERROR', label: 'ERROR', description: '错误信息，功能异常记录' },
    { value: 'CRITICAL', label: 'CRITICAL', description: '严重错误，系统级故障' },
];

const MESSAGE_WIDTH_OPTIONS: { value: DisplaySettings['messageWidth']; label: string; description: string }[] = [
    { value: 'narrow', label: '窄', description: '600px — 适合专注阅读' },
    { value: 'medium', label: '中等', description: '900px — 平衡显示效果' },
    { value: 'wide', label: '宽', description: '1200px — 充分利用屏幕空间' },
    { value: 'full', label: '全宽', description: '100% — 最大化显示区域' },
];

export default function SettingsPanel({
    isOpen,
    onClose,
    initialTab = 'providers',
}: Props) {
    const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
    const { logLevel, setLogLevel, displaySettings, setDisplaySettings } = useSettingsStore();

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

    const handleFloatingInspectorReset = () => {
        resetStoredFloatingInspectorRect();
        toast('运行观察器已重置到默认位置', 'success');
    };

    const renderProvidersTab = () => (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: '20px' }}>
            <ProviderSidebar
                providers={modelConfig.providers}
                isLoading={modelConfig.isLoading}
                activeIndex={modelConfig.activeIndex}
                isCreatingNew={modelConfig.isCreatingNew}
                onSelect={modelConfig.handleSelectProvider}
                onDelete={modelConfig.handleDeleteProvider}
                onNew={modelConfig.startNew}
            />
            <ProviderForm
                formData={modelConfig.formData}
                isCreatingNew={modelConfig.isCreatingNew}
                newModelInput={modelConfig.newModelInput}
                onFieldChange={modelConfig.updateFormField}
                onAddModel={modelConfig.handleAddModel}
                onRemoveModel={modelConfig.handleRemoveModel}
                onNewModelInputChange={modelConfig.setNewModelInput}
                onSave={modelConfig.handleSave}
                onClose={onClose}
            />
        </div>
    );

    const renderDisplayTab = () => (
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
                    自定义消息界面的显示效果，调整宽度以适应不同的屏幕尺寸和使用偏好。
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {MESSAGE_WIDTH_OPTIONS.map((option) => (
                        <motion.div
                            key={option.value}
                            whileHover={{ scale: 1.01 }}
                            onClick={() => setDisplaySettings({ messageWidth: option.value })}
                            style={{
                                padding: '16px 20px',
                                borderRadius: 'var(--radius-lg)',
                                background: displaySettings.messageWidth === option.value ? 'var(--bg-tertiary)' : 'transparent',
                                border: `1px solid ${displaySettings.messageWidth === option.value ? 'var(--accent-indigo)' : 'var(--border-subtle)'}`,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '16px',
                                transition: 'all var(--transition-fast)',
                                boxShadow: displaySettings.messageWidth === option.value ? 'var(--shadow-sm)' : 'none',
                            }}
                        >
                            <div style={{
                                width: '22px',
                                height: '22px',
                                borderRadius: '50%',
                                border: `2px solid ${displaySettings.messageWidth === option.value ? 'var(--accent-indigo)' : 'var(--border-subtle)'}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                {displaySettings.messageWidth === option.value && (
                                    <div style={{
                                        width: '10px',
                                        height: '10px',
                                        borderRadius: '50%',
                                        background: 'var(--accent-indigo)',
                                    }} />
                                )}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{
                                    fontWeight: 700,
                                    fontSize: '15px',
                                    color: 'var(--text-primary)',
                                }}>
                                    {option.label}
                                </div>
                                <div style={{
                                    fontSize: '13px',
                                    color: 'var(--text-muted)',
                                    marginTop: '4px',
                                }}>
                                    {option.description}
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
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

    const renderLoggingTab = () => (
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
                    日志打印等级
                </h3>
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)' }}>
                    控制后端服务的日志输出级别，日志将存储在项目根目录的 logs 文件夹中。
                </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {LOG_LEVELS.map((level) => (
                    <motion.div
                        key={level.value}
                        whileHover={{ scale: 1.01 }}
                        onClick={() => handleLogLevelChange(level.value)}
                        style={{
                            padding: '16px 20px',
                            borderRadius: 'var(--radius-lg)',
                            background: logLevel === level.value ? 'var(--bg-tertiary)' : 'transparent',
                            border: `1px solid ${logLevel === level.value ? 'var(--accent-indigo)' : 'var(--border-subtle)'}`,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '16px',
                            transition: 'all var(--transition-fast)',
                            boxShadow: logLevel === level.value ? 'var(--shadow-sm)' : 'none',
                        }}
                    >
                        <div style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            border: `2px solid ${logLevel === level.value ? 'var(--accent-indigo)' : 'var(--border-subtle)'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}>
                            {logLevel === level.value && (
                                <div style={{
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '50%',
                                    background: 'var(--accent-indigo)',
                                }} />
                            )}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{
                                fontWeight: 700,
                                fontSize: '15px',
                                color: 'var(--text-primary)',
                            }}>
                                {level.label}
                            </div>
                            <div style={{
                                fontSize: '13px',
                                color: 'var(--text-muted)',
                                marginTop: '4px',
                            }}>
                                {level.description}
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            <div style={{
                marginTop: '28px',
                padding: '16px 20px',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-inner)',
            }}>
                <div style={{
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    marginBottom: '10px',
                    fontWeight: 600,
                }}>
                    日志文件位置
                </div>
                <code style={{
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    background: 'var(--bg-card)',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    display: 'block',
                    fontFamily: 'monospace',
                    boxShadow: 'var(--shadow-inner)',
                }}>
                    ./logs/elenchus_YYYY-MM-DD.log
                </code>
            </div>
        </div>
    );

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
                                maxWidth: '960px',
                                height: '80vh',
                                maxHeight: '700px',
                                background: 'var(--bg-secondary)',
                                borderRadius: 'var(--radius-2xl)',
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
                                padding: '24px 16px',
                                gap: '8px',
                            }}>
                                <div style={{
                                    padding: '0 8px 20px',
                                    borderBottom: '1px solid var(--border-subtle)',
                                    marginBottom: '8px',
                                }}>
                                    <h2 style={{
                                        margin: 0,
                                        fontSize: '18px',
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
                                        padding: '14px 16px',
                                        borderRadius: 'var(--radius-lg)',
                                        background: activeTab === 'providers' ? 'var(--bg-card)' : 'transparent',
                                        cursor: 'pointer',
                                        color: activeTab === 'providers' ? 'var(--text-primary)' : 'var(--text-secondary)',
                                        fontWeight: activeTab === 'providers' ? 600 : 500,
                                        fontSize: '14px',
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
                                        padding: '14px 16px',
                                        borderRadius: 'var(--radius-lg)',
                                        background: activeTab === 'display' ? 'var(--bg-card)' : 'transparent',
                                        cursor: 'pointer',
                                        color: activeTab === 'display' ? 'var(--text-primary)' : 'var(--text-secondary)',
                                        fontWeight: activeTab === 'display' ? 600 : 500,
                                        fontSize: '14px',
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
                                        padding: '14px 16px',
                                        borderRadius: 'var(--radius-lg)',
                                        background: activeTab === 'logging' ? 'var(--bg-card)' : 'transparent',
                                        cursor: 'pointer',
                                        color: activeTab === 'logging' ? 'var(--text-primary)' : 'var(--text-secondary)',
                                        fontWeight: activeTab === 'logging' ? 600 : 500,
                                        fontSize: '14px',
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
                                        padding: '14px 16px',
                                        borderRadius: 'var(--radius-lg)',
                                        background: activeTab === 'search' ? 'var(--bg-card)' : 'transparent',
                                        cursor: 'pointer',
                                        color: activeTab === 'search' ? 'var(--text-primary)' : 'var(--text-secondary)',
                                        fontWeight: activeTab === 'search' ? 600 : 500,
                                        fontSize: '14px',
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
                                padding: '24px',
                            }}>
                                <motion.button
                                    whileHover={{ scale: 1.1, color: 'var(--text-primary)' }}
                                    onClick={onClose}
                                    style={{
                                        position: 'absolute',
                                        top: '20px',
                                        right: '24px',
                                        zIndex: 10,
                                        background: 'var(--bg-tertiary)',
                                        border: 'none',
                                        color: 'var(--text-muted)',
                                        cursor: 'pointer',
                                        fontSize: '24px',
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
                                </motion.button>

                                {activeTab === 'providers' && renderProvidersTab()}
                                {activeTab === 'display' && renderDisplayTab()}
                                {activeTab === 'logging' && renderLoggingTab()}
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
