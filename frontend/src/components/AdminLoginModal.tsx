/**
 * Admin login modal for demo mode.
 * Allows admin users to authenticate and bypass demo restrictions.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { adminApi, useDemoModeStore } from '../../stores/demoModeStore';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export default function AdminLoginModal({ isOpen, onClose }: Props) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { setAdminToken, setIsAdmin } = useDemoModeStore();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const result = await adminApi.login(username, password);
        setLoading(false);

        if (result) {
            setAdminToken(result.token);
            setIsAdmin(true);
            onClose();
            // Reload to apply admin privileges
            window.location.reload();
        } else {
            setError('Invalid admin credentials');
        }
    };

    return (
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
                            background: 'rgba(0,0,0,0.5)',
                            backdropFilter: 'blur(8px)',
                            zIndex: 2000,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <motion.div
                            onClick={(e) => e.stopPropagation()}
                            initial={{ opacity: 0, scale: 0.9, y: 30 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 30 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            style={{
                                width: '400px',
                                background: 'var(--bg-secondary)',
                                borderRadius: 'var(--radius-xl)',
                                boxShadow: 'var(--shadow-2xl)',
                                border: '1px solid var(--border-subtle)',
                                padding: '32px',
                            }}
                        >
                            <h3 style={{
                                margin: '0 0 24px',
                                fontSize: '20px',
                                fontWeight: 700,
                                color: 'var(--text-primary)',
                            }}>
                                管理员登录
                            </h3>

                            {error && (
                                <div style={{
                                    padding: '10px 14px',
                                    background: 'var(--color-red-50)',
                                    border: '1px solid var(--color-red-200)',
                                    borderRadius: 'var(--radius-lg)',
                                    marginBottom: '16px',
                                    color: 'var(--color-red-700)',
                                    fontSize: '14px',
                                }}>
                                    {error}
                                </div>
                            )}

                            <form onSubmit={handleSubmit}>
                                <div style={{ marginBottom: '16px' }}>
                                    <label style={{
                                        display: 'block',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        color: 'var(--text-secondary)',
                                        marginBottom: '6px',
                                    }}>
                                        用户名
                                    </label>
                                    <input
                                        type="text"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            borderRadius: 'var(--radius-md)',
                                            border: '1px solid var(--border-subtle)',
                                            background: 'var(--bg-primary)',
                                            color: 'var(--text-primary)',
                                            fontSize: '14px',
                                            outline: 'none',
                                            boxSizing: 'border-box',
                                        }}
                                    />
                                </div>

                                <div style={{ marginBottom: '24px' }}>
                                    <label style={{
                                        display: 'block',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        color: 'var(--text-secondary)',
                                        marginBottom: '6px',
                                    }}>
                                        密码
                                    </label>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            borderRadius: 'var(--radius-md)',
                                            border: '1px solid var(--border-subtle)',
                                            background: 'var(--bg-primary)',
                                            color: 'var(--text-primary)',
                                            fontSize: '14px',
                                            outline: 'none',
                                            boxSizing: 'border-box',
                                        }}
                                    />
                                </div>

                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        style={{
                                            padding: '8px 16px',
                                            borderRadius: 'var(--radius-md)',
                                            border: '1px solid var(--border-subtle)',
                                            background: 'transparent',
                                            color: 'var(--text-secondary)',
                                            cursor: 'pointer',
                                            fontSize: '14px',
                                        }}
                                    >
                                        取消
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        style={{
                                            padding: '8px 24px',
                                            borderRadius: 'var(--radius-md)',
                                            border: 'none',
                                            background: loading ? 'var(--text-muted)' : 'var(--accent-primary, #4f46e5)',
                                            color: 'white',
                                            cursor: loading ? 'not-allowed' : 'pointer',
                                            fontSize: '14px',
                                            fontWeight: 600,
                                        }}
                                    >
                                        {loading ? '登录中...' : '登录'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
