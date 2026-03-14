import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ChevronDown, Sparkles, Settings2 } from 'lucide-react';
import { useDebateStore } from '../stores/debateStore';
import { api } from '../api/client';
import AgentConfigPanel from './shared/AgentConfigPanel';
import { useAgentConfigs } from '../hooks/useAgentConfigs';

const DEFAULT_MAX_TURNS = 5;

export default function HomeView() {
    const [topic, setTopic] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState('');
    const [maxTurnsInput, setMaxTurnsInput] = useState('');
    const { setCurrentSessionId, setCurrentSession } = useDebateStore();

    const {
        showAdvanced, setShowAdvanced,
        buildAgentConfigs,
    } = useAgentConfigs();

    const maxTurns = maxTurnsInput.trim() ? parseInt(maxTurnsInput, 10) || DEFAULT_MAX_TURNS : DEFAULT_MAX_TURNS;

    const handleCreateDebate = async () => {
        if (!topic.trim() || isCreating) return;

        try {
            setIsCreating(true);
            setError('');
            const agentConfigs = buildAgentConfigs();
            const session = await api.sessions.create({
                topic: topic.trim(),
                max_turns: maxTurns,
                agent_configs: agentConfigs,
            });
            setCurrentSession(session);
            setCurrentSessionId(session.id);
        } catch (err) {
            console.error('Failed to create session:', err);
            setError(err instanceof Error ? err.message : '创建会话失败，请检查后端服务是否正常运行');
        } finally {
            setIsCreating(false);
        }
    };

    const controlStyle = {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        background: 'var(--bg-tertiary)',
        border: '1px solid var(--border-subtle)',
        color: 'var(--text-secondary)',
        padding: '8px 14px',
        borderRadius: 'var(--radius-md)',
        fontSize: '13px',
        fontWeight: 500,
        boxShadow: 'var(--shadow-xs)',
    };

    return (
        <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            background: 'var(--bg-primary)',
            position: 'relative',
        }}>
            <div style={{
                position: 'absolute',
                top: '5%',
                left: '5%',
                width: '400px',
                height: '400px',
                background: 'radial-gradient(circle, var(--glass-bg) 0%, transparent 70%)',
                borderRadius: '50%',
                pointerEvents: 'none',
                opacity: 0.6,
            }} />
            <div style={{
                position: 'absolute',
                bottom: '10%',
                right: '8%',
                width: '300px',
                height: '300px',
                background: 'radial-gradient(circle, var(--glass-bg) 0%, transparent 70%)',
                borderRadius: '50%',
                pointerEvents: 'none',
                opacity: 0.4,
            }} />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                style={{
                    width: '100%',
                    maxWidth: '640px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    position: 'relative',
                    zIndex: 1,
                }}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1, duration: 0.5 }}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        marginBottom: '32px',
                    }}
                >
                    <div style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: 'var(--radius-lg)',
                        background: 'linear-gradient(135deg, var(--accent-indigo) 0%, var(--accent-cyan) 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 20px rgba(99, 102, 241, 0.3)',
                    }}>
                        <Sparkles size={22} color="white" />
                    </div>
                    <h1 style={{
                        fontSize: '36px',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        letterSpacing: '-0.02em',
                    }}>
                        Elenchus
                    </h1>
                </motion.div>

                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    style={{
                        fontSize: '15px',
                        color: 'var(--text-secondary)',
                        marginBottom: '28px',
                        textAlign: 'center',
                        fontWeight: 400,
                    }}
                >
                    AI 多智能体辩论平台 — 让观点碰撞产生智慧火花
                </motion.p>

                <AnimatePresence>
                    {showAdvanced && (
                        <motion.div
                            initial={{ opacity: 0, marginBottom: 0 }}
                            animate={{ opacity: 1, marginBottom: 12 }}
                            exit={{ opacity: 0, marginBottom: 0 }}
                            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                            style={{ width: '100%' }}
                        >
                            <AgentConfigPanel show={showAdvanced} onToggle={() => setShowAdvanced(!showAdvanced)} />
                        </motion.div>
                    )}
                </AnimatePresence>

                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                    style={{
                        width: '100%',
                        background: 'var(--bg-card)',
                        borderRadius: 'var(--radius-xl)',
                        boxShadow: 'var(--shadow-md)',
                        border: '1px solid var(--border-subtle)',
                    }}
                >
                    <div style={{ padding: '20px 24px 16px' }}>
                        <textarea
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                            placeholder="输入辩题，开启一场深度辩论..."
                            rows={3}
                            style={{
                                width: '100%',
                                background: 'transparent',
                                border: 'none',
                                outline: 'none',
                                color: 'var(--text-primary)',
                                fontSize: '16px',
                                resize: 'none',
                                lineHeight: 1.6,
                                fontWeight: 500,
                            }}
                        />
                    </div>

                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px 16px 16px',
                        borderTop: '1px solid var(--border-subtle)',
                    }}>
                        <div style={{ 
                            display: 'flex', 
                            justifyContent: 'flex-start', 
                            flex: 1, 
                            alignItems: 'center', 
                            gap: '10px' 
                        }}>
                            <motion.button
                                whileHover={{ scale: 1.02, background: 'var(--bg-hover)' }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                style={{
                                    ...controlStyle,
                                    cursor: 'pointer',
                                    borderColor: showAdvanced ? 'var(--accent-indigo)' : 'var(--border-subtle)',
                                    color: showAdvanced ? 'var(--accent-indigo)' : 'var(--text-secondary)',
                                }}
                            >
                                <Settings2 size={14} />
                                Agent
                                <motion.div
                                    animate={{ rotate: showAdvanced ? 180 : 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <ChevronDown size={14} />
                                </motion.div>
                            </motion.button>

                            <div style={controlStyle}>
                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>轮数</span>
                                <input
                                    type="number"
                                    value={maxTurnsInput}
                                    onChange={(e) => setMaxTurnsInput(e.target.value)}
                                    placeholder="5"
                                    min={1}
                                    max={100}
                                    style={{
                                        width: '36px',
                                        background: 'transparent',
                                        border: 'none',
                                        outline: 'none',
                                        color: 'var(--text-primary)',
                                        fontSize: '13px',
                                        fontWeight: 500,
                                        textAlign: 'center',
                                        MozAppearance: 'textfield' as const,
                                        WebkitAppearance: 'none' as const,
                                    }}
                                />
                            </div>
                        </div>

                        <motion.button
                            whileHover={{ scale: 1.05, boxShadow: 'var(--shadow-md)' }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleCreateDebate}
                            disabled={!topic.trim() || isCreating}
                            style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                background: topic.trim() && !isCreating
                                    ? 'linear-gradient(135deg, var(--accent-indigo) 0%, var(--accent-cyan) 100%)'
                                    : 'var(--bg-tertiary)',
                                color: topic.trim() && !isCreating ? 'white' : 'var(--text-muted)',
                                border: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: topic.trim() && !isCreating ? 'pointer' : 'not-allowed',
                                transition: 'all var(--transition-fast)',
                                boxShadow: topic.trim() && !isCreating
                                    ? '0 4px 16px rgba(99, 102, 241, 0.35)'
                                    : 'var(--shadow-inner)',
                                flexShrink: 0,
                            }}
                        >
                            <ArrowRight size={20} />
                        </motion.button>
                    </div>
                </motion.div>

                <AnimatePresence>
                    {error && (
                        <motion.p
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            style={{
                                color: 'var(--accent-rose)',
                                fontSize: '13px',
                                marginTop: '12px',
                                textAlign: 'center',
                                padding: '10px 16px',
                                background: 'rgba(239, 68, 68, 0.08)',
                                borderRadius: 'var(--radius-lg)',
                                fontWeight: 500,
                            }}
                        >
                            {error}
                        </motion.p>
                    )}
                </AnimatePresence>

                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    style={{
                        display: 'flex',
                        gap: '24px',
                        marginTop: '36px',
                        color: 'var(--text-muted)',
                        fontSize: '12px',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: 'var(--color-proposer)',
                        }} />
                        <span>正方观点</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: 'var(--color-opposer)',
                        }} />
                        <span>反方观点</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: 'var(--color-judge)',
                        }} />
                        <span>裁判评分</span>
                    </div>
                </motion.div>
            </motion.div>
        </div>
    );
}
