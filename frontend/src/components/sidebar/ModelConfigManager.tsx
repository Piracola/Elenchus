import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../api/client';
import type { ModelConfig } from '../../types';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export default function ModelConfigManager({ isOpen, onClose }: Props) {
    const [providers, setProviders] = useState<ModelConfig[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    
    // UI state
    const [activeIndex, setActiveIndex] = useState<number>(0);
    const [isCreatingNew, setIsCreatingNew] = useState(false);

    // Form state corresponding to the CURRENT active index or "new" creator
    const [name, setName] = useState('');
    const [providerType, setProviderType] = useState('openai');
    const [apiKey, setApiKey] = useState('');
    const [apiBaseUrl, setApiBaseUrl] = useState('');
    const [models, setModels] = useState<string[]>([]);
    const [newModelInput, setNewModelInput] = useState('');
    const [isDefault, setIsDefault] = useState(false);

    const fetchConfigs = async () => {
        try {
            setIsLoading(true);
            const data = await api.models.list();
            setProviders(data);
            if (data.length > 0 && !isCreatingNew) {
                // Pre-fill active selection
                const p = data[getActiveIndexClamped(data.length, activeIndex)];
                fillForm(p);
            } else if (data.length === 0) {
                startNew();
            }
        } catch (err) {
            console.error("Failed to load providers", err);
        } finally {
            setIsLoading(false);
        }
    };

    const getActiveIndexClamped = (len: number, idx: number) => {
        if (len === 0) return 0;
        return Math.min(idx, len - 1);
    };

    useEffect(() => {
        if (isOpen) {
            fetchConfigs();
        } else {
            // Reset state slightly
            setIsCreatingNew(false);
        }
    }, [isOpen]);

    const fillForm = (p: ModelConfig) => {
        setName(p.name);
        setProviderType(p.provider_type || 'openai');
        setApiKey(p.api_key || '');
        setApiBaseUrl(p.api_base_url || '');
        setModels(p.models || []);
        setIsDefault(p.is_default || false);
        setIsCreatingNew(false);
    };

    const startNew = () => {
        setIsCreatingNew(true);
        setName('');
        setProviderType('openai');
        setApiKey('');
        setApiBaseUrl('');
        setModels([]);
        setIsDefault(false);
    };

    const handleSelectProvider = (idx: number) => {
        setIsCreatingNew(false);
        setActiveIndex(idx);
        fillForm(providers[idx]);
    };

    const handleDeleteProvider = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("确定要删除这个提供商配置吗？")) return;
        try {
            await api.models.delete(id);
            fetchConfigs();
        } catch (err) {
            console.error("Delete failed", err);
        }
    };

    const handleSave = async () => {
        if (!name.trim()) {
            alert("提供商名称为必填项。");
            return;
        }

        const payload = {
            name: name.trim(),
            provider_type: providerType,
            api_key: apiKey.trim() || null,
            api_base_url: apiBaseUrl.trim() || null,
            models: models,
            is_default: isDefault,
        };

        try {
            if (isCreatingNew) {
                await api.models.create(payload);
                setIsCreatingNew(false);
                await fetchConfigs();
                setActiveIndex(providers.length); // will point to newly created (assuming it goes to bottom, wait it mounts at top actually based on created_at sort. we could just fetch and let it settle)
            } else {
                const currentId = providers[activeIndex].id;
                await api.models.update(currentId, payload);
                await fetchConfigs();
            }
        } catch (err) {
            console.error("Save failed", err);
            alert(`保存失败：${err instanceof Error ? err.message : "未知错误"}`);
        }
    };
    
    const handleAddModel = () => {
        if (!newModelInput.trim()) return;
        if (!models.includes(newModelInput.trim())) {
            setModels([...models, newModelInput.trim()]);
        }
        setNewModelInput('');
    };

    const handleRemoveModel = (mod: string) => {
        setModels(models.filter(m => m !== mod));
    };

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
                            {/* Left: Providers Sidebar */}
                            <div style={{
                                width: '240px',
                                borderRight: '1px solid var(--border-subtle)',
                                background: 'var(--bg-secondary)',
                                display: 'flex',
                                flexDirection: 'column'
                            }}>
                                <div style={{ padding: '20px', borderBottom: '1px solid var(--border-subtle)' }}>
                                    <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                        模型服务商
                                    </h2>
                                </div>
                                <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                                    {isLoading ? (
                                        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>加载中...</div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {providers.map((p, idx) => (
                                                <div 
                                                    key={p.id} 
                                                    onClick={() => handleSelectProvider(idx)}
                                                    style={{
                                                        padding: '10px 14px',
                                                        borderRadius: 'var(--radius-sm)',
                                                        background: (!isCreatingNew && activeIndex === idx) ? 'var(--bg-tertiary)' : 'transparent',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        color: (!isCreatingNew && activeIndex === idx) ? 'var(--text-primary)' : 'var(--text-secondary)',
                                                        fontWeight: (!isCreatingNew && activeIndex === idx) ? 600 : 400,
                                                    }}
                                                >
                                                    <span style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        {p.name}
                                                        {p.is_default && <span title="默认服务商" style={{ fontSize: '11px', color: '#f59e0b' }}>⭐</span>}
                                                    </span>
                                                    {(!isCreatingNew && activeIndex === idx) && (
                                                        <button 
                                                            onClick={(e) => handleDeleteProvider(p.id, e)}
                                                            style={{
                                                                background: 'none',
                                                                border: 'none',
                                                                color: 'var(--text-muted)',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            ×
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                            
                                            <div 
                                                onClick={startNew}
                                                style={{
                                                    padding: '10px 14px',
                                                    borderRadius: 'var(--radius-sm)',
                                                    background: isCreatingNew ? 'var(--bg-tertiary)' : 'transparent',
                                                    cursor: 'pointer',
                                                    color: isCreatingNew ? 'var(--text-primary)' : 'var(--text-secondary)',
                                                    fontWeight: isCreatingNew ? 600 : 400,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px'
                                                }}
                                            >
                                                <span style={{ fontSize: '13px' }}>+ 添加提供商</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Right: Provider Configuration */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
                                
                                <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 10, background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '24px' }}>×</button>

                                {/* Scrollable Form Area */}
                                <div style={{ flex: 1, padding: '32px 40px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>

                                <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px' }}>
                                    <h3 style={{ fontSize: '20px', margin: '0 0 8px', color: 'var(--text-primary)', fontWeight: 600 }}>
                                        {isCreatingNew ? '配置新提供商' : '服务商配置'}
                                    </h3>
                                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>定义您的连接参数以及挂载的子模型。</p>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>提供商名称 *</label>
                                        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="如：AiHubMix / DeepSeek" style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '14px', outline: 'none' }} />
                                    </div>
                                    
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>接入协议</label>
                                        <select 
                                            value={providerType} 
                                            onChange={e => setProviderType(e.target.value)} 
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '14px', outline: 'none', cursor: 'pointer' }}
                                        >
                                            <option value="openai">OpenAI 兼容协议 (最常用)</option>
                                            <option value="anthropic">Anthropic API</option>
                                            <option value="gemini">Google Gemini API</option>
                                        </select>
                                    </div>
                                    
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>API 密钥</label>
                                        <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-..." style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '14px', outline: 'none' }} />
                                    </div>

                                    <div>
                                        <input type="text" value={apiBaseUrl} onChange={e => setApiBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '14px', outline: 'none' }} />
                                    </div>
                                    
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                        <input 
                                            type="checkbox" 
                                            id="isDefaultToggle"
                                            checked={isDefault}
                                            onChange={e => setIsDefault(e.target.checked)}
                                            style={{ cursor: 'pointer' }}
                                        />
                                        <label htmlFor="isDefaultToggle" style={{ fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                                            设为全局默认服务商
                                        </label>
                                    </div>
                                </div>

                                <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '8px 0' }} />

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                                    <h4 style={{ fontSize: '15px', margin: 0, color: 'var(--text-primary)', fontWeight: 600 }}>关联模型</h4>
                                    
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {models.map(mod => (
                                            <div key={mod} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '24px', fontSize: '13px', color: 'var(--text-primary)' }}>
                                                {mod}
                                                <button onClick={() => handleRemoveModel(mod)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>×</button>
                                            </div>
                                        ))}
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                                        <input 
                                            type="text" 
                                            value={newModelInput} 
                                            onChange={e => setNewModelInput(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleAddModel()}
                                            placeholder="输入模型标识 (例如 gpt-4o, claude-3-opus)" 
                                            style={{ flex: 1, padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }} 
                                        />
                                        <button 
                                            onClick={handleAddModel}
                                            style={{ padding: '0 16px', background: 'transparent', border: '1px solid var(--text-primary)', color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '13px' }}
                                        >
                                            添加模型
                                        </button>
                                    </div>
                                </div>
                                </div>

                                {/* Sticky Footer Component */}
                                <div style={{ padding: '16px 40px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'flex-end', marginTop: 'auto' }}>
                                    <button 
                                        onClick={handleSave} 
                                        style={{ padding: '10px 24px', background: 'var(--text-primary)', color: 'var(--bg-primary)', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 600, cursor: 'pointer' }}
                                    >
                                        保存配置
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );

    return createPortal(modalContent, document.body);
}
