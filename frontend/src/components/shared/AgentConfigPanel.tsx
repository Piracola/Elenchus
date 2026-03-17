/**
 * AgentConfigPanel — shared component for selecting per-agent model configurations.
 * Used by both HomeView and DebateControls to eliminate ~150 lines of duplication.
 */

import { motion } from 'framer-motion';
import { Settings2 } from 'lucide-react';
import ModelConfigManager from '../sidebar/ModelConfigManager';
import CustomSelect from './CustomSelect';
import type { ModelConfig } from '../../types';

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

const AGENTS = ['proposer', 'opposer', 'judge', 'fact_checker'] as const;

interface AgentConfigPanelProps {
    show?: boolean;
    onToggle?: () => void;
    savedConfigs: ModelConfig[];
    selectedConfigIds: Record<string, string>;
    showConfigManager: boolean;
    setShowConfigManager: (v: boolean) => void;
    handleConfigSelect: (agent: string, value: string) => void;
}

export default function AgentConfigPanel({
    savedConfigs, selectedConfigIds,
    showConfigManager, setShowConfigManager, handleConfigSelect,
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

    return (
        <>
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                style={{
                    width: '100%',
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
                        管理配置
                    </button>
                </div>
                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
                    gap: '12px' 
                }}>
                    {AGENTS.map(agent => (
                        <div key={agent} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <div style={{ 
                                fontSize: '11px', 
                                fontWeight: 600, 
                                color: 'var(--text-muted)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                            }}>
                                <span style={{ fontSize: '10px' }}>{AGENT_ICONS[agent]}</span>
                                {AGENT_LABELS[agent]}
                            </div>
                            <CustomSelect
                                value={selectedConfigIds[agent]}
                                options={options}
                                onChange={(value) => handleConfigSelect(agent, value)}
                                size="sm"
                            />
                        </div>
                    ))}
                </div>
            </motion.div>
            <ModelConfigManager isOpen={showConfigManager} onClose={() => setShowConfigManager(false)} />
        </>
    );
}
