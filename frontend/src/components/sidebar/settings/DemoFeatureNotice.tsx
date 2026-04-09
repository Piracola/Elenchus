import { Shield } from 'lucide-react';

interface Props {
    feature: string;
}

export function DemoFeatureNotice({ feature }: Props) {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 24px',
            textAlign: 'center',
            gap: '16px',
        }}>
            <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'var(--bg-tertiary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                <Shield size={32} color="var(--text-muted)" />
            </div>
            <h3 style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--text-primary)',
            }}>
                演示模式限制
            </h3>
            <p style={{
                margin: 0,
                fontSize: '15px',
                color: 'var(--text-muted)',
                lineHeight: 1.6,
                maxWidth: '400px',
            }}>
                「{feature}」功能在演示模式下不可用。
                登录管理员账号后可解锁完整功能。
            </p>
        </div>
    );
}
