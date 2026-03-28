import { ProviderForm } from '../ProviderForm';
import { ProviderSidebar } from '../ProviderSidebar';
import type { useModelConfigManager } from '../../../hooks/useModelConfigManager';

type ModelConfigManager = ReturnType<typeof useModelConfigManager>;

type SettingsProvidersTabProps = {
    modelConfig: ModelConfigManager;
    onClose: () => void;
};

export function SettingsProvidersTab({
    modelConfig,
    onClose,
}: SettingsProvidersTabProps) {
    return (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: '28px' }}>
            <ProviderSidebar
                providers={modelConfig.providers}
                isLoading={modelConfig.isLoading}
                activeIndex={modelConfig.activeIndex}
                isCreatingNew={modelConfig.isCreatingNew}
                onSelect={modelConfig.handleSelectProvider}
                onDelete={modelConfig.handleDeleteProvider}
                onNew={modelConfig.startNew}
            />
            <ProviderForm
                formData={modelConfig.formData}
                isCreatingNew={modelConfig.isCreatingNew}
                newModelInput={modelConfig.newModelInput}
                onFieldChange={modelConfig.updateFormField}
                onAddModel={modelConfig.handleAddModel}
                onRemoveModel={modelConfig.handleRemoveModel}
                onNewModelInputChange={modelConfig.setNewModelInput}
                onSave={modelConfig.handleSave}
                onClose={onClose}
            />
        </div>
    );
}
