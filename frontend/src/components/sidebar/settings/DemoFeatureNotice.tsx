import { Shield } from 'lucide-react';

interface Props {
    feature: string;
}

export function DemoFeatureNotice({ feature }: Props) {
    return (
        <div className="settings-demo-notice">
            <div className="settings-demo-notice-inner">
                <div className="settings-demo-notice-icon">
                    <Shield size={30} />
                </div>
                <h3 className="settings-demo-notice-title">演示模式限制</h3>
                <p className="settings-demo-notice-text">
                    「{feature}」功能在演示模式下不可用。登录管理员账号后可解锁完整功能。
                </p>
            </div>
        </div>
    );
}
