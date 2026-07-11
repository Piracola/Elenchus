import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAgentConfigs } from '../hooks/useAgentConfigs';
import { useSessionCreate } from '../hooks/useSessionCreate';
import { useSettingsStore } from '../stores/settingsStore';
import { getMessageFontTokens } from '../config/display';
import type { DebateMode, RecentDebateConfig } from '../types';
import {
    parseMaxTurnsInput,
    parseGroupDiscussionRoundsInput,
    parseSpeechMaxCharsInput,
} from '../utils/agent/debateSession';
import { HomeComposerCard } from './home/HomeComposerCard';
import type { PendingReferenceDocument } from './home/HomeComposerCard';
import { HomeStatusLegend } from './home/HomeStatusLegend';
import AgentConfigPanel from './shared/AgentConfigPanel';
import BrandIcon from './shared/BrandIcon';
import SidebarExpandButton from './shared/SidebarExpandButton';
import SophistryModeNotice from './shared/SophistryModeNotice';
import { api } from '../api/client';
import { toast } from '../utils/chat/toast';

interface HomeViewProps {
    isSidebarCollapsed: boolean;
    onExpandSidebar: () => void;
}

const AUTO_SCROLL_INTERACTION_GUARD_MS = 1200;

function isAutoScrollBlockingFocus(element: HTMLElement): boolean {
    const tagName = element.tagName;
    return element.isContentEditable
        || tagName === 'INPUT'
        || tagName === 'TEXTAREA'
        || tagName === 'SELECT';
}

