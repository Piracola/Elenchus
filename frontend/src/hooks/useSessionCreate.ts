import { useState, useCallback } from 'react';
import { useDebateStore } from '../stores/debateStore';
import { api } from '../api/client';
import type { AgentConfigResult } from '../types';

interface UseSessionCreateResult {
    isCreating: boolean;
    error: string;
    createSession: (topic: string, maxTurns: number, agentConfigs?: Record<string, AgentConfigResult>) => Promise<void>;
    clearError: () => void;
}

export function useSessionCreate(): UseSessionCreateResult {
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState('');
    const { setCurrentSession } = useDebateStore();

    const createSession = useCallback(async (
        topic: string,
        maxTurns: number,
        agentConfigs?: Record<string, AgentConfigResult>
    ) => {
        if (!topic.trim() || isCreating) return;

        try {
            setIsCreating(true);
            setError('');
            const session = await api.sessions.create({
                topic: topic.trim(),
                max_turns: maxTurns,
                agent_configs: agentConfigs,
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
