/**
 * AgentConfigPanel — shared component for selecting per-agent model configurations.
 * Used by both HomeView and DebateControls to eliminate ~150 lines of duplication.
 */

import { motion } from 'framer-motion';
import { Settings2, Thermometer } from 'lucide-react';
import CustomSelect from './CustomSelect';
import SettingsPanel from '../sidebar/SettingsPanel';
import { POPOVER_MOTION } from '../../config/motion';
import type { ModelConfig } from '../../types';
import {
    AGENT_ROLES,
    DEFAULT_AGENT_TEMPERATURE,
    buildModelConfigOptions,
    type AgentRole,
} from '../../utils/agent/agentConfigs';

export type { AgentConfigResult } from '../../types';

const AGENT_LABELS: Record<string, string> = {
    proposer: '正方',
    opposer: '反方',
    judge: '裁判',
    fact_checker: '事实核查',
    group_discussion: '组内讨论',
};

interface AgentConfigPanelProps {
    savedConfigs: ModelConfig[];
    selectedConfigIds: Record<AgentRole, string>;
    temperatureInputs: Record<AgentRole, string>;
    showConfigManager: boolean;
    setShowConfigManager: (v: boolean) => void;
    handleConfigSelect: (agent: AgentRole, value: string) => void;
    handleTemperatureChange: (agent: AgentRole, value: string) => void;
    readOnly?: boolean;
    manageButtonLabel?: string;
    /**
     * Depth of the panel title in the surrounding document. HomeView nests it
     * directly under the page h1; inside a dialog it sits under the dialog's own
     * h2. A fixed level would skip a level in one of the two.
     */
    titleLevel?: 2 | 3;
}

export default function AgentConfigPanel({
    savedConfigs, selectedConfigIds,
    temperatureInputs,
    showConfigManager, setShowConfigManager, handleConfigSelect, handleTemperatureChange,
    readOnly = false,
    manageButtonLabel = '管理配置',
    titleLevel = 2,
}: AgentConfigPanelProps) {
    const TitleTag = `h${titleLevel}` as 'h2' | 'h3';

    const options = buildModelConfigOptions(savedConfigs);

    return (
        <>
            {/* No AnimatePresence here on purpose: this panel has no visibility prop of
                its own, so a local AnimatePresence would report "present" forever and
                actually swallow the exit it is meant to enable. The exit below is driven
                by the caller's AnimatePresence (HomeView / DebaterSettingsModal), which
                propagates presence down to nested motion components. */}
            <motion.div
                className="agent-config-panel"
                {...POPOVER_MOTION}
            >
                <div className="agent-config-panel__header">
                    <div className="agent-config-panel__title-wrap">
                        <span className="agent-config-panel__title-icon">
                            <Settings2 size={15} />
                        </span>
                        <div style={{ minWidth: 0 }}>
                            <TitleTag className="agent-config-panel__title">执行模型</TitleTag>
                            <p className="agent-config-panel__description">
                                为每个角色指定模型与温度；深度思考由设置页的服务商选项统一控制。
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowConfigManager(true)}
                        className="agent-config-panel__manage-button"
                    >
                        {manageButtonLabel}
                    </button>
                </div>

                <div className="agent-config-panel__rows">
                    {AGENT_ROLES.map(agent => (
                        <div key={agent} className="agent-config-panel__row">
                            <div className="agent-config-panel__role">
                                <span className="agent-config-panel__role-name">
                                    {AGENT_LABELS[agent]}
                                </span>
                                <span className="agent-config-panel__role-description">
                                    使用模型配置执行
                                </span>
                            </div>

                            <div className="agent-config-panel__controls">
                                <div className="agent-config-panel__control agent-config-panel__control--model">
                                    <span className="agent-config-panel__control-label">模型</span>
                                    <CustomSelect
                                        value={selectedConfigIds[agent]}
                                        options={options}
                                        onChange={(value) => handleConfigSelect(agent, value)}
                                        size="sm"
                                        width="100%"
                                        disabled={readOnly}
                                    />
                                </div>
                                <label className="agent-config-panel__temperature">
                                    <span className="agent-config-panel__temperature-label">
                                        <Thermometer size={12} />
                                        Temp
                                    </span>
                                    <input
                                        type="number"
                                        value={temperatureInputs[agent]}
                                        onChange={(event) => handleTemperatureChange(agent, event.target.value)}
                                        placeholder={String(DEFAULT_AGENT_TEMPERATURE)}
                                        min={0}
                                        max={2}
                                        step={0.1}
                                        disabled={readOnly}
                                        className="agent-config-panel__temperature-input"
                                    />
                                </label>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="agent-config-panel__hint">
                    {readOnly
                        ? '当前面板为只读视图，用于核对本次会话实际使用的参数。'
                        : `Temperature 范围为 0-2。留空时使用默认值（${DEFAULT_AGENT_TEMPERATURE}）。服务商级深度思考在设置页统一配置。`}
                </div>
            </motion.div>
            <SettingsPanel
                isOpen={showConfigManager}
                onClose={() => setShowConfigManager(false)}
                initialTab="providers"
            />
        </>
    );
}
