import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAgentConfigs } from '../hooks/useAgentConfigs';
import { useSessionCreate } from '../hooks/useSessionCreate';
import { useSettingsStore } from '../stores/settingsStore';
import { getMessageFontTokens } from '../config/display';
import type { DebateMode } from '../types';
import {
    parseJuryAgentsInput,
    parseJuryDiscussionRoundsInput,
    parseMaxTurnsInput,
    parseTeamAgentsInput,
    parseTeamDiscussionRoundsInput,
} from '../utils/debateSession';
import { HomeComposerCard } from './home/HomeComposerCard';
import type { PendingReferenceDocument } from './home/HomeComposerCard';
import { HomeModeSelector } from './home/HomeModeSelector';
import { HomeStatusLegend } from './home/HomeStatusLegend';
import AgentConfigPanel from './shared/AgentConfigPanel';
import BrandIcon from './shared/BrandIcon';
import SidebarExpandButton from './shared/SidebarExpandButton';
import SophistryModeNotice from './shared/SophistryModeNotice';
import { api } from '../api/client';
import { toast } from '../utils/toast';

interface HomeViewProps {
    isSidebarCollapsed: boolean;
    onExpandSidebar: () => void;
}

export default function HomeView({ isSidebarCollapsed, onExpandSidebar }: HomeViewProps) {
    const [topic, setTopic] = useState('');
    const [debateMode, setDebateMode] = useState<DebateMode>('standard');
    const [maxTurnsInput, setMaxTurnsInput] = useState('');
    const [teamAgentsInput, setTeamAgentsInput] = useState('');
    const [teamRoundsInput, setTeamRoundsInput] = useState('');
    const [juryAgentsInput, setJuryAgentsInput] = useState('');
    const [juryRoundsInput, setJuryRoundsInput] = useState('');
    const [steelmanEnabled, setSteelmanEnabled] = useState(true);
    const [pendingDocuments, setPendingDocuments] = useState<PendingReferenceDocument[]>([]);
    const { isCreating, error, createSession, clearError } = useSessionCreate();
    const {
        showAdvanced,
        setShowAdvanced,
        savedConfigs,
        selectedConfigIds,
        temperatureInputs,
        enableThinking,
        showConfigManager,
        setShowConfigManager,
        handleConfigSelect,
        handleTemperatureChange,
        handleThinkingToggle,
        buildAgentConfigs,
    } = useAgentConfigs();

    const isSophistryMode = debateMode === 'sophistry_experiment';
    const { displaySettings } = useSettingsStore();
    const messageFontSize = displaySettings.messageFontSize ?? 15;
    const homeFontSizes = useMemo(() => getMessageFontTokens(messageFontSize).home, [messageFontSize]);
    const maxTurns = parseMaxTurnsInput(maxTurnsInput);
    const teamAgents = parseTeamAgentsInput(teamAgentsInput);
    const teamDiscussionRounds = parseTeamDiscussionRoundsInput(teamRoundsInput);
    const juryAgents = parseJuryAgentsInput(juryAgentsInput);
    const juryDiscussionRounds = parseJuryDiscussionRoundsInput(juryRoundsInput);

    const handleCreateDebate = async () => {
        if (!topic.trim() || isCreating) {
            return;
        }

        try {
            const sessionId = await createSession(
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

            // 如果有待上传的参考资料，在创建会话后上传
            if (sessionId && pendingDocuments.length > 0) {
                let successCount = 0;
                let failCount = 0;
                
                for (const doc of pendingDocuments) {
                    try {
                        await api.sessions.uploadDocument(sessionId, doc.file);
                        successCount++;
                    } catch (error) {
                        console.error(`上传参考资料失败: ${doc.name}`, error);
                        failCount++;
                    }
                }
                
                if (successCount > 0) {
                    toast(`成功上传 ${successCount} 个参考资料${failCount > 0 ? `，${failCount} 个失败` : ''}`, 
                        'success');
                } else if (failCount > 0) {
                    toast('参考资料上传失败，但辩论已创建', 'error');
                }
                
                // 清空待上传文档列表
                setPendingDocuments([]);
            }
        } catch (error) {
            console.error('创建辩论失败:', error);
        }
    };

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
            {isSidebarCollapsed && (
                <SidebarExpandButton
                    onClick={onExpandSidebar}
                    style={{
                        position: 'absolute',
                        top: '20px',
                        left: '20px',
                        zIndex: 2,
                        boxShadow: 'var(--shadow-sm)',
                        backdropFilter: undefined,
                    }}
                />
            )}
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
                    <BrandIcon size={44} alt="Elenchus 品牌图标" withBadge={false} />
                    <h1
                        style={{
                            fontSize: homeFontSizes.title,
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
                        fontSize: homeFontSizes.subtitle,
                        color: 'var(--text-secondary)',
                        marginBottom: '24px',
                        textAlign: 'center',
                        fontWeight: 400,
                    }}
                >
                    AI 多智能体辩论平台，让观点碰撞产出更清晰的过程与结果。
                </motion.p>

                <HomeModeSelector
                    debateMode={debateMode}
                    homeFontSizes={homeFontSizes}
                    onModeChange={setDebateMode}
                />

                <HomeComposerCard
                    topic={topic}
                    isCreating={isCreating}
                    isSophistryMode={isSophistryMode}
                    showAdvanced={showAdvanced}
                    maxTurnsInput={maxTurnsInput}
                    teamAgentsInput={teamAgentsInput}
                    teamRoundsInput={teamRoundsInput}
                    juryAgentsInput={juryAgentsInput}
                    juryRoundsInput={juryRoundsInput}
                    steelmanEnabled={steelmanEnabled}
                    homeFontSizes={homeFontSizes}
                    pendingDocuments={pendingDocuments}
                    onDocumentsChange={setPendingDocuments}
                    onTopicChange={(value) => {
                        if (error) {
                            clearError();
                        }
                        setTopic(value);
                    }}
                    onShowAdvancedChange={setShowAdvanced}
                    onMaxTurnsChange={setMaxTurnsInput}
                    onTeamAgentsChange={setTeamAgentsInput}
                    onTeamRoundsChange={setTeamRoundsInput}
                    onJuryAgentsChange={setJuryAgentsInput}
                    onJuryRoundsChange={setJuryRoundsInput}
                    onSteelmanToggle={() => setSteelmanEnabled((value) => !value)}
                    onCreateDebate={() => {
                        void handleCreateDebate();
                    }}
                />

                <div
                    style={{
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        marginTop: '16px',
                    }}
                >
                    <AnimatePresence initial={false}>
                        {isSophistryMode && (
                            <motion.div
                                key="sophistry-notice"
                                layout
                                initial={{ opacity: 0, height: 0, y: -10, scale: 0.98 }}
                                animate={{ opacity: 1, height: 'auto', y: 0, scale: 1 }}
                                exit={{ opacity: 0, height: 0, y: -6, scale: 0.985 }}
                                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                                style={{ width: '100%', overflow: 'hidden' }}
                            >
                                <SophistryModeNotice compact fontSize={homeFontSizes.warningBody} />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <AnimatePresence initial={false}>
                        {showAdvanced && (
                            <motion.div
                                key="agent-config-panel"
                                layout
                                initial={{ opacity: 0, height: 0, y: -8, scale: 0.985 }}
                                animate={{ opacity: 1, height: 'auto', y: 0, scale: 1 }}
                                exit={{ opacity: 0, height: 0, y: -4, scale: 0.99 }}
                                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                                style={{ width: '100%', overflow: 'hidden' }}
                            >
                                <AgentConfigPanel
                                    savedConfigs={savedConfigs}
                                    selectedConfigIds={selectedConfigIds}
                                    temperatureInputs={temperatureInputs}
                                    enableThinking={enableThinking}
                                    showConfigManager={showConfigManager}
                                    setShowConfigManager={setShowConfigManager}
                                    handleConfigSelect={handleConfigSelect}
                                    handleTemperatureChange={handleTemperatureChange}
                                    handleThinkingToggle={handleThinkingToggle}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

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

                <HomeStatusLegend isSophistryMode={isSophistryMode} />
            </motion.div>
        </div>
    );
}
