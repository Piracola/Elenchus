import { describe, expect, it } from 'vitest';

import { repairKnownMojibakeText } from './textRepair';

describe('textRepair', () => {
    it('repairs mixed mojibake runtime errors without dropping the suffix', () => {
        expect(repairKnownMojibakeText('杈╄鍑洪敊: Your request was blocked.')).toBe(
            '辩论出错：请求被上游模型服务拦截，请检查供应商风控或内容审核策略，或切换模型后重试。',
        );
    });

    it('collapses quota errors into a concise user-facing message', () => {
        const raw = "辩论出错: Error code: 403 - {'error': {'message': '用户额度不足, 剩余额度: ＄-0.117550 (request id: 20260319032744649372622TENXPWCS)', 'code': 'insufficient_user_quota'}}";

        expect(repairKnownMojibakeText(raw)).toBe(
            '辩论出错：模型服务额度不足，请检查供应商账户余额或切换可用提供商后重试。（request id: 20260319032744649372622TENXPWCS）',
        );
    });
});
