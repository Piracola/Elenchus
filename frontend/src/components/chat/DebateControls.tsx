/**
 * DebateControls — The input bar to start/stop debates.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDebateStore } from '../../stores/debateStore';
import { useDebateWebSocket } from '../../hooks/useDebateWebSocket';
import { api } from '../../api/client';

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

    // Advanced config state
    const [configs, setConfigs] = useState<Record<string, { model: string, api_key: string, api_base_url: string }>>({
        proposer: { model: '', api_key: '', api_base_url: '' },
        opposer: { model: '', api_key: '', api_base_url: '' },
        judge: { model: '', api_key: '', api_base_url: '' },
        fact_checker: { model: '', api_key: '', api_base_url: '' },
    });

    const handleConfigChange = (agent: string, field: 'model' | 'api_key' | 'api_base_url', value: string) => {
        setConfigs(prev => ({
            ...prev,
            [agent]: { ...prev[agent], [field]: value }
        }));
    };

    const handleStart = async () => {
        if (!topic.trim()) return;

        try {
            setIsCreating(true);
            // 1. Process agent configurations
            const agentConfigs: Record<string, any> = {};
            for (const [key, val] of Object.entries(configs)) {
                const clean: any = {};
                if (val.model.trim()) clean.model = val.model.trim();
                if (val.api_key.trim()) clean.api_key = val.api_key.trim();
                if (val.api_base_url.trim()) clean.api_base_url = val.api_base_url.trim();
                if (Object.keys(clean).length > 0) agentConfigs[key] = clean;
            }

            // 2. Create session via REST map
            const session = await api.sessions.create({
                topic: topic.trim(),
                max_turns: 3, // Default for now
                agent_configs: Object.keys(agentConfigs).length > 0 ? agentConfigs : undefined,
            });
            // 2. Set current session in store
            setCurrentSession(session);
            setCurrentSessionId(session.id);
            // 3. Start debate over WS logic belongs to a useEffect listening to sessionId
            // Wait a tick for WS to connect, or we trigger it via a "Begin" button once joined.
            // For smoother UX, we'll let ChatPanel handle starting via the hook once connected.
        } catch (err) {
            console.error('Failed to create session:', err);
        } finally {
            setIsCreating(false);
            setTopic('');
        }
    };

    if (currentSessionId) {
        return (
            <div className="glass" style={{
                padding: '16px 24px',
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
                            background: 'linear-gradient(135deg, var(--accent-indigo), #818cf8)',
                            color: '#fff',
                            fontWeight: 600,
                            cursor: isConnected ? 'pointer' : 'not-allowed',
                            opacity: isConnected ? 1 : 0.5,
                        }}
                    >
                        执行辩论
                    </motion.button>
                )}
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
                        <h4 style={{ margin: '0 0 16px', fontSize: '15px' }}>✨ 进阶模型配置 (LiteLLM 规范)</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                            {['proposer', 'opposer', 'judge', 'fact_checker'].map(agent => (
                                <div key={agent} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
                                        {agent === 'proposer' ? '🔵 正方 (Proposer)' : agent === 'opposer' ? '🔴 反方 (Opposer)' : agent === 'judge' ? '⚖️ 裁判 (Judge)' : '🔍 事实核查员 (Fact Checker)'}
                                    </div>
                                    <input
                                        type="text" placeholder="Model (e.g. openai/gpt-4o)"
                                        value={configs[agent].model} onChange={e => handleConfigChange(agent, 'model', e.target.value)}
                                        style={{ padding: '8px', borderRadius: '4px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', color: '#fff', fontSize: '13px' }}
                                    />
                                    <input
                                        type="password" placeholder="API Key (Optional)"
                                        value={configs[agent].api_key} onChange={e => handleConfigChange(agent, 'api_key', e.target.value)}
                                        style={{ padding: '8px', borderRadius: '4px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', color: '#fff', fontSize: '13px' }}
                                    />
                                    <input
                                        type="text" placeholder="Base URL (Optional)"
                                        value={configs[agent].api_base_url} onChange={e => handleConfigChange(agent, 'api_base_url', e.target.value)}
                                        style={{ padding: '8px', borderRadius: '4px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', color: '#fff', fontSize: '13px' }}
                                    />
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

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
                    ✨
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
                        background: 'linear-gradient(135deg, var(--accent-indigo), #818cf8)',
                        color: '#fff',
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
