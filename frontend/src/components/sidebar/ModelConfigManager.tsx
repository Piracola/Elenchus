import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useModelConfigManager } from '../../hooks/useModelConfigManager';
import { ProviderSidebar } from './ProviderSidebar';
import { ProviderForm } from './ProviderForm';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export default function ModelConfigManager({ isOpen, onClose }: Props) {
    const {
        providers,
        isLoading,
        activeIndex,
        isCreatingNew,
        formData,
        newModelInput,
        setNewModelInput,
        fetchConfigs,
        handleSelectProvider,
        handleDeleteProvider,
        handleSave,
        handleAddModel,
        handleRemoveModel,
        updateFormField,
        startNew,
    } = useModelConfigManager();

    useEffect(() => {
        if (isOpen) {
            fetchConfigs();
        }
    }, [isOpen, fetchConfigs]);

    const modalContent = (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(0,0,0,0.6)',
                            backdropFilter: 'blur(4px)',
                            zIndex: 1000,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <motion.div
                            onClick={(e) => e.stopPropagation()}
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            style={{
                                width: '90%',
                                maxWidth: '850px',
                                height: '70vh',
                                maxHeight: '800px',
                                background: 'var(--bg-primary)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: 'var(--radius-lg)',
                                boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                                display: 'flex',
                                overflow: 'hidden'
                            }}
                        >
                            <ProviderSidebar
                                providers={providers}
                                isLoading={isLoading}
                                activeIndex={activeIndex}
                                isCreatingNew={isCreatingNew}
                                onSelect={handleSelectProvider}
                                onDelete={handleDeleteProvider}
                                onNew={startNew}
                            />

                            <ProviderForm
                                formData={formData}
                                isCreatingNew={isCreatingNew}
                                newModelInput={newModelInput}
                                onFieldChange={updateFormField}
                                onAddModel={handleAddModel}
                                onRemoveModel={handleRemoveModel}
                                onNewModelInputChange={setNewModelInput}
                                onSave={handleSave}
                                onClose={onClose}
                            />
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );

    return createPortal(modalContent, document.body);
}

export { ProviderSidebar } from './ProviderSidebar';
export { ProviderForm } from './ProviderForm';
