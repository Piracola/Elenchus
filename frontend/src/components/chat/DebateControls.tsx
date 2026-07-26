/**
 * DebateControls - compact input bar to create, start, and stop debates.
 */

import { useCallback, useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { toast } from '../../utils/chat/toast';
import { useAgentConfigs } from '../../hooks/useAgentConfigs';
import { isRunStatusInProgress, useConnectionViewState, useSessionViewState } from '../../hooks/useDebateViewState';
import { useDebateWebSocket } from '../../hooks/useDebateWebSocket';
import { useSessionCreate } from '../../hooks/useSessionCreate';
import { useRecentDebateConfig } from '../../hooks/useRecentDebateConfig';
import { api } from '../../api/client';
import {
    DEFAULT_MAX_TURNS,
    DEFAULT_GROUP_DISCUSSION_ROUNDS,
    DEFAULT_SPEECH_MAX_CHARS,
    parseGroupDiscussionRoundsInput,
    parseMaxTurnsInput,
    parseSpeechMaxCharsInput,
} from '../../utils/agent/debateSession';
import AgentConfigPanel from '../shared/AgentConfigPanel';
import type { PendingRunCommand, RecentDebateConfig } from '../../types';

function ActiveSessionControls() {
    const { isConnected, currentSession, activeRun, activeRunId } = useConnectionViewState();
    const { startRun, resumeRun, stopRun, sendIntervention } = useDebateWebSocket(activeRunId);
    const [interventionText, setInterventionText] = useState('');
    const [maxTurnsInput, setMaxTurnsInput] = useState(
        currentSession?.max_turns != null ? String(currentSession.max_turns) : '',
    );

    // Sync with session changes (e.g., after creating a new session)
    useEffect(() => {
        if (currentSession?.max_turns != null) {
            setMaxTurnsInput(String(currentSession.max_turns));
        }
    }, [currentSession?.max_turns, currentSession?.id]);

    const maxTurns = parseMaxTurnsInput(maxTurnsInput);
    const runStatus = activeRun?.status ?? null;
    const canStopRun = Boolean(activeRunId && runStatus && isRunStatusInProgress(runStatus));
    const runIsLive = canStopRun;
    const canResumeRun = !runIsLive && Boolean(activeRunId && runStatus && runStatus === 'stalled');
    const canSendIntervention = Boolean(activeRunId && isConnected);
    const [pendingCommands, setPendingCommands] = useState<PendingRunCommand[]>([]);
    const [isSending, setIsSending] = useState(false);

    const refreshPendingCommands = useCallback(async () => {
        if (!activeRunId) {
            setPendingCommands([]);
            return;
        }
        try {
            const response = await api.runs.pendingCommands(activeRunId);
            setPendingCommands(response.commands ?? []);
        } catch {
            // A transient failure just leaves the previous list on screen.
        }
    }, [activeRunId]);

    useEffect(() => {
        void refreshPendingCommands();
        if (!activeRunId || !runIsLive) return;
        // Directives are consumed by the backend at node boundaries, so poll
        // slowly to retire chips that already took effect.
        const timer = setInterval(() => void refreshPendingCommands(), 8000);
        return () => clearInterval(timer);
    }, [activeRunId, runIsLive, refreshPendingCommands]);

    const submitDirective = async (interrupt: boolean) => {
        const content = interventionText.trim();
        if (!content || !canSendIntervention || isSending) return;
        setIsSending(true);
        try {
            const ack = await sendIntervention(content, { interrupt });
            setInterventionText('');
            if (ack?.message) {
                toast(ack.message);
            }
            await refreshPendingCommands();
        } catch (err) {
            toast(err instanceof Error ? err.message : '主持人指令发送失败');
        } finally {
            setIsSending(false);
        }
    };

    const canSubmitDirective = canSendIntervention && Boolean(interventionText.trim()) && !isSending;

    const handleRevokeCommand = async (commandId: string) => {
        if (!activeRunId) return;
        try {
            await api.runs.revokeCommand(activeRunId, commandId);
            toast('指令已撤回');
        } catch {
            toast('该指令已生效，无法撤回');
        }
        await refreshPendingCommands();
    };

    return (
        <motion.div
            style={{
                width: 'min(100%, 980px)',
                padding: '10px 14px',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)',
                boxShadow: '0 14px 34px rgba(15, 23, 42, 0.12)',
                backdropFilter: 'blur(14px)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
            }}
        >
            <AnimatePresence initial={false}>
                {pendingCommands.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            gap: '6px',
                            overflow: 'hidden',
                        }}
                    >
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
                            待生效指令
                        </span>
                        {pendingCommands.map((command) => (
                            <span
                                key={command.id}
                                title={command.content}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    maxWidth: '260px',
                                    padding: '3px 6px 3px 10px',
                                    borderRadius: 'var(--radius-full)',
                                    background: 'var(--bg-tertiary)',
                                    border: '1px solid var(--border-subtle)',
                                    color: 'var(--text-secondary)',
                                    fontSize: '11px',
                                }}
                            >
                                <span
                                    style={{
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {command.content}
                                </span>
                                <motion.button
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => void handleRevokeCommand(command.id)}
                                    aria-label="撤回该指令"
                                    title="撤回该指令"
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        border: 'none',
                                        background: 'transparent',
                                        color: 'var(--text-muted)',
                                        cursor: 'pointer',
                                        padding: '2px',
                                    }}
                                >
                                    <X size={11} />
                                </motion.button>
                            </span>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-full)',
                    flexShrink: 0,
                }}
            >
                <motion.div
                    animate={isConnected ? { scale: [1, 1.15, 1], opacity: [1, 0.7, 1] } : {}}
                    transition={{ repeat: Infinity, duration: 2 }}
                    style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: isConnected ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                    }}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    {isConnected ? '已连接' : '断开'}
                </span>
            </div>

            {!runIsLive && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: 'var(--bg-tertiary)',
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-sm)',
                        flexShrink: 0,
                    }}
                >
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>轮</span>
                    <input
                        type="number"
                        value={maxTurnsInput}
                        onChange={(event) => setMaxTurnsInput(event.target.value)}
                        placeholder={String(DEFAULT_MAX_TURNS)}
                        min={1}
                        max={100}
                        style={{
                            width: '24px',
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-primary)',
                            fontSize: '11px',
                            fontWeight: 500,
                            textAlign: 'center',
                            MozAppearance: 'textfield',
                            WebkitAppearance: 'none',
                        }}
                    />
                </div>
            )}

            <input
                type="text"
                value={interventionText}
                onChange={(event) => setInterventionText(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    // Shift+Enter escalates to an interrupt of the live speech.
                    void submitDirective(event.shiftKey && runIsLive);
                }}
                placeholder={isConnected ? '输入主持人指令，下一位辩手必须正面回应...' : '连接已断开...'}
                disabled={!canSendIntervention}
                style={{
                    flex: 1,
                    padding: '9px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: 'none',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    cursor: canSendIntervention ? 'text' : 'not-allowed',
                    opacity: canSendIntervention ? 1 : 0.5,
                    fontSize: '13px',
                    minWidth: 0,
                }}
            />

            {canStopRun ? (
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={stopRun}
                    style={{
                        padding: '8px 14px',
                        borderRadius: 'var(--radius-md)',
                        border: 'none',
                        background: 'var(--color-opposer)',
                        color: '#fff',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontSize: '12px',
                        flexShrink: 0,
                    }}
                >
                    终止
                </motion.button>
            ) : (
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                        if (canResumeRun) {
                            void resumeRun();
                            return;
                        }
                        void startRun(
                            currentSession?.topic || '新辩题',
                            ['proposer', 'opposer'],
                            maxTurns,
                        );
                    }}
                    disabled={false}
                    style={{
                        padding: '8px 14px',
                        borderRadius: 'var(--radius-md)',
                        border: 'none',
                        background: 'var(--text-primary)',
                        color: 'var(--bg-primary)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        opacity: 1,
                        fontSize: '12px',
                        flexShrink: 0,
                    }}
                >
                    {canResumeRun ? '继续辩论' : '开始辩论'}
                </motion.button>
            )}

            {/* Directive controls stay available while the run is live —
                previously the send button vanished behind the stop button. */}
            <motion.button
                whileHover={canSubmitDirective ? { scale: 1.02 } : {}}
                whileTap={canSubmitDirective ? { scale: 0.98 } : {}}
                onClick={() => void submitDirective(false)}
                disabled={!canSubmitDirective}
                title="排队一条主持人指令，下一位辩手必须正面回应"
                style={{
                    padding: '8px 14px',
                    borderRadius: 'var(--radius-md)',
                    border: 'none',
                    background: canSubmitDirective ? 'var(--accent-indigo)' : 'var(--bg-tertiary)',
                    color: canSubmitDirective ? '#fff' : 'var(--text-muted)',
                    fontWeight: 600,
                    cursor: canSubmitDirective ? 'pointer' : 'not-allowed',
                    opacity: canSubmitDirective ? 1 : 0.5,
                    fontSize: '12px',
                    flexShrink: 0,
                }}
            >
                发送指令
            </motion.button>

            {runIsLive && (
                <motion.button
                    whileHover={canSubmitDirective ? { scale: 1.02 } : {}}
                    whileTap={canSubmitDirective ? { scale: 0.98 } : {}}
                    onClick={() => void submitDirective(true)}
                    disabled={!canSubmitDirective}
                    title="立即中止当前发言，辩手结合指令重新发言"
                    style={{
                        padding: '8px 14px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-opposer)',
                        background: 'transparent',
                        color: 'var(--color-opposer)',
                        fontWeight: 600,
                        cursor: canSubmitDirective ? 'pointer' : 'not-allowed',
                        opacity: canSubmitDirective ? 1 : 0.5,
                        fontSize: '12px',
                        flexShrink: 0,
                    }}
                >
                    打断
                </motion.button>
            )}
            </div>
        </motion.div>
    );
}

