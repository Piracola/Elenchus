import { ArrowRight, ChevronDown, Settings2 } from 'lucide-react';
import { motion } from 'framer-motion';
import {
    DEFAULT_MAX_TURNS,
    DEFAULT_JURY_AGENTS_PER_JURY,
    DEFAULT_JURY_DISCUSSION_ROUNDS,
    DEFAULT_TEAM_AGENTS_PER_TEAM,
    DEFAULT_TEAM_DISCUSSION_ROUNDS,
} from '../../utils/debateSession';
import type { HomeFontSizes } from './shared';

type HomeComposerCardProps = {
    topic: string;
    isCreating: boolean;
    isSophistryMode: boolean;
    showAdvanced: boolean;
    maxTurnsInput: string;
    teamAgentsInput: string;
    teamRoundsInput: string;
    juryAgentsInput: string;
    juryRoundsInput: string;
    steelmanEnabled: boolean;
    homeFontSizes: HomeFontSizes;
    onTopicChange: (value: string) => void;
    onShowAdvancedChange: (show: boolean) => void;
    onMaxTurnsChange: (value: string) => void;
    onTeamAgentsChange: (value: string) => void;
    onTeamRoundsChange: (value: string) => void;
    onJuryAgentsChange: (value: string) => void;
    onJuryRoundsChange: (value: string) => void;
    onSteelmanToggle: () => void;
    onCreateDebate: () => void;
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

export function HomeComposerCard({
    topic,
    isCreating,
    isSophistryMode,
    showAdvanced,
    maxTurnsInput,
    teamAgentsInput,
    teamRoundsInput,
    juryAgentsInput,
    juryRoundsInput,
    steelmanEnabled,
    homeFontSizes,
    onTopicChange,
    onShowAdvancedChange,
    onMaxTurnsChange,
    onTeamAgentsChange,
    onTeamRoundsChange,
    onJuryAgentsChange,
    onJuryRoundsChange,
    onSteelmanToggle,
    onCreateDebate,
}: HomeComposerCardProps) {
    return (
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
                    onChange={(event) => onTopicChange(event.target.value)}
                    placeholder={isSophistryMode ? '输入辩题，启动一场诡辩实验...' : '输入辩题，开始一场深入辩论...'}
                    rows={3}
                    style={{
                        width: '100%',
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        color: 'var(--text-primary)',
                        fontSize: homeFontSizes.topicInput,
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
                        onClick={() => onShowAdvancedChange(!showAdvanced)}
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
                            onChange={(event) => onMaxTurnsChange(event.target.value)}
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
                                    onChange={(event) => onTeamAgentsChange(event.target.value)}
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
                                    onChange={(event) => onTeamRoundsChange(event.target.value)}
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
                                    onChange={(event) => onJuryAgentsChange(event.target.value)}
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
                                    onChange={(event) => onJuryRoundsChange(event.target.value)}
                                    placeholder={String(DEFAULT_JURY_DISCUSSION_ROUNDS)}
                                    min={0}
                                    max={10}
                                    style={numberInputStyle}
                                />
                            </div>

                            <motion.button
                                whileHover={{ scale: 1.02, background: 'var(--bg-hover)' }}
                                whileTap={{ scale: 0.98 }}
                                onClick={onSteelmanToggle}
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
                    onClick={onCreateDebate}
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
    );
}