export default function HomeView({ isSidebarCollapsed, onExpandSidebar }: HomeViewProps) {
    const homeScrollRef = useRef<HTMLDivElement>(null);
    const composerAnchorRef = useRef<HTMLDivElement>(null);
    const pendingAdvancedScrollRef = useRef<'open' | null>(null);
    const scrollAnimationFrameRef = useRef<number | null>(null);
    const hasAutoScrolledAdvancedRef = useRef(false);
    const recentUserInteractionAtRef = useRef(0);
    const recentConfigAppliedRef = useRef(false);
    const [topic, setTopic] = useState('');
    const [debateMode, setDebateMode] = useState<DebateMode>('standard');
    const [maxTurnsInput, setMaxTurnsInput] = useState('');
    const [groupDiscussionRoundsInput, setGroupDiscussionRoundsInput] = useState('');
    const [proposerSpeechLimitInput, setProposerSpeechLimitInput] = useState('');
    const [opposerSpeechLimitInput, setOpposerSpeechLimitInput] = useState('');
    const [groupDiscussionSpeechLimitInput, setGroupDiscussionSpeechLimitInput] = useState('');
    const [pendingDocuments, setPendingDocuments] = useState<PendingReferenceDocument[]>([]);
    const [recentConfigSnapshot, setRecentConfigSnapshot] = useState<RecentDebateConfig | null>(null);
    const { isCreating, error: createError, createSession, clearError } = useSessionCreate();
    const {
        showAdvanced,
        setShowAdvanced,
        savedConfigs,
        selectedConfigIds,
        temperatureInputs,
        showConfigManager,
        setShowConfigManager,
        error: agentConfigsError,
        handleConfigSelect,
        handleTemperatureChange,
        buildAgentConfigs,
        applyAgentConfigSnapshot,
    } = useAgentConfigs();
    const advancedPanelVisible = showAdvanced;

    const isSophistryMode = debateMode === 'sophistry_experiment';
    const { displaySettings } = useSettingsStore();
    const messageFontSize = displaySettings.messageFontSize ?? 15;
    const homeFontSizes = useMemo(() => getMessageFontTokens(messageFontSize).home, [messageFontSize]);
    const maxTurns = parseMaxTurnsInput(maxTurnsInput);
    const groupDiscussionRounds = parseGroupDiscussionRoundsInput(groupDiscussionRoundsInput);
    const proposerSpeechLimit = parseSpeechMaxCharsInput(proposerSpeechLimitInput);
    const opposerSpeechLimit = parseSpeechMaxCharsInput(opposerSpeechLimitInput);
    const groupDiscussionSpeechLimit = parseSpeechMaxCharsInput(groupDiscussionSpeechLimitInput);

    useEffect(() => {
        let cancelled = false;
        void api.sessions.recentConfig().then((recentConfig) => {
            if (cancelled || !recentConfig) return;
            setRecentConfigSnapshot(recentConfig);
        }).catch((error) => {
            console.warn('Failed to load recent debate config:', error);
            recentConfigAppliedRef.current = true;
        });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!recentConfigSnapshot || recentConfigAppliedRef.current) return;
        const hasAgentConfigs = Object.keys(recentConfigSnapshot.agent_configs ?? {}).length > 0;
        if (hasAgentConfigs && savedConfigs.length === 0) return;

        setDebateMode(recentConfigSnapshot.debate_mode);
        setMaxTurnsInput(String(recentConfigSnapshot.max_turns));
        setGroupDiscussionRoundsInput(String(recentConfigSnapshot.reasoning_config.group_discussion_rounds));
        setProposerSpeechLimitInput(String(recentConfigSnapshot.speech_config.proposer_max_chars));
        setOpposerSpeechLimitInput(String(recentConfigSnapshot.speech_config.opposer_max_chars));
        setGroupDiscussionSpeechLimitInput(String(recentConfigSnapshot.speech_config.group_discussion_max_chars));
        applyAgentConfigSnapshot(recentConfigSnapshot.agent_configs);
        recentConfigAppliedRef.current = true;
    }, [applyAgentConfigSnapshot, recentConfigSnapshot, savedConfigs.length]);

    useEffect(() => {
        const scrollContainer = homeScrollRef.current;
        if (!scrollContainer) {
            return;
        }

        const markRecentInteraction = () => {
            recentUserInteractionAtRef.current = Date.now();
        };
        const handleFocusIn = (event: FocusEvent) => {
            const target = event.target;
            if (target instanceof HTMLElement && isAutoScrollBlockingFocus(target)) {
                markRecentInteraction();
            }
        };

        scrollContainer.addEventListener('wheel', markRecentInteraction, { passive: true });
        scrollContainer.addEventListener('touchstart', markRecentInteraction, { passive: true });
        scrollContainer.addEventListener('scroll', markRecentInteraction, { passive: true });
        scrollContainer.addEventListener('keydown', markRecentInteraction);
        scrollContainer.addEventListener('focusin', handleFocusIn);

        return () => {
            scrollContainer.removeEventListener('wheel', markRecentInteraction);
            scrollContainer.removeEventListener('touchstart', markRecentInteraction);
            scrollContainer.removeEventListener('scroll', markRecentInteraction);
            scrollContainer.removeEventListener('keydown', markRecentInteraction);
            scrollContainer.removeEventListener('focusin', handleFocusIn);
        };
    }, []);

    useEffect(() => {
        const scrollContainer = homeScrollRef.current;
        const scrollIntent = pendingAdvancedScrollRef.current;
        if (!scrollContainer || !scrollIntent) {
            return;
        }

        pendingAdvancedScrollRef.current = null;
        scrollAnimationFrameRef.current = window.requestAnimationFrame(() => {
            scrollAnimationFrameRef.current = null;

            const recentlyInteracted =
                Date.now() - recentUserInteractionAtRef.current < AUTO_SCROLL_INTERACTION_GUARD_MS;
            const activeElement = document.activeElement;
            const focusWithinHome =
                activeElement instanceof HTMLElement
                && scrollContainer.contains(activeElement)
                && isAutoScrollBlockingFocus(activeElement);

            if (
                scrollIntent !== 'open' ||
                !advancedPanelVisible ||
                hasAutoScrolledAdvancedRef.current ||
                recentlyInteracted ||
                focusWithinHome
            ) {
                return;
            }

            hasAutoScrolledAdvancedRef.current = true;
            const composerTop = composerAnchorRef.current?.offsetTop ?? 0;
            scrollContainer.scrollTo({
                top: Math.max(composerTop - 16, 0),
                behavior: 'smooth',
            });
        });

        return () => {
            if (scrollAnimationFrameRef.current !== null) {
                window.cancelAnimationFrame(scrollAnimationFrameRef.current);
                scrollAnimationFrameRef.current = null;
            }
        };
    }, [advancedPanelVisible]);

    const handleShowAdvancedChange = (nextShowAdvanced: boolean) => {
        pendingAdvancedScrollRef.current =
            nextShowAdvanced && !advancedPanelVisible
                ? 'open'
                : null;
        setShowAdvanced(nextShowAdvanced);
    };

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
                    ? {
                        consensus_enabled: false,
                        group_discussion_rounds: 0,
                    }
                    : {
                        consensus_enabled: true,
                        group_discussion_rounds: groupDiscussionRounds,
                    },
                {
                    proposer_max_chars: proposerSpeechLimit,
                    opposer_max_chars: opposerSpeechLimit,
                    group_discussion_max_chars: groupDiscussionSpeechLimit,
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
                const failedDocuments: PendingReferenceDocument[] = [];
                
                for (const doc of pendingDocuments) {
                    try {
                        await api.sessions.uploadDocument(sessionId, doc.file);
                        successCount++;
                    } catch (error) {
                        console.error(`上传参考资料失败: ${doc.name}`, error);
                        failCount++;
                        failedDocuments.push(doc);
                    }
                }
                
                if (successCount > 0) {
                    toast(`成功上传 ${successCount} 个参考资料${failCount > 0 ? `，${failCount} 个失败` : ''}`, 
                        'success');
                } else if (failCount > 0) {
                    toast('参考资料上传失败，但辩论已创建；失败文件已保留，可直接重试', 'error');
                }
                
                setPendingDocuments(failedDocuments);
            }
        } catch (error) {
            console.error('创建辩论失败:', error);
        }
    };

    return (
        <div
            ref={homeScrollRef}
            style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: advancedPanelVisible ? 'flex-start' : 'center',
                background: 'var(--bg-primary)',
                position: 'relative',
                overflowY: 'auto',
                overflowX: 'hidden',
                scrollBehavior: 'smooth',
            }}
            className={advancedPanelVisible ? 'home-workbench home-workbench--advanced' : 'home-workbench'}
        >
            {isSidebarCollapsed && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.14 }}
                    style={{
                        position: 'absolute',
                        top: '20px',
                        left: '20px',
                        zIndex: 2,
                    }}
                >
                    <SidebarExpandButton
                        onClick={onExpandSidebar}
                        style={{
                            boxShadow: 'var(--shadow-sm)',
                            backdropFilter: undefined,
                        }}
                        className="home-sidebar-expand-button"
                    />
                </motion.div>
            )}

            <motion.div
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                style={{
                    width: '100%',
                    maxWidth: '900px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    position: 'relative',
                    zIndex: 1,
                    paddingBottom: '40px',
                }}
                className={isSidebarCollapsed ? 'home-workbench-content home-workbench-content--with-sidebar-button' : 'home-workbench-content'}
            >
                <motion.div
                    initial={false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05, duration: 0.24 }}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px',
                        marginBottom: '16px',
                        flexWrap: 'wrap',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            minWidth: 0,
                        }}
                    >
                        <BrandIcon size={36} alt="Elenchus 品牌图标" withBadge={false} />
                        <div style={{ minWidth: 0 }}>
                            <h1
                                style={{
                                    fontSize: homeFontSizes.title,
                                    fontWeight: 700,
                                    color: 'var(--text-primary)',
                                    letterSpacing: 0,
                                    margin: 0,
                                }}
                            >
                                Elenchus
                            </h1>
                            <p
                                style={{
                                    fontSize: homeFontSizes.subtitle,
                                    color: 'var(--text-secondary)',
                                    marginTop: '2px',
                                    fontWeight: 400,
                                    lineHeight: 1.45,
                                }}
                            >
                                输入辩题，配置角色，直接开始多智能体辩论。
                            </p>
                        </div>
                    </div>
                    <HomeStatusLegend isSophistryMode={isSophistryMode} compact />
                </motion.div>

                <div ref={composerAnchorRef} style={{ width: '100%' }}>
                    <HomeComposerCard
                        topic={topic}
                        debateMode={debateMode}
                        isCreating={isCreating}
                        isSophistryMode={isSophistryMode}
                        showAdvanced={showAdvanced}
                        maxTurnsInput={maxTurnsInput}
                        groupDiscussionRoundsInput={groupDiscussionRoundsInput}
                        proposerSpeechLimitInput={proposerSpeechLimitInput}
                        opposerSpeechLimitInput={opposerSpeechLimitInput}
                        groupDiscussionSpeechLimitInput={groupDiscussionSpeechLimitInput}
                        homeFontSizes={homeFontSizes}
                        pendingDocuments={pendingDocuments}
                        onDebateModeChange={setDebateMode}
                        onDocumentsChange={setPendingDocuments}
                        onTopicChange={(value) => {
                            if (createError) {
                                clearError();
                            }
                            setTopic(value);
                        }}
                        onShowAdvancedChange={handleShowAdvancedChange}
                        onMaxTurnsChange={setMaxTurnsInput}
                        onGroupDiscussionRoundsChange={setGroupDiscussionRoundsInput}
                        onProposerSpeechLimitChange={setProposerSpeechLimitInput}
                        onOpposerSpeechLimitChange={setOpposerSpeechLimitInput}
                        onGroupDiscussionSpeechLimitChange={setGroupDiscussionSpeechLimitInput}
                        onCreateDebate={() => {
                            void handleCreateDebate();
                        }}
                    />
                </div>

                <div
                    style={{
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        marginTop: '16px',
                        minHeight: 0,
                    }}
                >
                    <AnimatePresence initial={false}>
                        {isSophistryMode && (
                            <motion.div
                                key="sophistry-notice"
                                initial={{ opacity: 0, height: 0, y: -10 }}
                                animate={{ opacity: 1, height: 'auto', y: 0 }}
                                exit={{ opacity: 0, height: 0, y: -6 }}
                                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                                style={{ width: '100%', overflow: 'hidden' }}
                            >
                                <SophistryModeNotice compact fontSize={homeFontSizes.warningBody} />
                            </motion.div>
                        )}
                    </AnimatePresence>

                <AnimatePresence initial={false}>
                    {advancedPanelVisible && (
                        <motion.div
                            key="agent-config-panel"
                            initial={{ opacity: 0, height: 0, y: -8 }}
                            animate={{ opacity: 1, height: 'auto', y: 0 }}
                            exit={{ opacity: 0, height: 0, y: -4 }}
                            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                            style={{ width: '100%', overflow: 'visible', minHeight: 0 }}
                        >
                            {agentConfigsError && (
                                <div style={{
                                    marginBottom: '12px',
                                    padding: '10px 12px',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--accent-rose)',
                                    background: 'var(--accent-rose-alpha)',
                                    color: 'var(--text-secondary)',
                                    fontSize: '12px',
                                }}>
                                    {agentConfigsError}
                                </div>
                            )}
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
                </div>

                <AnimatePresence>
                    {createError && (
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
                                background: 'var(--accent-rose-alpha)',
                                borderRadius: 'var(--radius-lg)',
                                fontWeight: 500,
                            }}
                        >
                            {createError}
                        </motion.p>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    );
}
