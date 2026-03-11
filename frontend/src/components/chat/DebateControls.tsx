/**
 * DebateControls — The input bar to start/stop debates.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDebateStore } from '../../stores/debateStore';
import { useDebateWebSocket } from '../../hooks/useDebateWebSocket';
import { api } from '../../api/client';
import ModelConfigManager from '../sidebar/ModelConfigManager';
import type { ModelConfig } from '../../types';

export default function DebateControls() {
    const {
        currentSessionId,
        isDebating,
        isConnected,
        setCurrentSessionId,
        setCurrentSession
    } = useDebateStore();

    const { startDebate, stopDebate } = useDebateWebSocket(currentSessionId);

    const [topic, setTopic] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [showConfigManager, setShowConfigManager] = useState(false);
    const [savedConfigs, setSavedConfigs] = useState<ModelConfig[]>([]);

    // Advanced config state - now holding selected ModelConfig ID or purely the base properties if customizing further.
    // For simplicity, we just hold the ID of the selected config for each agent.
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

    const handleStart = async () => {
        if (!topic.trim()) return;

        try {
            setIsCreating(true);
            const agentConfigs: Record<string, any> = {};
            for (const [key, selectedKey] of Object.entries(selectedConfigIds)) {
                if (!selectedKey) continue;
                // selectedKey is `providerId::modelString`
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
            setTopic('');
        }
    };

    if (currentSessionId) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="glass" style={{
                padding: '12px 24px',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: isConnected ? 'var(--accent-emerald)' : 'var(--accent-rose)'
                    }} />
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                        {isConnected ? '已连接' : '连接中断'}
                    </span>
                </div>

                {isDebating ? (
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={stopDebate}
                        style={{
                            padding: '8px 20px',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--color-opposer)',
                            background: 'transparent',
                            color: 'var(--color-opposer)',
                            fontWeight: 600,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        终止辩论
                    </motion.button>
                ) : (
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => startDebate(useDebateStore.getState().currentSession?.topic || '新辩论', ['proposer', 'opposer'], 3)}
                        disabled={!isConnected}
                        style={{
                            padding: '8px 24px',
                            borderRadius: 'var(--radius-md)',
                            border: 'none',
                            background: 'var(--text-primary)',
                            color: 'var(--bg-primary)',
                            fontWeight: 600,
                            cursor: isConnected ? 'pointer' : 'not-allowed',
                            opacity: isConnected ? 1 : 0.5,
                            whiteSpace: 'nowrap'
                        }}
                    >
                        执行辩论
                    </motion.button>
                )}
            </div>
            
            <div className="glass" style={{
                padding: '16px 24px',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                gap: '12px',
                alignItems: 'center'
            }}>
                <input
                    type="text"
                    placeholder="你可以对当前的观点提出质疑，进行补充发言..."
                    disabled={true} 
                    style={{
                        flex: 1,
                        padding: '12px 16px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-primary)',
                        outline: 'none',
                        cursor: 'not-allowed',
                        opacity: 0.6
                    }}
                    title="观众介入功能开发中..."
                />
                <motion.button
                    disabled={true}
                    style={{
                        padding: '12px 24px',
                        borderRadius: 'var(--radius-md)',
                        border: 'none',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-muted)',
                        fontWeight: 600,
                        cursor: 'not-allowed',
                        opacity: 0.6,
                        whiteSpace: 'nowrap'
                    }}
                >
                    发送介入
                </motion.button>
            </div>
        </div>
        );
    }

    // No session selected — show creation input
    return (
        <div style={{ position: 'relative' }}>
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
                                        <option value="">默认配置 (.env)</option>
                                        {savedConfigs.map(c => 
                                            c.models && c.models.map(m => (
                                                <option key={`${c.id}::${m}`} value={`${c.id}::${m}`}>
                                                    {c.name} - {m}
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

            <div className="glass" style={{
                padding: '16px 24px',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                gap: '12px',
            }}>
                <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    style={{
                        padding: '12px',
                        borderRadius: 'var(--radius-md)',
                        background: showAdvanced ? 'var(--bg-tertiary)' : 'transparent',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                    title="进阶模型配置"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16v0Z"></path>
                        <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4v0Z"></path>
                        <path d="M12 2v2"></path>
                        <path d="M12 22v-2"></path>
                        <path d="m17 20.66-1-1.73"></path>
                        <path d="M11 10.27 7 3.34"></path>
                        <path d="m20.66 17-1.73-1"></path>
                        <path d="m3.34 7 1.73 1"></path>
                        <path d="M14 12h8"></path>
                        <path d="M2 12h2"></path>
                        <path d="m20.66 7-1.73 1"></path>
                        <path d="m3.34 17 1.73-1"></path>
                        <path d="m17 3.34-1 1.73"></path>
                        <path d="m11 13.73-4 6.93"></path>
                    </svg>
                </button>
                <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleStart()}
                    placeholder="输入辩论主题，创建新 Session..."
                    disabled={isCreating}
                    style={{
                        flex: 1,
                        padding: '12px 16px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-primary)',
                        outline: 'none',
                    }}
                />
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleStart}
                    disabled={isCreating || !topic.trim()}
                    style={{
                        padding: '12px 24px',
                        borderRadius: 'var(--radius-md)',
                        border: 'none',
                        background: 'var(--text-primary)',
                        color: 'var(--bg-primary)',
                        fontWeight: 600,
                        cursor: (isCreating || !topic.trim()) ? 'not-allowed' : 'pointer',
                        opacity: (isCreating || !topic.trim()) ? 0.7 : 1,
                    }}
                >
                    {isCreating ? '创建中...' : '创建 Session'}
                </motion.button>
            </div>
        </div>
    );
}
