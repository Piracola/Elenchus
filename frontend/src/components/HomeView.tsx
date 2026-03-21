import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ArrowRight, ChevronDown, Settings2, Sparkles } from 'lucide-react';

import { useAgentConfigs } from '../hooks/useAgentConfigs';
import { useSessionCreate } from '../hooks/useSessionCreate';
import type { DebateMode } from '../types';
import {
    DEFAULT_MAX_TURNS,
    DEFAULT_JURY_AGENTS_PER_JURY,
    DEFAULT_JURY_DISCUSSION_ROUNDS,
    DEFAULT_TEAM_AGENTS_PER_TEAM,
    DEFAULT_TEAM_DISCUSSION_ROUNDS,
    parseJuryAgentsInput,
    parseJuryDiscussionRoundsInput,
    parseMaxTurnsInput,
    parseTeamAgentsInput,
    parseTeamDiscussionRoundsInput,
} from '../utils/debateSession';
import AgentConfigPanel from './shared/AgentConfigPanel';

const SOPHISTRY_MODE_WARNING = '诡辩实验模式会鼓励模型主动使用误导性修辞、标签施压、定义操控与叙事转移。它不代表事实结论，也不会提供裁判评分或搜索核验，请将其视为修辞对抗实验。';

export default function HomeView() {
    const [topic, setTopic] = useState('');
    const [debateMode, setDebateMode] = useState<DebateMode>('standard');
    const [maxTurnsInput, setMaxTurnsInput] = useState('');
    const [teamAgentsInput, setTeamAgentsInput] = useState('');
    const [teamRoundsInput, setTeamRoundsInput] = useState('');
    const [juryAgentsInput, setJuryAgentsInput] = useState('');
    const [juryRoundsInput, setJuryRoundsInput] = useState('');
    const [steelmanEnabled, setSteelmanEnabled] = useState(true);
    const { isCreating, error, createSession, clearError } = useSessionCreate();
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
    } = useAgentConfigs();

    const isSophistryMode = debateMode === 'sophistry_experiment';
    const maxTurns = parseMaxTurnsInput(maxTurnsInput);
    const teamAgents = parseTeamAgentsInput(teamAgentsInput);
    const teamDiscussionRounds = parseTeamDiscussionRoundsInput(teamRoundsInput);
    const juryAgents = parseJuryAgentsInput(juryAgentsInput);
    const juryDiscussionRounds = parseJuryDiscussionRoundsInput(juryRoundsInput);

    const handleCreateDebate = async () => {
        if (!topic.trim() || isCreating) {
            return;
        }

        await createSession(
            topic,
            maxTurns,
            buildAgentConfigs(),
            isSophistryMode
                ? { agents_per_team: 0, discussion_rounds: 0 }
                : { agents_per_team: teamAgents, discussion_rounds: teamDiscussionRounds },
            isSophistryMode
                ? { agents_per_jury: 0, discussion_rounds: 0 }
                : { agents_per_jury: juryAgents, discussion_rounds: juryDiscussionRounds },
            isSophistryMode
                ? {
                    steelman_enabled: false,
                    counterfactual_enabled: false,
                    consensus_enabled: false,
                }
                : {
                    steelman_enabled: steelmanEnabled,
                    counterfactual_enabled: true,
                    consensus_enabled: true,
                },
            debateMode,
            isSophistryMode
                ? {
                    seed_reference_enabled: true,
                    observer_enabled: true,
                    artifact_detail_level: 'full',
                }
                : undefined,
        );
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
    } as const;

    const numberInputStyle = {
        width: '36px',
        background: 'transparent',
        border: 'none',
        outline: 'none',
        color: 'var(--text-primary)',
        fontSize: '13px',
        fontWeight: 500,
        textAlign: 'center',
        MozAppearance: 'textfield',
        WebkitAppearance: 'none',
    } as const;

    return (
        <div
            style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
                background: 'var(--bg-primary)',
                position: 'relative',
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    top: '5%',
                    left: '5%',
                    width: '400px',
                    height: '400px',
                    background: 'radial-gradient(circle, var(--glass-bg) 0%, transparent 70%)',
                    borderRadius: '50%',
                    pointerEvents: 'none',
                    opacity: 0.6,
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    bottom: '10%',
                    right: '8%',
                    width: '300px',
                    height: '300px',
                    background: 'radial-gradient(circle, var(--glass-bg) 0%, transparent 70%)',
                    borderRadius: '50%',
                    pointerEvents: 'none',
                    opacity: 0.4,
                }}
            />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                style={{
                    width: '100%',
                    maxWidth: '760px',
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
                        marginBottom: '28px',
                    }}
                >
                    <div
                        style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: 'var(--radius-lg)',
                            background: 'linear-gradient(135deg, var(--accent-indigo) 0%, var(--accent-cyan) 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 20px rgba(99, 102, 241, 0.3)',
                        }}
                    >
                        <Sparkles size={22} color="white" />
                    </div>
                    <h1
                        style={{
                            fontSize: '36px',
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                            letterSpacing: '-0.02em',
                        }}
                    >
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
                        marginBottom: '24px',
                        textAlign: 'center',
                        fontWeight: 400,
                    }}
                >
                    AI 多智能体辩论平台，让观点碰撞产出更清晰的过程与结果。
                </motion.p>

                <div
                    style={{
                        width: '100%',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                        gap: '12px',
                        marginBottom: '16px',
                    }}
                >
                    {([
                        {
                            mode: 'standard' as const,
                            title: '标准辩论',
                            description: '保留裁判、陪审团与常规推理增强，用于更传统的攻防与评分。',
                        },
                        {
                            mode: 'sophistry_experiment' as const,
                            title: '诡辩实验模式',
                            description: '单独流程，强调诡辩技巧、谬误识别和观察报告，不做评分。',
                        },
                    ]).map((item) => {
                        const active = debateMode === item.mode;
                        return (
                            <motion.button
                                key={item.mode}
                                whileHover={{ y: -2 }}
                                whileTap={{ scale: 0.99 }}
                                onClick={() => setDebateMode(item.mode)}
                                style={{
                                    textAlign: 'left',
                                    padding: '16px 18px',
                                    borderRadius: 'var(--radius-xl)',
                                    border: active
                                        ? `1px solid ${item.mode === 'sophistry_experiment' ? 'var(--mode-sophistry-accent)' : 'var(--accent-indigo)'}`
                                        : '1px solid var(--border-subtle)',
                                    background: active && item.mode === 'sophistry_experiment'
                                        ? 'var(--mode-sophistry-card)'
                                        : 'var(--bg-card)',
                                    boxShadow: active ? 'var(--shadow-md)' : 'var(--shadow-xs)',
                                    cursor: 'pointer',
                                }}
                            >
                                <div
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        marginBottom: '8px',
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: '14px',
                                            fontWeight: 700,
                                            color: active
                                                ? (item.mode === 'sophistry_experiment'
                                                    ? 'var(--mode-sophistry-accent)'
                                                    : 'var(--accent-indigo)')
                                                : 'var(--text-primary)',
                                        }}
                                    >
                                        {item.title}
                                    </span>
                                    {active && (
                                        <span
                                            style={{
                                                padding: '2px 8px',
                                                borderRadius: 'var(--radius-full)',
                                                background: item.mode === 'sophistry_experiment'
                                                    ? 'rgba(184, 137, 70, 0.12)'
                                                    : 'rgba(99, 102, 241, 0.12)',
                                                color: item.mode === 'sophistry_experiment'
                                                    ? 'var(--mode-sophistry-accent)'
                                                    : 'var(--accent-indigo)',
                                                fontSize: '11px',
                                                fontWeight: 700,
                                            }}
                                        >
                                            当前
                                        </span>
                                    )}
                                </div>
                                <div
                                    style={{
                                        fontSize: '13px',
                                        lineHeight: 1.6,
                                        color: 'var(--text-secondary)',
                                    }}
                                >
                                    {item.description}
                                </div>
                            </motion.button>
                        );
                    })}
                </div>

                <AnimatePresence>
                    {isSophistryMode && (
                        <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            style={{
                                width: '100%',
                                marginBottom: '16px',
                                display: 'flex',
                                gap: '12px',
                                padding: '14px 16px',
                                borderRadius: 'var(--radius-xl)',
                                background: 'var(--mode-sophistry-card)',
                                border: '1px solid var(--mode-sophistry-border)',
                                boxShadow: 'var(--shadow-sm)',
                                color: 'var(--text-secondary)',
                            }}
                        >
                            <AlertTriangle
                                size={18}
                                style={{ color: 'var(--mode-sophistry-accent)', flexShrink: 0, marginTop: '1px' }}
                            />
                            <div style={{ fontSize: '13px', lineHeight: 1.65 }}>
                                {SOPHISTRY_MODE_WARNING}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {showAdvanced && (
                        <motion.div
                            initial={{ opacity: 0, marginBottom: 0 }}
                            animate={{ opacity: 1, marginBottom: 12 }}
                            exit={{ opacity: 0, marginBottom: 0 }}
                            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                            style={{ width: '100%' }}
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
                        </motion.div>
                    )}
                </AnimatePresence>

                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                    style={{
                        width: '100%',
                        background: isSophistryMode ? 'var(--mode-sophistry-card)' : 'var(--bg-card)',
                        borderRadius: 'var(--radius-xl)',
                        boxShadow: 'var(--shadow-md)',
                        border: isSophistryMode
                            ? '1px solid var(--mode-sophistry-border)'
                            : '1px solid var(--border-subtle)',
                    }}
                >
                    <div style={{ padding: '20px 24px 16px' }}>
                        <textarea
                            value={topic}
                            onChange={(event) => {
                                if (error) {
                                    clearError();
                                }
                                setTopic(event.target.value);
                            }}
                            placeholder={isSophistryMode ? '输入辩题，启动一场诡辩实验...' : '输入辩题，开始一场深入辩论...'}
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

                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '12px 16px 16px',
                            borderTop: isSophistryMode
                                ? '1px solid var(--mode-sophistry-border)'
                                : '1px solid var(--border-subtle)',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'flex-start',
                                flex: 1,
                                alignItems: 'center',
                                gap: '10px',
                                flexWrap: 'wrap',
                            }}
                        >
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
                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                    轮数
                                </span>
                                <input
                                    type="number"
                                    value={maxTurnsInput}
                                    onChange={(event) => setMaxTurnsInput(event.target.value)}
                                    placeholder={String(DEFAULT_MAX_TURNS)}
                                    min={1}
                                    max={100}
                                    style={numberInputStyle}
                                />
                            </div>

                            {!isSophistryMode && (
                                <>
                                    <div style={controlStyle}>
                                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                            组内 Agent
                                        </span>
                                        <input
                                            type="number"
                                            value={teamAgentsInput}
                                            onChange={(event) => setTeamAgentsInput(event.target.value)}
                                            placeholder={String(DEFAULT_TEAM_AGENTS_PER_TEAM)}
                                            min={0}
                                            max={10}
                                            style={numberInputStyle}
                                        />
                                    </div>

                                    <div style={controlStyle}>
                                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                            组内轮数
                                        </span>
                                        <input
                                            type="number"
                                            value={teamRoundsInput}
                                            onChange={(event) => setTeamRoundsInput(event.target.value)}
                                            placeholder={String(DEFAULT_TEAM_DISCUSSION_ROUNDS)}
                                            min={0}
                                            max={10}
                                            style={numberInputStyle}
                                        />
                                    </div>

                                    <div style={controlStyle}>
                                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                            陪审 Agent
                                        </span>
                                        <input
                                            type="number"
                                            value={juryAgentsInput}
                                            onChange={(event) => setJuryAgentsInput(event.target.value)}
                                            placeholder={String(DEFAULT_JURY_AGENTS_PER_JURY)}
                                            min={0}
                                            max={10}
                                            style={numberInputStyle}
                                        />
                                    </div>

                                    <div style={controlStyle}>
                                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                            陪审轮数
                                        </span>
                                        <input
                                            type="number"
                                            value={juryRoundsInput}
                                            onChange={(event) => setJuryRoundsInput(event.target.value)}
                                            placeholder={String(DEFAULT_JURY_DISCUSSION_ROUNDS)}
                                            min={0}
                                            max={10}
                                            style={numberInputStyle}
                                        />
                                    </div>

                                    <motion.button
                                        whileHover={{ scale: 1.02, background: 'var(--bg-hover)' }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => setSteelmanEnabled((value) => !value)}
                                        style={{
                                            ...controlStyle,
                                            cursor: 'pointer',
                                            borderColor: steelmanEnabled ? 'var(--accent-indigo)' : 'var(--border-subtle)',
                                            color: steelmanEnabled ? 'var(--accent-indigo)' : 'var(--text-secondary)',
                                        }}
                                    >
                                        Steelman
                                        <span style={{ fontSize: '12px', fontWeight: 700 }}>
                                            {steelmanEnabled ? 'ON' : 'OFF'}
                                        </span>
                                    </motion.button>
                                </>
                            )}

                            {isSophistryMode && (
                                <div
                                    style={{
                                        ...controlStyle,
                                        background: 'rgba(184, 137, 70, 0.08)',
                                        borderColor: 'var(--mode-sophistry-border)',
                                        color: 'var(--mode-sophistry-accent)',
                                    }}
                                >
                                    搜索已禁用
                                </div>
                            )}
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
                                    ? (
                                        isSophistryMode
                                            ? 'linear-gradient(135deg, var(--mode-sophistry-accent) 0%, #d6a363 100%)'
                                            : 'linear-gradient(135deg, var(--accent-indigo) 0%, var(--accent-cyan) 100%)'
                                    )
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
                        <div
                            style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: 'var(--color-proposer)',
                            }}
                        />
                        <span>正方观点</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div
                            style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: 'var(--color-opposer)',
                            }}
                        />
                        <span>反方观点</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div
                            style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: isSophistryMode ? 'var(--mode-sophistry-accent)' : 'var(--color-judge)',
                            }}
                        />
                        <span>{isSophistryMode ? '观察报告' : '裁判评分'}</span>
                    </div>
                </motion.div>
            </motion.div>
        </div>
    );
}
