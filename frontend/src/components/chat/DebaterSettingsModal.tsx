/**
 * DebaterSettingsModal - 辩论中查看当前会话实际使用配置的弹窗
 * 注意：运行中的辩论无法动态切换模型，此弹窗保持只读。
 */

import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle } from 'lucide-react';
import { useAgentConfigs } from '../../hooks/useAgentConfigs';
import { useSessionViewState } from '../../hooks/useDebateViewState';
import { AGENT_ROLES } from '../../utils/agent/agentConfigs';
import AgentConfigPanel from '../shared/AgentConfigPanel';

interface DebaterSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    sessionId: string;
}

export default function DebaterSettingsModal({
    isOpen,
    onClose,
    // sessionId reserved for future use
}: DebaterSettingsModalProps) {
    const {
        savedConfigs,
        agentPersonas,
        selectedConfigIds,
        selectedPersonaIds,
        temperatureInputs,
        enableThinking,
        showConfigManager,
        setShowConfigManager,
        handleConfigSelect,
        handlePersonaSelect,
        handleTemperatureChange,
        handleThinkingToggle,
        reload,
        isLoading: agentConfigsLoading,
        error: agentConfigsError,
    } = useAgentConfigs();
    const { currentSession } = useSessionViewState();
    const hasInitializedFromSessionRef = useRef(false);

    // Sync session agent_configs into the panel's local state when modal opens.
    // The home screen passes agent configs when creating a session; we read them
    // back here so the in-debate settings panel reflects what was actually used.
    const initializeFromSession = useCallback(() => {
        const agentConfigs = currentSession?.agent_configs;
        if (!agentConfigs || Object.keys(agentConfigs).length === 0) return;
        if (savedConfigs.length === 0) return;

        for (const role of AGENT_ROLES) {
            const cfg = agentConfigs[role];
            if (!cfg) continue;

            // Build "providerId::model" key for selectedConfigIds
            const providerId = cfg.provider_id ?? '';
            const model = cfg.model ?? '';
            if (providerId || model) {
                const key = providerId && model ? `${providerId}::${model}` : providerId || model;
                handleConfigSelect(role, key);
            }

            // Sync temperature
            if (cfg.temperature !== undefined) {
                handleTemperatureChange(role, String(cfg.temperature));
            }

            // Sync enable_thinking back from session
            if (cfg.enable_thinking !== undefined) {
                handleThinkingToggle(role, cfg.enable_thinking);
            }

            if (cfg.persona_id) {
                handlePersonaSelect(role, cfg.persona_id);
            }
        }
    }, [currentSession, savedConfigs, handleConfigSelect, handleTemperatureChange, handleThinkingToggle, handlePersonaSelect]);

    useEffect(() => {
        if (isOpen && savedConfigs.length > 0 && !hasInitializedFromSessionRef.current) {
            hasInitializedFromSessionRef.current = true;
            initializeFromSession();
        }
        if (!isOpen) {
            hasInitializedFromSessionRef.current = false;
        }
    }, [isOpen, savedConfigs.length, initializeFromSession]);

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
                                        本次会话模型配置
                                    </h2>
                                    <p style={{
                                        margin: 0,
                                        fontSize: '13px',
                                        color: 'var(--text-muted)',
                                    }}>
                                        查看当前会话实际使用的模型、人设与温度参数
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
                                            当前辩论参数不可在此处热更新
                                        </p>
                                        <p style={{
                                            margin: 0,
                                            fontSize: '12px',
                                            color: 'var(--text-secondary)',
                                            lineHeight: 1.6,
                                        }}>
                                            这里展示的是本次会话已经采用的参数快照。若要调整后续新会话的默认配置，请打开“管理配置”后返回首页重新创建辩论。
                                        </p>
                                    </div>
                                </div>

                                {agentConfigsLoading && (
                                    <div style={{
                                        padding: '10px 12px',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid var(--border-subtle)',
                                        background: 'var(--bg-card)',
                                        color: 'var(--text-muted)',
                                        fontSize: '12px',
                                    }}>
                                        正在加载配置...
                                    </div>
                                )}

                                {agentConfigsError && (
                                    <div style={{
                                        padding: '10px 12px',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid rgba(239, 68, 68, 0.25)',
                                        background: 'rgba(239, 68, 68, 0.08)',
                                        color: 'var(--text-secondary)',
                                        fontSize: '12px',
                                    }}>
                                        {agentConfigsError}
                                    </div>
                                )}

                                {/* 模型配置面板 */}
                                <AgentConfigPanel
                                    savedConfigs={savedConfigs}
                                    agentPersonas={agentPersonas}
                                    selectedConfigIds={selectedConfigIds}
                                    selectedPersonaIds={selectedPersonaIds}
                                    temperatureInputs={temperatureInputs}
                                    enableThinking={enableThinking}
                                    showConfigManager={showConfigManager}
                                    setShowConfigManager={setShowConfigManager}
                                    handleConfigSelect={handleConfigSelect}
                                    handlePersonaSelect={handlePersonaSelect}
                                    handleTemperatureChange={handleTemperatureChange}
                                    handleThinkingToggle={handleThinkingToggle}
                                    readOnly
                                    manageButtonLabel="管理配置并刷新"
                                />
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'flex-end',
                                    gap: '8px',
                                }}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            void reload();
                                        }}
                                        style={{
                                            border: '1px solid var(--border-subtle)',
                                            background: 'var(--bg-card)',
                                            color: 'var(--text-secondary)',
                                            borderRadius: 'var(--radius-md)',
                                            padding: '8px 12px',
                                            cursor: 'pointer',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                        }}
                                    >
                                        重新读取当前配置
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );

    return createPortal(modalContent, document.body);
}

