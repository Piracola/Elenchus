/**
 * DebaterSettingsModal - toolbar popover for editing current session agent settings.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, Save, X } from 'lucide-react';
import { api } from '../../api/client';
import { useAgentConfigs } from '../../hooks/useAgentConfigs';
import { useSessionActions, useSessionViewState } from '../../hooks/useDebateViewState';
import { toast } from '../../utils/chat/toast';
import { AGENT_ROLES } from '../../utils/agent/agentConfigs';
import AgentConfigPanel from '../shared/AgentConfigPanel';
import {
    HEADER_TOOLBAR_PANEL_STYLE,
    HEADER_TOOLBAR_PRIMARY_BUTTON_STYLE,
    HEADER_TOOLBAR_SECONDARY_BUTTON_STYLE,
} from './toolbarStyles';

interface DebaterSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    sessionId: string;
    anchorRef?: RefObject<HTMLElement | null>;
}

const HIDDEN_POPOVER_STYLE: CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    opacity: 0,
    pointerEvents: 'none',
};

export default function DebaterSettingsModal({
    isOpen,
    onClose,
    sessionId,
    anchorRef,
}: DebaterSettingsModalProps) {
    const {
        savedConfigs,
        agentPersonas,
        selectedConfigIds,
        selectedPersonaIds,
        temperatureInputs,
        showConfigManager,
        setShowConfigManager,
        handleConfigSelect,
        handlePersonaSelect,
        handleTemperatureChange,
        reload,
        buildAgentConfigs,
        isLoading: agentConfigsLoading,
        error: agentConfigsError,
    } = useAgentConfigs();
    const { currentSession } = useSessionViewState();
    const { updateCurrentSessionAgentConfigs } = useSessionActions();
    const popoverRef = useRef<HTMLDivElement>(null);
    const [popoverStyle, setPopoverStyle] = useState<CSSProperties>(HIDDEN_POPOVER_STYLE);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const hasInitializedFromSessionRef = useRef(false);

    const initializeFromSession = useCallback(() => {
        const agentConfigs = currentSession?.agent_configs;
        if (!agentConfigs || Object.keys(agentConfigs).length === 0) return;
        if (savedConfigs.length === 0) return;

        for (const role of AGENT_ROLES) {
            const cfg = agentConfigs[role];
            if (!cfg) continue;

            const providerId = cfg.provider_id ?? '';
            const model = cfg.model ?? '';
            if (providerId || model) {
                const key = providerId && model ? `${providerId}::${model}` : providerId || model;
                handleConfigSelect(role, key);
            } else {
                handleConfigSelect(role, '');
            }

            handleTemperatureChange(role, cfg.temperature !== undefined ? String(cfg.temperature) : '');
            handlePersonaSelect(role, cfg.persona_id ?? '');
        }
    }, [
        currentSession,
        savedConfigs,
        handleConfigSelect,
        handleTemperatureChange,
        handlePersonaSelect,
    ]);

    const updatePopoverPosition = useCallback(() => {
        const anchor = anchorRef?.current;
        if (!anchor) {
            setPopoverStyle({
                position: 'fixed',
                top: 92,
                left: 24,
                width: 'min(720px, calc(100vw - 32px))',
                maxHeight: 'calc(100vh - 116px)',
                zIndex: 2200,
            });
            return;
        }

        const rect = anchor.getBoundingClientRect();
        const width = Math.min(720, window.innerWidth - 32);
        const left = Math.min(Math.max(16, rect.left), window.innerWidth - width - 16);
        const top = Math.min(rect.bottom + 8, window.innerHeight - 120);

        setPopoverStyle({
            position: 'fixed',
            top,
            left,
            width,
            maxHeight: `min(640px, ${Math.max(220, window.innerHeight - top - 16)}px)`,
            zIndex: 2200,
        });
    }, [anchorRef]);

    useEffect(() => {
        if (isOpen && savedConfigs.length > 0 && !hasInitializedFromSessionRef.current) {
            hasInitializedFromSessionRef.current = true;
            initializeFromSession();
        }
        if (!isOpen) {
            hasInitializedFromSessionRef.current = false;
            setShowConfigManager(false);
            setSaveError(null);
        }
    }, [isOpen, savedConfigs.length, initializeFromSession, setShowConfigManager]);

    useLayoutEffect(() => {
        if (!isOpen) return;

        updatePopoverPosition();
        const rafId = window.requestAnimationFrame(updatePopoverPosition);
        window.addEventListener('resize', updatePopoverPosition);
        window.addEventListener('scroll', updatePopoverPosition, true);

        return () => {
            window.cancelAnimationFrame(rafId);
            window.removeEventListener('resize', updatePopoverPosition);
            window.removeEventListener('scroll', updatePopoverPosition, true);
        };
    }, [isOpen, updatePopoverPosition]);

    useEffect(() => {
        if (!isOpen) return;

        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            const targetElement = target instanceof Element ? target : null;
            if (
                anchorRef?.current?.contains(target)
                || popoverRef.current?.contains(target)
                || targetElement?.closest('[data-floating-select-menu="true"]')
            ) {
                return;
            }
            onClose();
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };

        const timerId = window.setTimeout(() => {
            document.addEventListener('mousedown', handlePointerDown);
            document.addEventListener('keydown', handleKeyDown);
        }, 0);

        return () => {
            window.clearTimeout(timerId);
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [anchorRef, isOpen, onClose]);

    const handleSave = async () => {
        setIsSaving(true);
        setSaveError(null);
        try {
            const updatedSession = await api.sessions.updateAgentConfigs(sessionId, {
                agent_configs: buildAgentConfigs(),
            });
            updateCurrentSessionAgentConfigs(updatedSession.agent_configs);
            toast('辩手设置已保存，后续 agent 将使用新配置', 'success');
        } catch (error) {
            const message = error instanceof Error ? error.message : '保存辩手设置失败';
            setSaveError(message);
            toast(message, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    if (typeof document === 'undefined') {
        return null;
    }

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    ref={popoverRef}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                    style={{
                        ...popoverStyle,
                        padding: '14px',
                        ...HEADER_TOOLBAR_PANEL_STYLE,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        overflow: 'hidden',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                辩手设置
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                保存后只影响后续 agent 调用，已完成的发言与评分不会改变。
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                ...HEADER_TOOLBAR_SECONDARY_BUTTON_STYLE,
                                width: '32px',
                                height: '32px',
                                flexShrink: 0,
                                padding: 0,
                            }}
                            title="关闭辩手设置"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    {(agentConfigsLoading || agentConfigsError || saveError) && (
                        <div
                            style={{
                                padding: '10px 12px',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border-subtle)',
                                background: 'var(--bg-secondary)',
                                color: agentConfigsError || saveError ? 'var(--accent-rose)' : 'var(--text-secondary)',
                                fontSize: '12px',
                                lineHeight: 1.5,
                            }}
                        >
                            {agentConfigsError || saveError || '正在加载配置...'}
                        </div>
                    )}

                    <div style={{ overflowY: 'auto', paddingRight: '2px' }}>
                        <AgentConfigPanel
                            savedConfigs={savedConfigs}
                            agentPersonas={agentPersonas}
                            selectedConfigIds={selectedConfigIds}
                            selectedPersonaIds={selectedPersonaIds}
                            temperatureInputs={temperatureInputs}
                            showConfigManager={showConfigManager}
                            setShowConfigManager={setShowConfigManager}
                            handleConfigSelect={handleConfigSelect}
                            handlePersonaSelect={handlePersonaSelect}
                            handleTemperatureChange={handleTemperatureChange}
                            manageButtonLabel="管理配置"
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <button
                            type="button"
                            onClick={() => {
                                void reload();
                            }}
                            disabled={agentConfigsLoading || isSaving}
                            style={{
                                ...HEADER_TOOLBAR_SECONDARY_BUTTON_STYLE,
                                opacity: agentConfigsLoading || isSaving ? 0.65 : 1,
                            }}
                        >
                            <RefreshCw size={13} />
                            刷新配置
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                void handleSave();
                            }}
                            disabled={isSaving || agentConfigsLoading}
                            style={{
                                ...HEADER_TOOLBAR_PRIMARY_BUTTON_STYLE,
                                opacity: isSaving || agentConfigsLoading ? 0.65 : 1,
                            }}
                        >
                            <Save size={13} />
                            {isSaving ? '保存中...' : '保存设置'}
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body,
    );
}
