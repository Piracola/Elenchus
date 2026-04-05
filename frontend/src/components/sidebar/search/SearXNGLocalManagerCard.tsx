import { api } from '../../../api/client';
import { useSearXNGLocalManager } from './useSearXNGLocalManager';

interface SearXNGLocalManagerCardProps {
    onSearXNGReady?: () => void;
}

export function SearXNGLocalManagerCard({ onSearXNGReady }: SearXNGLocalManagerCardProps) {
    const { status, isLoading, isBusy, handleStart, handleStop, refreshStatus, fetchStatus } = useSearXNGLocalManager();

    const handleStartAndRefresh = async () => {
        await handleStart();
        // 启动后定期刷新状态，持续 30 秒
        if (onSearXNGReady) {
            let attempts = 0;
            const maxAttempts = 6;
            const interval = setInterval(async () => {
                attempts++;
                await fetchStatus();
                // 获取最新状态
                const currentStatus = await api.searxng.getStatus();
                if (attempts >= maxAttempts || currentStatus.searxng_healthy) {
                    clearInterval(interval);
                    if (currentStatus.searxng_healthy && onSearXNGReady) {
                        onSearXNGReady();
                    }
                }
            }, 5000); // 每 5 秒刷新一次
        }
    };

    if (!status) {
        // 仍然加载中，显示一个骨架占位符而不是隐藏
        return (
            <div style={{
                padding: '22px 24px',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-inner)',
                marginBottom: '18px',
            }}>
                <div style={{ fontSize: '17px', color: 'var(--text-muted)', fontWeight: 600 }}>
                    本地 SearXNG 部署
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '12px' }}>
                    正在检测状态...
                </div>
            </div>
        );
    }

    const containerStyle: React.CSSProperties = {
        padding: '22px 24px',
        background: 'var(--bg-tertiary)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-inner)',
    };

    const titleStyle: React.CSSProperties = {
        fontSize: '17px',
        color: 'var(--text-secondary)',
        fontWeight: 600,
        marginBottom: '12px',
    };

    const textStyle: React.CSSProperties = {
        fontSize: '15px',
        color: 'var(--text-muted)',
        lineHeight: 1.6,
        marginBottom: '8px',
    };

    const buttonBaseStyle: React.CSSProperties = {
        padding: '10px 20px',
        borderRadius: 'var(--radius-md)',
        fontSize: '15px',
        fontWeight: 600,
        cursor: isBusy ? 'not-allowed' : 'pointer',
        opacity: isBusy ? 0.6 : 1,
        transition: 'all 0.2s ease',
        border: 'none',
    };

    const primaryButtonStyle: React.CSSProperties = {
        ...buttonBaseStyle,
        background: '#6366F1',
        color: '#fff',
    };

    const dangerButtonStyle: React.CSSProperties = {
        ...buttonBaseStyle,
        background: '#EF4444',
        color: '#fff',
    };

    const getStatusBadge = () => {
        if (!status.docker_available) {
            return {
                color: 'var(--color-orange-500)',
                text: 'Docker 未安装',
            };
        }

        if (status.searxng_healthy) {
            return {
                color: 'var(--color-green-500)',
                text: '运行正常',
            };
        }

        if (status.searxng_running) {
            return {
                color: 'var(--color-yellow-500)',
                text: '启动中...',
            };
        }

        return {
            color: 'var(--text-muted)',
            text: '未启动',
        };
    };

    const badge = getStatusBadge();

    return (
        <div style={containerStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={titleStyle}>本地 SearXNG 部署</div>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '14px',
                        color: badge.color,
                        fontWeight: 600,
                    }}
                >
                    <div
                        style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: badge.color,
                        }}
                    />
                    {badge.text}
                </div>
            </div>

            <div style={textStyle}>
                一键部署 SearXNG 元搜索引擎到本地。所有数据保存在项目目录内，删除项目即完全清理。
            </div>

            {!status.docker_available && (
                <div
                    style={{
                        ...textStyle,
                        color: 'var(--color-orange-600)',
                        background: 'var(--color-orange-50)',
                        padding: '12px 16px',
                        borderRadius: 'var(--radius-md)',
                        marginBottom: '12px',
                    }}
                >
                    <strong>提示：</strong>检测到未安装 Docker。请先安装 Docker Desktop 后才能使用此功能。
                    <br />
                    下载地址：
                    <a
                        href="https://www.docker.com/products/docker-desktop/"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--color-primary)' }}
                    >
                        docker.com/products/docker-desktop
                    </a>
                </div>
            )}

            {status.docker_available && status.searxng_healthy && (
                <div
                    style={{
                        ...textStyle,
                        color: 'var(--color-green-700)',
                        background: 'var(--color-green-50)',
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-md)',
                        marginBottom: '12px',
                    }}
                >
                    SearXNG 已在 {status.searxng_url} 正常运行。你可以在下方切换到 SearXNG 搜索引擎使用。
                </div>
            )}

            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                {status.searxng_running ? (
                    <button
                        onClick={handleStop}
                        disabled={isBusy}
                        style={dangerButtonStyle}
                    >
                        {isBusy ? '操作中...' : '停止 SearXNG'}
                    </button>
                ) : (
                    <button
                        onClick={handleStartAndRefresh}
                        disabled={isBusy || !status.docker_available}
                        style={primaryButtonStyle}
                    >
                        {isBusy ? '启动中...' : '一键启动 SearXNG'}
                    </button>
                )}

                <button
                    onClick={refreshStatus}
                    disabled={isBusy}
                    style={{
                        ...buttonBaseStyle,
                        background: '#FFFFFF',
                        color: '#1D1D1F',
                        border: '1px solid var(--border-subtle)',
                    }}
                >
                    刷新状态
                </button>
            </div>
        </div>
    );
}
