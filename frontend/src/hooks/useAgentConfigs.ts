import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import type { ModelConfig } from '../types';
import { buildAgentConfigsPayload, createEmptyAgentFieldMap, createEmptyThinkingMap, type AgentRole } from '../utils/agentConfigs';

export function useAgentConfigs() {
    const [savedConfigs, setSavedConfigs] = useState<ModelConfig[]>([]);
    const [selectedConfigIds, setSelectedConfigIds] = useState<Record<AgentRole, string>>(createEmptyAgentFieldMap);
    const [temperatureInputs, setTemperatureInputs] = useState<Record<AgentRole, string>>(createEmptyAgentFieldMap);
    const [enableThinking, setEnableThinking] = useState<Record<AgentRole, boolean>>(createEmptyThinkingMap);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [showConfigManager, setShowConfigManager] = useState(false);
    const hasLoadedRef = useRef(false);

    const loadConfigs = useCallback(() => {
        api.models.list()
            .then(data => setSavedConfigs(data))
            .catch(err => console.error(err));
    }, []);

    useEffect(() => {
        if (!hasLoadedRef.current) {
            hasLoadedRef.current = true;
            loadConfigs();
        }
    }, [loadConfigs]);

    useEffect(() => {
        if (!showConfigManager && hasLoadedRef.current) {
            loadConfigs();
        }
    }, [showConfigManager, loadConfigs]);

    const handleConfigSelect = (agent: AgentRole, configId: string) => {
        setSelectedConfigIds(prev => ({ ...prev, [agent]: configId }));
    };

    const handleTemperatureChange = useCallback((agent: AgentRole, value: string) => {
        setTemperatureInputs(prev => ({ ...prev, [agent]: value }));
    }, []);

    const handleThinkingToggle = useCallback((agent: AgentRole, value: boolean) => {
        setEnableThinking(prev => ({ ...prev, [agent]: value }));
    }, []);

    const buildAgentConfigs = useCallback(() => {
        return buildAgentConfigsPayload(savedConfigs, selectedConfigIds, temperatureInputs, enableThinking);
    }, [savedConfigs, selectedConfigIds, temperatureInputs, enableThinking]);

    return {
        savedConfigs,
        selectedConfigIds,
        temperatureInputs,
        enableThinking,
        showAdvanced,
        setShowAdvanced,
        showConfigManager,
        setShowConfigManager,
        handleConfigSelect,
        handleTemperatureChange,
        handleThinkingToggle,
        buildAgentConfigs,
    };
}