function SessionCreator() {
    const [topic, setTopic] = useState('');
    const [maxTurnsInput, setMaxTurnsInput] = useState('');
    const [groupDiscussionRoundsInput, setGroupDiscussionRoundsInput] = useState('');
    const [proposerSpeechLimitInput, setProposerSpeechLimitInput] = useState('');
    const [opposerSpeechLimitInput, setOpposerSpeechLimitInput] = useState('');
    const [groupDiscussionSpeechLimitInput, setGroupDiscussionSpeechLimitInput] = useState('');
    const { isCreating, createSession } = useSessionCreate();
    const {
        showAdvanced,
        setShowAdvanced,
        savedConfigs,
        selectedConfigIds,
        temperatureInputs,
        showConfigManager,
        setShowConfigManager,
        handleConfigSelect,
        handleTemperatureChange,
        buildAgentConfigs,
        applyAgentConfigSnapshot,
    } = useAgentConfigs();
    const maxTurns = parseMaxTurnsInput(maxTurnsInput);
    const groupDiscussionRounds = parseGroupDiscussionRoundsInput(groupDiscussionRoundsInput);
    const proposerSpeechLimit = parseSpeechMaxCharsInput(proposerSpeechLimitInput);
    const opposerSpeechLimit = parseSpeechMaxCharsInput(opposerSpeechLimitInput);
    const groupDiscussionSpeechLimit = parseSpeechMaxCharsInput(groupDiscussionSpeechLimitInput);

    const applyRecentConfig = useCallback((config: RecentDebateConfig) => {
        setMaxTurnsInput(String(config.max_turns));
        setGroupDiscussionRoundsInput(String(config.reasoning_config.group_discussion_rounds));
        setProposerSpeechLimitInput(String(config.speech_config.proposer_max_chars));
        setOpposerSpeechLimitInput(String(config.speech_config.opposer_max_chars));
        setGroupDiscussionSpeechLimitInput(String(config.speech_config.group_discussion_max_chars));
        applyAgentConfigSnapshot(config.agent_configs);
    }, [applyAgentConfigSnapshot]);

    useRecentDebateConfig({ savedConfigCount: savedConfigs.length, apply: applyRecentConfig });

    const handleStart = async () => {
        if (!topic.trim()) return;
        await createSession(
            topic,
            maxTurns,
            buildAgentConfigs(),
            {
                consensus_enabled: true,
                group_discussion_rounds: groupDiscussionRounds,
            },
            {
                proposer_max_chars: proposerSpeechLimit,
                opposer_max_chars: opposerSpeechLimit,
                group_discussion_max_chars: groupDiscussionSpeechLimit,
            },
        );
        setTopic('');
    };

    return (
        <div style={{ position: 'relative', flexShrink: 0 }}>
            <AnimatePresence initial={false}>
                {showAdvanced && (
                    <motion.div
                        key="chat-agent-config"
                        initial={{ opacity: 0, height: 0, y: 8 }}
                        animate={{ opacity: 1, height: 'auto', y: 0 }}
                        exit={{ opacity: 0, height: 0, y: 8 }}
                        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                        style={{ marginBottom: '10px', overflow: 'hidden' }}
                    >
                        <AgentConfigPanel
                            savedConfigs={savedConfigs}
                            selectedConfigIds={selectedConfigIds}
                            temperatureInputs={temperatureInputs}
                            showConfigManager={showConfigManager}
                            setShowConfigManager={setShowConfigManager}
                            handleConfigSelect={handleConfigSelect}
                            handleTemperatureChange={handleTemperatureChange}
                        />
                        <div
                            style={{
                                marginTop: '10px',
                                padding: '10px 12px',
                                borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-subtle)',
                                display: 'grid',
                                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                                gap: '10px',
                            }}
                        >
                            <label
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '5px',
                                    color: 'var(--text-secondary)',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                }}
                            >
                                正方字数上限
                                <input
                                    type="number"
                                    value={proposerSpeechLimitInput}
                                    onChange={(event) => setProposerSpeechLimitInput(event.target.value)}
                                    placeholder={String(DEFAULT_SPEECH_MAX_CHARS)}
                                    min={0}
                                    max={20000}
                                    style={{
                                        height: '32px',
                                        padding: '0 10px',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid transparent',
                                        background: 'var(--bg-tertiary)',
                                        color: 'var(--text-primary)',
                                    }}
                                />
                            </label>
                            <label
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '5px',
                                    color: 'var(--text-secondary)',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                }}
                            >
                                反方字数上限
                                <input
                                    type="number"
                                    value={opposerSpeechLimitInput}
                                    onChange={(event) => setOpposerSpeechLimitInput(event.target.value)}
                                    placeholder={String(DEFAULT_SPEECH_MAX_CHARS)}
                                    min={0}
                                    max={20000}
                                    style={{
                                        height: '32px',
                                        padding: '0 10px',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid transparent',
                                        background: 'var(--bg-tertiary)',
                                        color: 'var(--text-primary)',
                                    }}
                                />
                            </label>
                            <label
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '5px',
                                    color: 'var(--text-secondary)',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                }}
                            >
                                二轮起讨论
                                <input
                                    type="number"
                                    value={groupDiscussionRoundsInput}
                                    onChange={(event) => setGroupDiscussionRoundsInput(event.target.value)}
                                    placeholder={String(DEFAULT_GROUP_DISCUSSION_ROUNDS)}
                                    min={0}
                                    max={5}
                                    style={{
                                        height: '32px',
                                        padding: '0 10px',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid transparent',
                                        background: 'var(--bg-tertiary)',
                                        color: 'var(--text-primary)',
                                    }}
                                />
                            </label>
                            <label
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '5px',
                                    color: 'var(--text-secondary)',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                }}
                            >
                                赛前讨论字数上限
                                <input
                                    type="number"
                                    value={groupDiscussionSpeechLimitInput}
                                    onChange={(event) => setGroupDiscussionSpeechLimitInput(event.target.value)}
                                    placeholder={String(DEFAULT_SPEECH_MAX_CHARS)}
                                    min={0}
                                    max={20000}
                                    style={{
                                        height: '32px',
                                        padding: '0 10px',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid transparent',
                                        background: 'var(--bg-tertiary)',
                                        color: 'var(--text-primary)',
                                    }}
                                />
                            </label>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.div
                style={{
                    width: 'min(100%, 1040px)',
                    padding: '12px 14px',
                    background: 'var(--bg-card)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border-subtle)',
                    boxShadow: '0 14px 34px rgba(15, 23, 42, 0.12)',
                    backdropFilter: 'blur(14px)',
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'center',
                }}
            >
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
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16v0Z" />
                        <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4v0Z" />
                        <path d="M12 2v2" />
                        <path d="M12 22v-2" />
                        <path d="m17 20.66-1-1.73" />
                        <path d="M11 10.27 7 3.34" />
                        <path d="m20.66 17-1.73-1" />
                        <path d="m3.34 7 1.73 1" />
                        <path d="M14 12h8" />
                        <path d="M2 12h2" />
                        <path d="m20.66 7-1.73 1" />
                        <path d="m3.34 17 1.73-1" />
                        <path d="m17 3.34-1 1.73" />
                        <path d="m11 13.73-4 6.93" />
                    </svg>
                </motion.button>

                <input
                    type="text"
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && handleStart()}
                    placeholder="输入辩题..."
                    disabled={isCreating}
                    style={{
                        flex: 1,
                        padding: '9px 12px',
                        borderRadius: 'var(--radius-md)',
                        border: 'none',
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-primary)',
                        fontSize: '13px',
                    }}
                />

                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        flexShrink: 0,
                        background: 'var(--bg-tertiary)',
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-sm)',
                    }}
                >
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>轮</span>
                    <input
                        type="number"
                        value={maxTurnsInput}
                        onChange={(event) => setMaxTurnsInput(event.target.value)}
                        placeholder={String(DEFAULT_MAX_TURNS)}
                        min={1}
                        max={100}
                        style={{
                            width: '24px',
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-primary)',
                            fontSize: '12px',
                            fontWeight: 500,
                            textAlign: 'center',
                            MozAppearance: 'textfield',
                            WebkitAppearance: 'none',
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
                        cursor: isCreating || !topic.trim() ? 'not-allowed' : 'pointer',
                        opacity: isCreating || !topic.trim() ? 0.5 : 1,
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
    const { currentSession } = useSessionViewState();
    return currentSession ? <ActiveSessionControls /> : <SessionCreator />;
}
