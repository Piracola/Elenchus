import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';

import { api } from '../../../api/client';
import { useSessionActions } from '../../../hooks/useDebateViewState';
import type { ReferenceLibraryResponse } from '../../../types';
import { toast } from '../../../utils/chat/toast';
import { EMPTY_LIBRARY, getErrorMessage } from './shared';

type UseReferenceLibraryPanelStateOptions = {
    currentSessionId: string;
};

export function useReferenceLibraryPanelState({ currentSessionId }: UseReferenceLibraryPanelStateOptions) {
    const { setCurrentSession } = useSessionActions();
    const inputRef = useRef<HTMLInputElement>(null);
    const requestIdRef = useRef(0);
    const [isOpen, setIsOpen] = useState(false);
    const [referenceLibrary, setReferenceLibrary] = useState<ReferenceLibraryResponse>(EMPTY_LIBRARY);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState('');

    const loadReferenceLibrary = useCallback(async (sessionId: string) => {
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        setIsLoading(true);
        setErrorMessage('');

        try {
            const data = await api.sessions.getReferenceLibrary(sessionId);
            if (requestIdRef.current !== requestId) {
                return;
            }
            setReferenceLibrary(data);
            setHasLoaded(true);
        } catch (error) {
            if (requestIdRef.current !== requestId) {
                return;
            }
            setErrorMessage(getErrorMessage(error));
        } finally {
            if (requestIdRef.current === requestId) {
                setIsLoading(false);
            }
        }
    }, []);

    const refreshSession = useCallback(async (sessionId: string) => {
        const latestSession = await api.sessions.get(sessionId);
        setCurrentSession(latestSession);
    }, [setCurrentSession]);

    useEffect(() => {
        requestIdRef.current += 1;
        setIsOpen(false);
        setReferenceLibrary(EMPTY_LIBRARY);
        setHasLoaded(false);
        setIsLoading(false);
        setIsUploading(false);
        setDeletingDocumentId(null);
        setErrorMessage('');
        if (inputRef.current) {
            inputRef.current.value = '';
        }
    }, [currentSessionId]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        void loadReferenceLibrary(currentSessionId);
    }, [currentSessionId, isOpen, loadReferenceLibrary]);

    const handleUploadButtonClick = () => {
        if (isUploading || deletingDocumentId) {
            return;
        }
        inputRef.current?.click();
    };

    const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        setIsUploading(true);
        setErrorMessage('');
        try {
            await api.sessions.uploadDocument(currentSessionId, file);
            await Promise.all([
                loadReferenceLibrary(currentSessionId),
                refreshSession(currentSessionId),
            ]);
            toast(`参考资料已上传：${file.name}`, 'success');
            setIsOpen(true);
        } catch (error) {
            const message = getErrorMessage(error);
            setErrorMessage(message);
            toast(message, 'error');
        } finally {
            setIsUploading(false);
            event.target.value = '';
        }
    };

    const handleDeleteDocument = async (documentId: string, filename: string) => {
        setDeletingDocumentId(documentId);
        setErrorMessage('');
        try {
            await api.sessions.deleteDocument(currentSessionId, documentId);
            await Promise.all([
                loadReferenceLibrary(currentSessionId),
                refreshSession(currentSessionId),
            ]);
            toast(`参考资料已删除：${filename}`, 'success');
        } catch (error) {
            const message = getErrorMessage(error);
            setErrorMessage(message);
            toast(message, 'error');
        } finally {
            setDeletingDocumentId(null);
        }
    };

    return {
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
    };
}
