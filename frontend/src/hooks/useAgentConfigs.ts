import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import type { ModelConfig, AgentConfigResult } from '../types';

export function useAgentConfigs() {
    const [savedConfigs, setSavedConfigs] = useState<ModelConfig[]>([]);
    const [selectedConfigIds, setSelectedConfigIds] = useState<Record<string, string>>({
        proposer: '', opposer: '', judge: '', fact_checker: '',
    });
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [showConfigManager, setShowConfigManager] = useState(false);

    const loadConfigs = useCallback(async () => {
        try {
            const data = await api.models.list();
            setSavedConfigs(data);
        } catch (err) {
            console.error(err);
        }
    }, []);

    useEffect(() => {
        if (showAdvanced) loadConfigs();
    }, [showAdvanced, showConfigManager, loadConfigs]);

    const handleConfigSelect = (agent: string, configId: string) => {
        setSelectedConfigIds(prev => ({ ...prev, [agent]: configId }));
    };

    const buildAgentConfigs = useCallback((): Record<string, AgentConfigResult> | undefined => {
        const result: Record<string, AgentConfigResult> = {};
        for (const [key, selectedKey] of Object.entries(selectedConfigIds)) {
            if (!selectedKey) continue;
            const [providerId, modelStr] = selectedKey.split('::');
            const configDef = savedConfigs.find(c => c.id === providerId);
            if (configDef) {
                result[key] = {
                    model: modelStr,
                    provider_type: configDef.provider_type,
                    provider_id: configDef.id,
                    api_base_url: configDef.api_base_url || undefined,
                };
            }
        }
        return Object.keys(result).length > 0 ? result : undefined;
    }, [selectedConfigIds, savedConfigs]);

    return {
        savedConfigs,
        selectedConfigIds,
        showAdvanced,
        setShowAdvanced,
        showConfigManager,
        setShowConfigManager,
        handleConfigSelect,
        buildAgentConfigs,
    };
}
