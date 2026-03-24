import { useState, useCallback } from 'react';
import { api } from '../api/client';
import { useSessionActions } from './useDebateViewState';
import type { AgentConfigResult, DebateMode, JuryConfig, ReasoningConfig, TeamConfig } from '../types';

interface UseSessionCreateResult {
    isCreating: boolean;
    error: string;
    createSession: (
        topic: string,
        maxTurns: number,
        agentConfigs?: Record<string, AgentConfigResult>,
        teamConfig?: TeamConfig,
        juryConfig?: JuryConfig,
        reasoningConfig?: ReasoningConfig,
        debateMode?: DebateMode,
        modeConfig?: Record<string, unknown>,
    ) => Promise<void>;
    clearError: () => void;
}

export function useSessionCreate(): UseSessionCreateResult {
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState('');
    const { setCurrentSession } = useSessionActions();

    const createSession = useCallback(async (
        topic: string,
        maxTurns: number,
        agentConfigs?: Record<string, AgentConfigResult>,
        teamConfig?: TeamConfig,
        juryConfig?: JuryConfig,
        reasoningConfig?: ReasoningConfig,
        debateMode: DebateMode = 'standard',
        modeConfig?: Record<string, unknown>,
    ) => {
        if (!topic.trim() || isCreating) return;

        try {
            setIsCreating(true);
            setError('');
            const session = await api.sessions.create({
                topic: topic.trim(),
                max_turns: maxTurns,
                agent_configs: agentConfigs,
                team_config: teamConfig,
                jury_config: juryConfig,
                reasoning_config: reasoningConfig,
                debate_mode: debateMode,
                mode_config: modeConfig,
            });
            setCurrentSession(session);
        } catch (err) {
            console.error('Failed to create session:', err);
            setError(err instanceof Error ? err.message : '创建会话失败，请检查后端服务是否正常运行');
        } finally {
            setIsCreating(false);
        }
    }, [isCreating, setCurrentSession]);

    const clearError = useCallback(() => {
        setError('');
    }, []);

    return { isCreating, error, createSession, clearError };
}
