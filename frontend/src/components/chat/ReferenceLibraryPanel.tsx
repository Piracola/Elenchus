import { motion } from 'framer-motion';
import { BookOpenText } from 'lucide-react';
import { ReferenceLibraryPopover } from './referenceLibrary/ReferenceLibraryPopover';
import { useReferenceLibraryPanelState } from './referenceLibrary/useReferenceLibraryPanelState';
import {
    type ReferenceLibraryPanelProps,
} from './referenceLibrary/shared';
import {
    HEADER_TOOLBAR_BUTTON_ACTIVE_STYLE,
    HEADER_TOOLBAR_BUTTON_STYLE,
} from './toolbarStyles';
import { PRESSABLE } from '../../config/motion';

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
        <div style={{ position: 'relative', zIndex: 100 }}>
            <input
                ref={inputRef}
                type="file"
                accept=".txt,.md,.markdown,text/plain,text/markdown"
                onChange={handleFileChange}
                style={{ display: 'none' }}
                data-testid="reference-upload-input"
            />

            <motion.button
                {...PRESSABLE}
                onClick={() => setIsOpen((current) => !current)}
                style={{
                    ...HEADER_TOOLBAR_BUTTON_STYLE,
                    ...(isOpen ? HEADER_TOOLBAR_BUTTON_ACTIVE_STYLE : null),
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
