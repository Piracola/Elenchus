import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import type { AgentPersonaSummary, ModelConfig } from '../types';
import { buildAgentConfigsPayload, createEmptyAgentFieldMap, createEmptyThinkingMap, type AgentRole } from '../utils/agent/agentConfigs';

function getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
        return error.message;
    }
    return '加载智能体配置失败，请稍后重试。';
}

export function useAgentConfigs() {
    const [savedConfigs, setSavedConfigs] = useState<ModelConfig[]>([]);
    const [agentPersonas, setAgentPersonas] = useState<AgentPersonaSummary[]>([]);
    const [selectedConfigIds, setSelectedConfigIds] = useState<Record<AgentRole, string>>(createEmptyAgentFieldMap);
    const [selectedPersonaIds, setSelectedPersonaIds] = useState<Record<AgentRole, string>>(createEmptyAgentFieldMap);
    const [temperatureInputs, setTemperatureInputs] = useState<Record<AgentRole, string>>(createEmptyAgentFieldMap);
    const [enableThinking, setEnableThinking] = useState<Record<AgentRole, boolean>>(createEmptyThinkingMap);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [showConfigManager, setShowConfigManager] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const hasInitializedRef = useRef(false);
    const wasConfigManagerOpenRef = useRef(false);
    const configRequestIdRef = useRef(0);
    const personaRequestIdRef = useRef(0);
    const pendingRequestCountRef = useRef(0);

    const loadAgentConfigs = useCallback(async (options: { includePersonas?: boolean } = {}) => {
        const { includePersonas = true } = options;
        const configRequestId = ++configRequestIdRef.current;
        const personaRequestId = includePersonas ? ++personaRequestIdRef.current : null;
        pendingRequestCountRef.current += 1;
        setIsLoading(true);
        setError(null);

        try {
            const configsPromise = api.models.list();
            const personasPromise = includePersonas ? api.agentPersonas.list() : Promise.resolve<AgentPersonaSummary[] | null>(null);
            const [configsResult, personasResult] = await Promise.allSettled([
                configsPromise,
                personasPromise,
            ]);

            if (configRequestId === configRequestIdRef.current) {
                if (configsResult.status === 'fulfilled') {
                    setSavedConfigs(configsResult.value);
                } else {
                    setError((current) => current ?? getErrorMessage(configsResult.reason));
                }
            }

            if (includePersonas && personaRequestId === personaRequestIdRef.current) {
                if (personasResult.status === 'fulfilled' && personasResult.value) {
                    setAgentPersonas(personasResult.value);
                } else if (personasResult.status === 'rejected') {
                    setError((current) => current ?? getErrorMessage(personasResult.reason));
                }
            }
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
        if (showConfigManager) {
            wasConfigManagerOpenRef.current = true;
            return;
        }

        if (wasConfigManagerOpenRef.current) {
            wasConfigManagerOpenRef.current = false;
            void loadAgentConfigs({ includePersonas: false });
        }
    }, [showConfigManager, loadAgentConfigs]);

    const handleConfigSelect = useCallback((agent: AgentRole, configId: string) => {
        setSelectedConfigIds(prev => ({ ...prev, [agent]: configId }));
    }, []);

    const handlePersonaSelect = useCallback((agent: AgentRole, personaId: string) => {
        setSelectedPersonaIds(prev => ({ ...prev, [agent]: personaId }));
    }, []);

    const handleTemperatureChange = useCallback((agent: AgentRole, value: string) => {
        setTemperatureInputs(prev => ({ ...prev, [agent]: value }));
    }, []);

    const handleThinkingToggle = useCallback((agent: AgentRole, value: boolean) => {
        setEnableThinking(prev => ({ ...prev, [agent]: value }));
    }, []);

    const buildAgentConfigs = useCallback(() => {
        return buildAgentConfigsPayload(
            savedConfigs,
            selectedConfigIds,
            temperatureInputs,
            enableThinking,
            selectedPersonaIds,
        );
    }, [savedConfigs, selectedConfigIds, temperatureInputs, enableThinking, selectedPersonaIds]);

    return {
        savedConfigs,
        agentPersonas,
        selectedConfigIds,
        selectedPersonaIds,
        temperatureInputs,
        enableThinking,
        showAdvanced,
        setShowAdvanced,
        showConfigManager,
        setShowConfigManager,
        isLoading,
        error,
        reload,
        handleConfigSelect,
        handlePersonaSelect,
        handleTemperatureChange,
        handleThinkingToggle,
        buildAgentConfigs,
    };
}
