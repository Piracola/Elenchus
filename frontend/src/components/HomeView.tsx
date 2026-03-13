import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { useDebateStore } from '../stores/debateStore';
import { api } from '../api/client';
import type { ModelConfig } from '../types';
import ModelConfigManager from './sidebar/ModelConfigManager';

export default function HomeView() {
    const [topic, setTopic] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const { setCurrentSessionId, setCurrentSession } = useDebateStore();

    const [showAdvanced, setShowAdvanced] = useState(false);
    const [showConfigManager, setShowConfigManager] = useState(false);
    const [savedConfigs, setSavedConfigs] = useState<ModelConfig[]>([]);
    const [selectedConfigIds, setSelectedConfigIds] = useState<Record<string, string>>({
        proposer: '',
        opposer: '',
        judge: '',
        fact_checker: '',
    });

    useEffect(() => {
        if (showAdvanced) {
            loadConfigs();
        }
    }, [showAdvanced, showConfigManager]);

    const loadConfigs = async () => {
        try {
            const data = await api.models.list();
            setSavedConfigs(data);
        } catch (err) {
            console.error(err);
        }
    };

    const handleConfigSelect = (agent: string, configId: string) => {
        setSelectedConfigIds(prev => ({ ...prev, [agent]: configId }));
    };

    const handleCreateDebate = async () => {
        if (!topic.trim() || isCreating) return;

        try {
            setIsCreating(true);
            const agentConfigs: Record<string, any> = {};
            for (const [key, selectedKey] of Object.entries(selectedConfigIds)) {
                if (!selectedKey) continue;
                const [providerId, modelStr] = selectedKey.split('::');
                const configDef = savedConfigs.find(c => c.id === providerId);
                if (configDef) {
                    agentConfigs[key] = {
                        model: modelStr,
                        provider_type: configDef.provider_type,
                        api_key: configDef.api_key || undefined,
                        api_base_url: configDef.api_base_url || undefined,
                    };
                }
            }

            const session = await api.sessions.create({
                topic: topic.trim(),
                max_turns: 3,
                agent_configs: Object.keys(agentConfigs).length > 0 ? agentConfigs : undefined,
            });
            setCurrentSession(session);
            setCurrentSessionId(session.id);
        } catch (err) {
            console.error('Failed to create session:', err);
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            background: 'var(--bg-primary)'
        }}>
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                style={{
                    width: '100%',
                    maxWidth: '680px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center'
                }}
            >
                {/* Title */}
                <h1 style={{
                    fontSize: '48px',
                    fontWeight: 600,
                    marginBottom: '40px',
                    color: 'var(--text-primary)',
                    letterSpacing: '-0.02em'
                }}>
                    Elenchus
                </h1>

                {/* Input Area */}
                <div style={{
                    width: '100%',
                    background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border-subtle)',
                    padding: '16px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                }}>
                    <textarea
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        placeholder="输入辩题......"
                        rows={4}
                        style={{
                            width: '100%',
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            color: 'var(--text-primary)',
                            fontSize: '15px',
                            resize: 'none',
                            lineHeight: 1.5
                        }}
                    />

                    {/* Bottom Controls */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '12px',
                        borderTop: '1px solid var(--border-subtle)',
                        paddingTop: '12px',
                        position: 'relative'
                    }}>
                        
                        <AnimatePresence>
                            {showAdvanced && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    style={{
                                        position: 'absolute',
                                        bottom: '100%',
                                        left: 0,
                                        right: 0,
                                        marginBottom: '16px',
                                        padding: '20px',
                                        background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border-subtle)',
                                        borderRadius: 'var(--radius-lg)',
                                        zIndex: 10,
                                        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                        <h4 style={{ margin: 0, fontSize: '15px' }}>进阶模型配置</h4>
                                        <button onClick={() => setShowConfigManager(true)} style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
                                            管理预设库
                                        </button>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                                        {['proposer', 'opposer', 'judge', 'fact_checker'].map(agent => (
                                            <div key={agent} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
                                                    {agent === 'proposer' ? '正方 (Proposer)' : agent === 'opposer' ? '反方 (Opposer)' : agent === 'judge' ? '裁判 (Judge)' : '事实核查员 (Fact Checker)'}
                                                </div>
                                                <select
                                                    value={selectedConfigIds[agent]}
                                                    onChange={e => handleConfigSelect(agent, e.target.value)}
                                                    style={{
                                                        padding: '8px',
                                                        borderRadius: '4px',
                                                        background: 'var(--bg-tertiary)',
                                                        border: '1px solid var(--border-subtle)',
                                                        color: 'var(--text-primary)',
                                                        fontSize: '13px',
                                                        outline: 'none',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <option value="">默认配置 (应用全局设置)</option>
                                                    {savedConfigs.map(c => 
                                                        c.models && c.models.map(m => (
                                                            <option key={`${c.id}::${m}`} value={`${c.id}::${m}`}>
                                                                {c.is_default ? '⭐ ' : ''}{c.name} - {m}
                                                            </option>
                                                        ))
                                                    )}
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <ModelConfigManager isOpen={showConfigManager} onClose={() => setShowConfigManager(false)} />

                        {/* Agent Selector */}
                        <div style={{ display: 'flex', justifyContent: 'flex-start', flex: 1 }}>
                            <button
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    background: showAdvanced ? 'var(--bg-primary)' : 'var(--bg-tertiary)',
                                    border: '1px solid var(--border-subtle)',
                                    color: 'var(--text-secondary)',
                                    padding: '6px 12px',
                                    borderRadius: 'var(--radius-sm)',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    transition: 'background var(--transition-fast)'
                                }}
                                onMouseOver={(e) => { if (!showAdvanced) e.currentTarget.style.background = 'var(--bg-primary)' }}
                                onMouseOut={(e) => { if (!showAdvanced) e.currentTarget.style.background = 'var(--bg-tertiary)' }}
                            >
                                选择Agent <ChevronDown size={14} style={{ transform: showAdvanced ? 'rotate(180deg)' : 'none', transition: 'transform var(--transition-fast)' }} />
                            </button>
                        </div>

                        <button
                            onClick={handleCreateDebate}
                            disabled={!topic.trim() || isCreating}
                            style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                background: topic.trim() && !isCreating ? 'var(--text-primary)' : 'var(--bg-tertiary)',
                                color: topic.trim() && !isCreating ? 'var(--bg-primary)' : 'var(--text-muted)',
                                border: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: topic.trim() && !isCreating ? 'pointer' : 'not-allowed',
                                transition: 'all var(--transition-fast)'
                            }}
                        >
                            <ArrowRight size={16} />
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
