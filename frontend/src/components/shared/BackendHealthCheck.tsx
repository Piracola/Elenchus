import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../api/client';
import BrandIcon from './BrandIcon';

interface Props {
    children: React.ReactNode;
}

export function BackendHealthCheck({ children }: Props) {
    const [isBackendReady, setIsBackendReady] = useState(false);
    const [isChecking, setIsChecking] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const retryCountRef = useRef(0);

    useEffect(() => {
        let mounted = true;
        let timeoutId: ReturnType<typeof setTimeout>;

        const checkHealth = async () => {
            try {
                const result = await api.health.check();
                if (mounted) {
                    if (result.status === 'ok') {
                        setIsBackendReady(true);
                        setIsChecking(false);
                    } else {
                        throw new Error('Backend returned error status');
                    }
                }
            } catch {
                if (mounted) {
                    retryCountRef.current += 1;
                    if (retryCountRef.current >= 60) {
                        setError('后端服务未连接，请检查后端服务是否正常运行');
                        setIsChecking(false);
                    } else {
                        timeoutId = setTimeout(checkHealth, 500);
                    }
                }
            }
        };

        checkHealth();

        return () => {
            mounted = false;
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, []);

    const handleRetry = () => {
        setError(null);
        setIsChecking(true);
        retryCountRef.current = 0;
        setIsBackendReady(false);
    };

    if (isBackendReady) {
        return <>{children}</>;
    }

    return (
        <div style={{
            height: '100vh',
            width: '100vw',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-primary)',
        }}>
            <AnimatePresence mode="wait">
                {isChecking && (
                    <motion.div
                        key="checking"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '20px',
                        }}
                    >
                        <div style={{
                            position: 'relative',
                            width: '64px',
                            height: '64px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    borderRadius: '50%',
                                    border: '2px solid rgba(99, 102, 241, 0.16)',
                                    borderTopColor: 'var(--accent-indigo)',
                                }}
                            />
                            <BrandIcon size={48} alt="Elenchus 品牌图标" />
                        </div>
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '8px',
                        }}>
                            <h2 style={{
                                fontSize: '18px',
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                margin: 0,
                            }}>
                                Elenchus
                            </h2>
                            <p style={{
                                fontSize: '13px',
                                color: 'var(--text-muted)',
                                margin: 0,
                            }}>
                                正在连接后端服务...
                            </p>
                        </div>
                    </motion.div>
                )}

                {error && (
                    <motion.div
                        key="error"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '20px',
                            maxWidth: '400px',
                            padding: '0 24px',
                        }}
                    >
                        <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: 'var(--radius-lg)',
                            background: 'var(--accent-rose)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 20px rgba(239, 68, 68, 0.3)',
                        }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="8" x2="12" y2="12"></line>
                                <line x1="12" y1="16" x2="12.01" y2="16"></line>
                            </svg>
                        </div>
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '8px',
                            textAlign: 'center',
                        }}>
                            <h2 style={{
                                fontSize: '18px',
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                margin: 0,
                            }}>
                                后端未连接
                            </h2>
                            <p style={{
                                fontSize: '13px',
                                color: 'var(--text-muted)',
                                margin: 0,
                                lineHeight: 1.6,
                            }}>
                                {error}
                            </p>
                        </div>
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleRetry}
                            style={{
                                padding: '10px 24px',
                                borderRadius: 'var(--radius-lg)',
                                border: 'none',
                                background: 'var(--text-primary)',
                                color: 'var(--bg-primary)',
                                fontWeight: 600,
                                cursor: 'pointer',
                                fontSize: '13px',
                            }}
                        >
                            重试连接
                        </motion.button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
