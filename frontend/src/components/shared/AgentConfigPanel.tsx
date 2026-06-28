/**
 * AgentConfigPanel — shared component for selecting per-agent model configurations.
 * Used by both HomeView and DebateControls to eliminate ~150 lines of duplication.
 */

import { motion } from 'framer-motion';
import { Settings2, Thermometer } from 'lucide-react';
import CustomSelect from './CustomSelect';
import SettingsPanel from '../sidebar/SettingsPanel';
import type { AgentPersonaSummary, ModelConfig } from '../../types';
import {
    AGENT_ROLES,
    DEFAULT_AGENT_TEMPERATURE,
    agentRoleSupportsPersona,
    type AgentRole,
} from '../../utils/agent/agentConfigs';

export type { AgentConfigResult } from '../../types';

const AGENT_LABELS: Record<string, string> = {
    proposer: '正方',
    opposer: '反方',
    judge: '裁判',
    fact_checker: '事实核查',
};

interface AgentConfigPanelProps {
    savedConfigs: ModelConfig[];
    agentPersonas?: AgentPersonaSummary[];
    selectedConfigIds: Record<AgentRole, string>;
    selectedPersonaIds?: Record<AgentRole, string>;
    temperatureInputs: Record<AgentRole, string>;
    showConfigManager: boolean;
    setShowConfigManager: (v: boolean) => void;
    handleConfigSelect: (agent: AgentRole, value: string) => void;
    handlePersonaSelect?: (agent: AgentRole, value: string) => void;
    handleTemperatureChange: (agent: AgentRole, value: string) => void;
    readOnly?: boolean;
    manageButtonLabel?: string;
}

export default function AgentConfigPanel({
    savedConfigs, agentPersonas = [], selectedConfigIds, selectedPersonaIds,
    temperatureInputs,
    showConfigManager, setShowConfigManager, handleConfigSelect, handlePersonaSelect, handleTemperatureChange,
    readOnly = false,
    manageButtonLabel = '管理配置',
}: AgentConfigPanelProps) {

    const buildOptions = () => {
        const options = [{ value: '', label: '默认配置' }];
        savedConfigs.forEach(c => {
            c.models?.forEach(m => {
                options.push({
                    value: `${c.id}::${m}`,
                    label: `${c.is_default ? '⭐ ' : ''}${c.name} — ${m}`,
                });
            });
        });
        return options;
    };

    const options = buildOptions();
    const buildPersonaOptions = (agent: AgentRole) => {
        const personaOptions = [{ value: '', label: '默认人设' }];
        agentPersonas
            .filter((persona) => persona.roles.length === 0 || persona.roles.includes(agent))
            .forEach((persona) => {
                personaOptions.push({
                    value: persona.id,
                    label: persona.name,
                });
            });
        return personaOptions;
    };

    return (
        <>
            <motion.div
                className="agent-config-panel"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
            >
                <div className="agent-config-panel__header">
                    <div className="agent-config-panel__title-wrap">
                        <span className="agent-config-panel__title-icon">
                            <Settings2 size={15} />
                        </span>
                        <div style={{ minWidth: 0 }}>
                            <h4 className="agent-config-panel__title">执行模型</h4>
                            <p className="agent-config-panel__description">
                                为每个角色指定模型、人设与温度；深度思考由设置页的服务商选项统一控制。
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
                                    {agentRoleSupportsPersona(agent) ? '可绑定角色人设' : '使用模型配置执行'}
                                </span>
                            </div>

                            <div
                                className={`agent-config-panel__controls ${
                                    handlePersonaSelect && agentRoleSupportsPersona(agent)
                                        ? 'agent-config-panel__controls--with-persona'
                                        : ''
                                }`}
                            >
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
                                {handlePersonaSelect && agentRoleSupportsPersona(agent) && (
                                    <div className="agent-config-panel__control agent-config-panel__control--persona">
                                        <span className="agent-config-panel__control-label">人设</span>
                                        <CustomSelect
                                            value={selectedPersonaIds?.[agent] ?? ''}
                                            options={buildPersonaOptions(agent)}
                                            onChange={(value) => handlePersonaSelect(agent, value)}
                                            size="sm"
                                            width="100%"
                                            disabled={readOnly}
                                        />
                                    </div>
                                )}
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
