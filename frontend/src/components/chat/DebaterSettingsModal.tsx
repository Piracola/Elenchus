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
import { MODAL_MOTION, PRESSABLE, PRESSABLE_ICON } from '../../config/motion';
import { useDialogA11y } from '../../hooks/useDialogA11y';
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
        selectedConfigIds,
        temperatureInputs,
        showConfigManager,
        setShowConfigManager,
        handleConfigSelect,
        handleTemperatureChange,
        reload,
        buildAgentConfigs,
        isLoading: agentConfigsLoading,
        error: agentConfigsError,
    } = useAgentConfigs();
    const { currentSession } = useSessionViewState();
    const { updateCurrentSessionAgentConfigs } = useSessionActions();
    const popoverRef = useRef<HTMLDivElement>(null);
    const { dialogRef, onKeyDown: onDialogKeyDown } = useDialogA11y({ isOpen, onClose });
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
        }
    }, [
        currentSession,
        savedConfigs,
        handleConfigSelect,
        handleTemperatureChange,
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
        // Escape is handled on the dialog itself (useDialogA11y), not on the
        // document: a select menu open inside this popover must be able to
        // swallow its own Escape instead of closing the whole popover.
        const timerId = window.setTimeout(() => {
            document.addEventListener('mousedown', handlePointerDown);
        }, 0);

        return () => {
            window.clearTimeout(timerId);
            document.removeEventListener('mousedown', handlePointerDown);
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
                    ref={(node) => {
                        // One element, two consumers: the outside-click check and
                        // the dialog focus management.
                        popoverRef.current = node;
                        dialogRef.current = node;
                    }}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="debater-settings-title"
                    tabIndex={-1}
                    onKeyDown={onDialogKeyDown}
                    {...MODAL_MOTION}
                    style={{
                        ...popoverStyle,
                        padding: '14px',
                        ...HEADER_TOOLBAR_PANEL_STYLE,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        overflow: 'hidden',
                        transformOrigin: 'top left',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                            <h2 id="debater-settings-title" style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                辩手设置
                            </h2>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                保存后只影响后续 agent 调用，已完成的发言与评分不会改变。
                            </span>
                        </div>
                        <motion.button
                            type="button"
                            onClick={onClose}
                            {...PRESSABLE_ICON}
                            style={{
                                ...HEADER_TOOLBAR_SECONDARY_BUTTON_STYLE,
                                width: '32px',
                                height: '32px',
                                flexShrink: 0,
                                padding: 0,
                            }}
                            title="关闭辩手设置"
                            aria-label="关闭辩手设置"
                        >
                            <X size={14} />
                        </motion.button>
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
                            selectedConfigIds={selectedConfigIds}
                            temperatureInputs={temperatureInputs}
                            showConfigManager={showConfigManager}
                            setShowConfigManager={setShowConfigManager}
                            handleConfigSelect={handleConfigSelect}
                            handleTemperatureChange={handleTemperatureChange}
                            manageButtonLabel="管理配置"
                            titleLevel={3}
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <motion.button
                            type="button"
                            onClick={() => {
                                void reload();
                            }}
                            disabled={agentConfigsLoading || isSaving}
                            {...PRESSABLE}
                            whileTap={agentConfigsLoading || isSaving ? {} : PRESSABLE.whileTap}
                            style={{
                                ...HEADER_TOOLBAR_SECONDARY_BUTTON_STYLE,
                                opacity: agentConfigsLoading || isSaving ? 0.65 : 1,
                            }}
                        >
                            <RefreshCw size={13} />
                            刷新配置
                        </motion.button>
                        <motion.button
                            type="button"
                            onClick={() => {
                                void handleSave();
                            }}
                            disabled={isSaving || agentConfigsLoading}
                            {...PRESSABLE}
                            whileTap={isSaving || agentConfigsLoading ? {} : PRESSABLE.whileTap}
                            style={{
                                ...HEADER_TOOLBAR_PRIMARY_BUTTON_STYLE,
                                opacity: isSaving || agentConfigsLoading ? 0.65 : 1,
                            }}
                        >
                            <Save size={13} />
                            {isSaving ? '保存中...' : '保存设置'}
                        </motion.button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body,
    );
}
