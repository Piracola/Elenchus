import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import type { ModelConfig } from '../types';
import { buildAgentConfigsPayload, createEmptyAgentFieldMap, type AgentRole } from '../utils/agent/agentConfigs';
import { subscribeModelConfigsChanged } from '../utils/agent/modelConfigEvents';

function getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
        return error.message;
    }
    return '加载智能体配置失败，请稍后重试。';
}

export function useAgentConfigs() {
    const [savedConfigs, setSavedConfigs] = useState<ModelConfig[]>([]);
    const [selectedConfigIds, setSelectedConfigIds] = useState<Record<AgentRole, string>>(createEmptyAgentFieldMap);
    const [temperatureInputs, setTemperatureInputs] = useState<Record<AgentRole, string>>(createEmptyAgentFieldMap);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [showConfigManager, setShowConfigManager] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const hasInitializedRef = useRef(false);
    const wasConfigManagerOpenRef = useRef(false);
    const configRequestIdRef = useRef(0);
    const pendingRequestCountRef = useRef(0);

    const loadAgentConfigs = useCallback(async () => {
        const configRequestId = ++configRequestIdRef.current;
        pendingRequestCountRef.current += 1;
        setIsLoading(true);
        setError(null);

        try {
            const configs = await api.models.list();
            if (configRequestId === configRequestIdRef.current) {
                setSavedConfigs(configs);
            }
        } catch (error) {
            setError((current) => current ?? getErrorMessage(error));
        } finally {
            pendingRequestCountRef.current = Math.max(0, pendingRequestCountRef.current - 1);
            setIsLoading(pendingRequestCountRef.current > 0);
        }
    }, []);

    const reload = useCallback(async () => {
        await loadAgentConfigs();
    }, [loadAgentConfigs]);

    useEffect(() => {
        if (!hasInitializedRef.current) {
            hasInitializedRef.current = true;
            void loadAgentConfigs();
        }
    }, [loadAgentConfigs]);

    useEffect(() => {
        return subscribeModelConfigsChanged(() => {
            void loadAgentConfigs();
        });
    }, [loadAgentConfigs]);

    useEffect(() => {
        if (showConfigManager) {
            wasConfigManagerOpenRef.current = true;
            return;
        }

        if (wasConfigManagerOpenRef.current) {
            wasConfigManagerOpenRef.current = false;
            void loadAgentConfigs();
        }
    }, [showConfigManager, loadAgentConfigs]);

    const handleConfigSelect = useCallback((agent: AgentRole, configId: string) => {
        setSelectedConfigIds(prev => ({ ...prev, [agent]: configId }));
    }, []);

    const handleTemperatureChange = useCallback((agent: AgentRole, value: string) => {
        setTemperatureInputs(prev => ({ ...prev, [agent]: value }));
    }, []);

    const buildAgentConfigs = useCallback(() => {
        return buildAgentConfigsPayload(
            savedConfigs,
            selectedConfigIds,
            temperatureInputs,
        );
    }, [savedConfigs, selectedConfigIds, temperatureInputs]);

    return {
        savedConfigs,
        selectedConfigIds,
        temperatureInputs,
        showAdvanced,
        setShowAdvanced,
        showConfigManager,
        setShowConfigManager,
        isLoading,
        error,
        reload,
        handleConfigSelect,
        handleTemperatureChange,
        buildAgentConfigs,
    };
}
