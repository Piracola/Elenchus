/**
 * DebaterSettingsModal - 辩论中查看模型设置的弹窗
 * 注意：运行中的辩论无法动态切换模型，此弹窗主要用于查看当前配置
 * 用户可以通过"管理配置"添加新配置，下次创建辩论时生效
 */

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle } from 'lucide-react';
import { useAgentConfigs } from '../../hooks/useAgentConfigs';
import AgentConfigPanel from '../shared/AgentConfigPanel';

interface DebaterSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    sessionId: string;
}

export default function DebaterSettingsModal({
    isOpen,
    onClose,
    sessionId,
}: DebaterSettingsModalProps) {
    const {
        savedConfigs,
        selectedConfigIds,
        temperatureInputs,
        showConfigManager,
        setShowConfigManager,
        handleConfigSelect,
        handleTemperatureChange,
    } = useAgentConfigs();

    // 弹窗打开时关闭配置管理器
    useEffect(() => {
        if (!isOpen) {
            setShowConfigManager(false);
        }
    }, [isOpen, setShowConfigManager]);

    const handleClose = () => {
        setShowConfigManager(false);
        onClose();
    };

    const modalContent = (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* 背景遮罩 */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={handleClose}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(0,0,0,0.5)',
                            backdropFilter: 'blur(8px)',
                            zIndex: 2000,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        {/* 弹窗内容 */}
                        <motion.div
                            onClick={(e) => e.stopPropagation()}
                            initial={{ opacity: 0, scale: 0.9, y: 30 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 30 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            style={{
                                width: '90%',
                                maxWidth: '800px',
                                maxHeight: '85vh',
                                background: 'var(--bg-secondary)',
                                borderRadius: 'var(--radius-xl)',
                                boxShadow: 'var(--shadow-2xl)',
                                display: 'flex',
                                flexDirection: 'column',
                                overflow: 'hidden',
                                border: '1px solid var(--border-subtle)',
                            }}
                        >
                            {/* 标题栏 */}
                            <div style={{
                                padding: '20px 24px',
                                borderBottom: '1px solid var(--border-subtle)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}>
                                <div>
                                    <h2 style={{
                                        margin: '0 0 4px',
                                        fontSize: '20px',
                                        fontWeight: 700,
                                        color: 'var(--text-primary)',
                                    }}>
                                        辩手模型设置
                                    </h2>
                                    <p style={{
                                        margin: 0,
                                        fontSize: '13px',
                                        color: 'var(--text-muted)',
                                    }}>
                                        查看和管理各辩手的模型配置
                                    </p>
                                </div>
                                <motion.button
                                    whileHover={{ scale: 1.1, color: 'var(--text-primary)' }}
                                    onClick={handleClose}
                                    style={{
                                        background: 'var(--bg-tertiary)',
                                        border: 'none',
                                        color: 'var(--text-muted)',
                                        cursor: 'pointer',
                                        fontSize: '28px',
                                        width: '36px',
                                        height: '36px',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        boxShadow: 'var(--shadow-xs)',
                                    }}
                                >
                                    <X size={20} />
                                </motion.button>
                            </div>

                            {/* 内容区域 */}
                            <div style={{
                                flex: 1,
                                overflowY: 'auto',
                                padding: '24px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '16px',
                            }}>
                                {/* 警告提示 */}
                                <div style={{
                                    padding: '12px 16px',
                                    background: 'rgba(251, 191, 36, 0.1)',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid rgba(251, 191, 36, 0.3)',
                                    display: 'flex',
                                    gap: '12px',
                                    alignItems: 'flex-start',
                                }}>
                                    <AlertCircle size={18} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '1px' }} />
                                    <div>
                                        <p style={{
                                            margin: '0 0 4px',
                                            fontSize: '13px',
                                            fontWeight: 600,
                                            color: '#f59e0b',
                                        }}>
                                            当前辩论进行中
                                        </p>
                                        <p style={{
                                            margin: 0,
                                            fontSize: '12px',
                                            color: 'var(--text-secondary)',
                                            lineHeight: 1.6,
                                        }}>
                                            此处修改的配置仅对<b>后续新生成</b>的辩手发言生效（如下一轮辩论）。
                                            已生成的历史发言不会自动更改。如需完全应用新配置，建议停止当前辩论并创建新会话。
                                        </p>
                                    </div>
                                </div>

                                {/* 模型配置面板 */}
                                <AgentConfigPanel
                                    savedConfigs={savedConfigs}
                                    selectedConfigIds={selectedConfigIds}
                                    temperatureInputs={temperatureInputs}
                                    showConfigManager={showConfigManager}
                                    setShowConfigManager={setShowConfigManager}
                                    handleConfigSelect={handleConfigSelect}
                                    handleTemperatureChange={handleTemperatureChange}
                                />
                            </div>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );

    return createPortal(modalContent, document.body);
}

