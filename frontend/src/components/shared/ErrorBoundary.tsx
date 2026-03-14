import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '100vh',
                    padding: '40px',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                }}>
                    <div style={{
                        maxWidth: '500px',
                        padding: '32px',
                        background: 'var(--bg-secondary)',
                        borderRadius: 'var(--radius-lg)',
                        boxShadow: 'var(--shadow-lg)',
                        textAlign: 'center',
                    }}>
                        <div style={{
                            fontSize: '48px',
                            marginBottom: '16px',
                        }}>
                            ⚠️
                        </div>
                        <h1 style={{
                            fontSize: '24px',
                            fontWeight: 600,
                            marginBottom: '12px',
                            color: 'var(--text-primary)',
                        }}>
                            出现了一些问题
                        </h1>
                        <p style={{
                            fontSize: '14px',
                            color: 'var(--text-secondary)',
                            marginBottom: '24px',
                        }}>
                            应用程序遇到了意外错误。请尝试刷新页面或联系支持团队。
                        </p>
                        {this.state.error && (
                            <details style={{
                                marginBottom: '24px',
                                textAlign: 'left',
                                padding: '12px',
                                background: 'var(--bg-tertiary)',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: '12px',
                                color: 'var(--text-muted)',
                            }}>
                                <summary style={{ cursor: 'pointer', fontWeight: 500 }}>
                                    错误详情
                                </summary>
                                <pre style={{
                                    marginTop: '8px',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                }}>
                                    {this.state.error.message}
                                    {'\n\n'}
                                    {this.state.error.stack}
                                </pre>
                            </details>
                        )}
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                            <button
                                onClick={this.handleReset}
                                style={{
                                    padding: '10px 20px',
                                    background: 'var(--text-primary)',
                                    color: 'var(--bg-primary)',
                                    border: 'none',
                                    borderRadius: 'var(--radius-sm)',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                }}
                            >
                                重试
                            </button>
                            <button
                                onClick={() => window.location.reload()}
                                style={{
                                    padding: '10px 20px',
                                    background: 'transparent',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: 'var(--radius-sm)',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                }}
                            >
                                刷新页面
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
