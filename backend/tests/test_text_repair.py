from app.text_repair import format_runtime_error_message, normalize_user_visible_text


def test_normalize_user_visible_text_repairs_mixed_runtime_error_text():
    assert normalize_user_visible_text(
        "杈╄鍑洪敊: Your request was blocked."
    ) == "辩论出错：请求被上游模型服务拦截，请检查供应商风控或内容审核策略，或切换模型后重试。"


def test_format_runtime_error_message_collapses_quota_errors():
    raw = (
        "Error code: 403 - {'error': {'message': '用户额度不足, 剩余额度: ＄-0.117550 "
        "(request id: 20260319032744649372622TENXPWCS)', 'type': 'new_api_error', "
        "'param': '', 'code': 'insufficient_user_quota'}}"
    )

    assert format_runtime_error_message(raw) == (
        "模型服务额度不足，请检查供应商账户余额或切换可用提供商后重试。"
        "（request id: 20260319032744649372622TENXPWCS）"
    )
