/**
 * DebateControls — Compact input bar to start/stop debates.
 * Includes turn selector, intervention input, and session creation.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useDebateStore } from '../../stores/debateStore';
import { useDebateWebSocket } from '../../hooks/useDebateWebSocket';
import { api } from '../../api/client';
import AgentConfigPanel from '../shared/AgentConfigPanel';
import { useAgentConfigs } from '../../hooks/useAgentConfigs';

const DEFAULT_MAX_TURNS = 5;

function ActiveSessionControls() {
    const { isDebating, isConnected, currentSessionId } = useDebateStore();
    const { startDebate, stopDebate, sendIntervention } = useDebateWebSocket(currentSessionId);
    const [interventionText, setInterventionText] = useState('');
    const [maxTurnsInput, setMaxTurnsInput] = useState('');

    const maxTurns = maxTurnsInput.trim() ? parseInt(maxTurnsInput, 10) || DEFAULT_MAX_TURNS : DEFAULT_MAX_TURNS;

    const handleSendIntervention = () => {
        if (!interventionText.trim() || !isConnected) return;
        sendIntervention(interventionText.trim());
        setInterventionText('');
    };

    const canIntervene = isConnected;

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            flexShrink: 0,
        }}>
            <motion.div style={{
                padding: '10px 14px',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-xs)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '4px 10px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-full)',
                }}>
                    <motion.div
                        animate={isConnected ? {
                            scale: [1, 1.15, 1],
                            opacity: [1, 0.7, 1]
                        } : {}}
                        transition={{ repeat: Infinity, duration: 2 }}
                        style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: isConnected ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                        }}
                    />
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                        {isConnected ? '已连接' : '断开'}
                    </span>
                </div>

                {!isDebating && (
                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '4px',
                        background: 'var(--bg-tertiary)',
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-sm)',
                    }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>轮数</span>
                        <input
                            type="number"
                            value={maxTurnsInput}
                            onChange={(e) => setMaxTurnsInput(e.target.value)}
                            placeholder="5"
                            min={1}
                            max={100}
                            style={{
                                width: '28px',
                                background: 'transparent',
                                border: 'none',
                                outline: 'none',
                                color: 'var(--text-primary)',
                                fontSize: '12px',
                                fontWeight: 500,
                                textAlign: 'center',
                                MozAppearance: 'textfield' as const,
                                WebkitAppearance: 'none' as const,
                            }}
                        />
                    </div>
                )}

                {isDebating ? (
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={stopDebate}
                        style={{
                            padding: '7px 16px',
                            borderRadius: 'var(--radius-md)',
                            border: 'none',
                            background: 'var(--color-opposer)',
                            color: '#fff',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: '12px',
                        }}
                    >
                        终止
                    </motion.button>
                ) : (
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => startDebate(useDebateStore.getState().currentSession?.topic || '新辩论', ['proposer', 'opposer'], maxTurns)}
                        disabled={!isConnected}
                        style={{
                            padding: '7px 18px',
                            borderRadius: 'var(--radius-md)',
                            border: 'none',
                            background: 'var(--text-primary)',
                            color: 'var(--bg-primary)',
                            fontWeight: 600,
                            cursor: isConnected ? 'pointer' : 'not-allowed',
                            opacity: isConnected ? 1 : 0.5,
                            fontSize: '12px',
                        }}
                    >
                        开始辩论
                    </motion.button>
                )}
            </motion.div>

            <motion.div style={{
                padding: '10px 12px',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-xs)',
                display: 'flex',
                gap: '8px',
                alignItems: 'center',
            }}>
                <input
                    type="text"
                    value={interventionText}
                    onChange={(e) => setInterventionText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendIntervention()}
                    placeholder={canIntervene ? "随时发言参与辩论..." : "连接中断..."}
                    disabled={!canIntervene}
                    style={{
                        flex: 1,
                        padding: '9px 12px',
                        borderRadius: 'var(--radius-md)',
                        border: 'none',
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-primary)',
                        outline: 'none',
                        cursor: canIntervene ? 'text' : 'not-allowed',
                        opacity: canIntervene ? 1 : 0.5,
                        fontSize: '13px',
                    }}
                />
                <motion.button
                    whileHover={canIntervene && interventionText.trim() ? { scale: 1.02 } : {}}
                    whileTap={canIntervene && interventionText.trim() ? { scale: 0.98 } : {}}
                    onClick={handleSendIntervention}
                    disabled={!canIntervene || !interventionText.trim()}
                    style={{
                        padding: '9px 16px',
                        borderRadius: 'var(--radius-md)',
                        border: 'none',
                        background: canIntervene && interventionText.trim() ? 'var(--text-primary)' : 'var(--bg-tertiary)',
                        color: canIntervene && interventionText.trim() ? 'var(--bg-primary)' : 'var(--text-muted)',
                        fontWeight: 600,
                        cursor: canIntervene && interventionText.trim() ? 'pointer' : 'not-allowed',
                        opacity: canIntervene && interventionText.trim() ? 1 : 0.5,
                        fontSize: '12px',
                    }}
                >
                    发送
                </motion.button>
            </motion.div>
        </div>
    );
}

function SessionCreator() {
    const [topic, setTopic] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [maxTurnsInput, setMaxTurnsInput] = useState('');
    const { setCurrentSessionId, setCurrentSession } = useDebateStore();

    const {
        showAdvanced, setShowAdvanced,
        buildAgentConfigs,
    } = useAgentConfigs();

    const maxTurns = maxTurnsInput.trim() ? parseInt(maxTurnsInput, 10) || DEFAULT_MAX_TURNS : DEFAULT_MAX_TURNS;

    const handleStart = async () => {
        if (!topic.trim()) return;
        try {
            setIsCreating(true);
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
        } finally {
            setIsCreating(false);
            setTopic('');
        }
    };

    return (
        <div style={{ position: 'relative', flexShrink: 0 }}>
            <AgentConfigPanel show={showAdvanced} onToggle={() => setShowAdvanced(!showAdvanced)} />

            <motion.div style={{
                padding: '12px 14px',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-xs)',
                display: 'flex',
                gap: '8px',
                alignItems: 'center',
            }}>
                <motion.button
                    whileHover={{ scale: 1.03, background: 'var(--bg-hover)' }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    style={{
                        padding: '9px',
                        borderRadius: 'var(--radius-md)',
                        background: showAdvanced ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                        border: 'none',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                    }}
                    title="模型配置"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16v0Z"></path>
                        <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4v0Z"></path>
                        <path d="M12 2v2"></path><path d="M12 22v-2"></path>
                        <path d="m17 20.66-1-1.73"></path><path d="M11 10.27 7 3.34"></path>
                        <path d="m20.66 17-1.73-1"></path><path d="m3.34 7 1.73 1"></path>
                        <path d="M14 12h8"></path><path d="M2 12h2"></path>
                        <path d="m20.66 7-1.73 1"></path><path d="m3.34 17 1.73-1"></path>
                        <path d="m17 3.34-1 1.73"></path><path d="m11 13.73-4 6.93"></path>
                    </svg>
                </motion.button>

                <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleStart()}
                    placeholder="输入辩题..."
                    disabled={isCreating}
                    style={{
                        flex: 1,
                        padding: '9px 12px',
                        borderRadius: 'var(--radius-md)',
                        border: 'none',
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-primary)',
                        outline: 'none',
                        fontSize: '13px',
                    }}
                />

                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '4px', 
                    flexShrink: 0,
                    background: 'var(--bg-tertiary)',
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-sm)',
                }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>轮</span>
                    <input
                        type="number"
                        value={maxTurnsInput}
                        onChange={(e) => setMaxTurnsInput(e.target.value)}
                        placeholder="5"
                        min={1}
                        max={100}
                        style={{
                            width: '24px',
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            color: 'var(--text-primary)',
                            fontSize: '12px',
                            fontWeight: 500,
                            textAlign: 'center',
                            MozAppearance: 'textfield' as const,
                            WebkitAppearance: 'none' as const,
                        }}
                    />
                </div>

                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleStart}
                    disabled={isCreating || !topic.trim()}
                    style={{
                        padding: '9px 16px',
                        borderRadius: 'var(--radius-md)',
                        border: 'none',
                        background: topic.trim() && !isCreating ? 'var(--text-primary)' : 'var(--bg-tertiary)',
                        color: topic.trim() && !isCreating ? 'var(--bg-primary)' : 'var(--text-muted)',
                        fontWeight: 600,
                        cursor: (isCreating || !topic.trim()) ? 'not-allowed' : 'pointer',
                        opacity: (isCreating || !topic.trim()) ? 0.5 : 1,
                        fontSize: '12px',
                        flexShrink: 0,
                    }}
                >
                    {isCreating ? '...' : '创建'}
                </motion.button>
            </motion.div>
        </div>
    );
}

export default function DebateControls() {
    const { currentSessionId } = useDebateStore();
    return currentSessionId ? <ActiveSessionControls /> : <SessionCreator />;
}
