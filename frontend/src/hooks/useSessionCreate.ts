import { useState, useCallback } from 'react';
import { api } from '../api/client';
import { useSessionActions } from './useDebateViewState';
import type { AgentConfigResult, DebateMode, ReasoningConfig, SpeechConfig } from '../types';

interface UseSessionCreateResult {
    isCreating: boolean;
    error: string;
    createSession: (
        topic: string,
        maxTurns: number,
        agentConfigs?: Record<string, AgentConfigResult>,
        reasoningConfig?: ReasoningConfig,
        speechConfig?: SpeechConfig,
        debateMode?: DebateMode,
        modeConfig?: Record<string, unknown>,
    ) => Promise<string | null>;
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
        reasoningConfig?: ReasoningConfig,
        speechConfig?: SpeechConfig,
        debateMode: DebateMode = 'standard',
        modeConfig?: Record<string, unknown>,
    ): Promise<string | null> => {
        if (!topic.trim() || isCreating) return null;

        try {
            setIsCreating(true);
            setError('');
            const session = await api.sessions.create({
                topic: topic.trim(),
                max_turns: maxTurns,
                agent_configs: agentConfigs,
                reasoning_config: reasoningConfig,
                speech_config: speechConfig,
                debate_mode: debateMode,
                mode_config: modeConfig,
            });
            setCurrentSession(session);
            return session.id;
        } catch (err) {
            console.error('Failed to create session:', err);
            setError(err instanceof Error ? err.message : '创建会话失败，请检查后端服务是否正常运行');
            return null;
        } finally {
            setIsCreating(false);
        }
    }, [isCreating, setCurrentSession]);

    const clearError = useCallback(() => {
        setError('');
    }, []);

    return { isCreating, error, createSession, clearError };
}
