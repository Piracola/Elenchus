import { motion } from 'framer-motion';
import { BookOpenText } from 'lucide-react';
import { ReferenceLibraryPopover } from './referenceLibrary/ReferenceLibraryPopover';
import { useReferenceLibraryPanelState } from './referenceLibrary/useReferenceLibraryPanelState';
import {
    type ReferenceLibraryPanelProps,
} from './referenceLibrary/shared';

export default function ReferenceLibraryPanel({
    currentSessionId,
    isSophistryMode,
}: ReferenceLibraryPanelProps) {
    const {
        inputRef,
        isOpen,
        referenceLibrary,
        hasLoaded,
        isLoading,
        isUploading,
        deletingDocumentId,
        errorMessage,
        setIsOpen,
        loadReferenceLibrary,
        handleUploadButtonClick,
        handleFileChange,
        handleDeleteDocument,
    } = useReferenceLibraryPanelState({ currentSessionId });

    const buttonLabel = hasLoaded
        ? `参考资料 ${referenceLibrary.documents.length}`
        : '参考资料';

    return (
        <div style={{ position: 'relative' }}>
            <input
                ref={inputRef}
                type="file"
                accept=".txt,.md,.markdown,text/plain,text/markdown"
                onChange={handleFileChange}
                style={{ display: 'none' }}
                data-testid="reference-upload-input"
            />

            <motion.button
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsOpen((current) => !current)}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 12px',
                    background: isSophistryMode
                        ? 'rgba(184, 137, 70, 0.14)'
                        : 'var(--bg-tertiary)',
                    color: isSophistryMode
                        ? 'var(--mode-sophistry-accent)'
                        : 'var(--text-secondary)',
                    border: isSophistryMode
                        ? '1px solid var(--mode-sophistry-border)'
                        : '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-full)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                }}
                title="查看并上传参考资料"
            >
                <BookOpenText size={14} />
                {buttonLabel}
            </motion.button>

            <ReferenceLibraryPopover
                currentSessionId={currentSessionId}
                deletingDocumentId={deletingDocumentId}
                errorMessage={errorMessage}
                hasLoaded={hasLoaded}
                isLoading={isLoading}
                isOpen={isOpen}
                isSophistryMode={isSophistryMode}
                isUploading={isUploading}
                onDeleteDocument={(documentId, filename) => {
                    void handleDeleteDocument(documentId, filename);
                }}
                onRefresh={(sessionId) => {
                    void loadReferenceLibrary(sessionId);
                }}
                onUploadClick={handleUploadButtonClick}
                referenceLibrary={referenceLibrary}
            />
        </div>
    );
}
