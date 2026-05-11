/**
 * AgentConfigPanel — shared component for selecting per-agent model configurations.
 * Used by both HomeView and DebateControls to eliminate ~150 lines of duplication.
 */

import { motion } from 'framer-motion';
import { Brain, Settings2, Thermometer } from 'lucide-react';
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

const AGENT_ICONS: Record<string, string> = {
    proposer: '▲',
    opposer: '▼',
    judge: '◆',
    fact_checker: '●',
};

interface AgentConfigPanelProps {
    savedConfigs: ModelConfig[];
    agentPersonas?: AgentPersonaSummary[];
    selectedConfigIds: Record<AgentRole, string>;
    selectedPersonaIds?: Record<AgentRole, string>;
    temperatureInputs: Record<AgentRole, string>;
    enableThinking?: Record<AgentRole, boolean>;
    showConfigManager: boolean;
    setShowConfigManager: (v: boolean) => void;
    handleConfigSelect: (agent: AgentRole, value: string) => void;
    handlePersonaSelect?: (agent: AgentRole, value: string) => void;
    handleTemperatureChange: (agent: AgentRole, value: string) => void;
    handleThinkingToggle?: (agent: AgentRole, value: boolean) => void;
    readOnly?: boolean;
    manageButtonLabel?: string;
}

export default function AgentConfigPanel({
    savedConfigs, agentPersonas = [], selectedConfigIds, selectedPersonaIds,
    temperatureInputs,
    enableThinking,
    showConfigManager, setShowConfigManager, handleConfigSelect, handlePersonaSelect, handleTemperatureChange, handleThinkingToggle,
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
                style={{
                    width: '100%',
                    overflow: 'visible',
                    padding: '16px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-sm)',
                }}
            >
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    marginBottom: '14px' 
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Settings2 size={16} style={{ color: 'var(--text-muted)' }} />
                        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>模型配置</h4>
                    </div>
                    <button 
                        onClick={() => setShowConfigManager(true)} 
                        style={{ 
                            background: 'transparent', 
                            border: '1px solid var(--border-subtle)', 
                            color: 'var(--text-secondary)', 
                            padding: '4px 10px', 
                            borderRadius: 'var(--radius-md)', 
                            cursor: 'pointer', 
                            fontSize: '12px',
                            fontWeight: 500,
                        }}
                    >
                        {manageButtonLabel}
                    </button>
                </div>
                <div className="agent-config-panel__grid">
                    {AGENT_ROLES.map(agent => (
                        <div key={agent} className="agent-config-panel__card" style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            minWidth: 0,
                            padding: '12px',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-md)',
                        }}>
                            <div style={{ 
                                fontSize: '11px', 
                                fontWeight: 600, 
                                color: 'var(--text-muted)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                minWidth: 0,
                            }}>
                                <span style={{ fontSize: '10px' }}>{AGENT_ICONS[agent]}</span>
                                {AGENT_LABELS[agent]}
                            </div>
                            <CustomSelect
                                value={selectedConfigIds[agent]}
                                options={options}
                                onChange={(value) => handleConfigSelect(agent, value)}
                                size="sm"
                                width="100%"
                                disabled={readOnly}
                            />
                            {handlePersonaSelect && agentRoleSupportsPersona(agent) && (
                                <CustomSelect
                                    value={selectedPersonaIds?.[agent] ?? ''}
                                    options={buildPersonaOptions(agent)}
                                    onChange={(value) => handlePersonaSelect(agent, value)}
                                    size="sm"
                                    width="100%"
                                    disabled={readOnly}
                                />
                            )}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: handleThinkingToggle
                                    ? 'minmax(0, 1fr) auto'
                                    : 'minmax(0, 1fr)',
                                alignItems: 'stretch',
                                gap: '8px',
                                minWidth: 0,
                            }}>
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'auto minmax(0, 1fr)',
                                    alignItems: 'center',
                                    gap: '8px',
                                    minWidth: 0,
                                    padding: '0 10px',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--border-subtle)',
                                    background: 'var(--bg-card)',
                                }}>
                                    <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        minWidth: '42px',
                                        fontSize: '11px',
                                        color: 'var(--text-muted)',
                                        fontWeight: 600,
                                        whiteSpace: 'nowrap',
                                    }}>
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
                                        style={{
                                            width: '100%',
                                            minWidth: 0,
                                            padding: '8px 0',
                                            border: 'none',
                                            background: 'transparent',
                                            color: readOnly ? 'var(--text-secondary)' : 'var(--text-primary)',
                                            fontSize: '12px',
                                            outline: 'none',
                                            boxSizing: 'border-box',
                                            cursor: readOnly ? 'not-allowed' : 'text',
                                        }}
                                    />
                                </div>
                                {handleThinkingToggle && (
                                    <label
                                        htmlFor={`thinking-${agent}`}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            minWidth: 0,
                                            padding: '0 12px',
                                            borderRadius: 'var(--radius-md)',
                                            border: '1px solid var(--border-subtle)',
                                            background: (enableThinking?.[agent] ?? false)
                                                ? 'rgba(99, 102, 241, 0.08)'
                                                : 'var(--bg-card)',
                                            color: (enableThinking?.[agent] ?? false)
                                                ? 'var(--accent-indigo)'
                                                : 'var(--text-secondary)',
                                            cursor: readOnly ? 'not-allowed' : 'pointer',
                                            fontWeight: 500,
                                            fontSize: '11px',
                                            whiteSpace: 'nowrap',
                                            opacity: readOnly ? 0.7 : 1,
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            id={`thinking-${agent}`}
                                            checked={enableThinking?.[agent] ?? false}
                                            onChange={(event) => handleThinkingToggle(agent, event.target.checked)}
                                            disabled={readOnly}
                                            style={{ cursor: 'pointer', width: '14px', height: '14px', margin: 0 }}
                                        />
                                        <Brain size={12} />
                                        深度思考
                                    </label>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
                <div style={{
                    marginTop: '12px',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    lineHeight: 1.6,
                }}>
                    {readOnly
                        ? '当前面板为只读视图，用于核对本次会话实际使用的参数。'
                        : `Temperature 范围为 0-2。留空时使用默认值（${DEFAULT_AGENT_TEMPERATURE}）。人设文件位于 runtime/agent_personas。`}
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
