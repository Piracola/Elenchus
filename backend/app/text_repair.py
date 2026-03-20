"""Helpers for repairing mojibake and normalizing user-facing runtime text."""

from __future__ import annotations

import re
from typing import Any

_MOJIBAKE_REPLACEMENTS: tuple[tuple[str, str], ...] = (
    ("姝ｅ湪鏁寸悊涓婁笅鏂", "正在整理上下文..."),
    ("姝ｅ湪鍒囨崲鍙戣█鏂", "正在切换发言方..."),
    ("缁勫唴璁ㄨ姝ｅ湪灞曞紑", "组内讨论正在展开..."),
    ("澶氳瑙掗櫔瀹″洟姝ｅ湪璁ㄨ鏈疆琛ㄧ幇", "多视角陪审团正在讨论本轮表现..."),
    ("杈╂墜姝ｅ湪鎬濊€冨苟缁勭粐鍙戣█", "辩手正在思考并组织发言..."),
    ("姝ｅ湪璋冪敤宸ュ叿鏍搁獙浜嬪疄", "正在调用工具核验事实..."),
    ("瑁佸垽姝ｅ湪璇勪及鏈疆琛ㄧ幇", "裁判正在评估本轮表现..."),
    ("鍑嗗杩涘叆涓嬩竴鍥炲悎", "准备进入下一回合..."),
    ("杈╄鍑嗗涓", "辩论准备中..."),
    ("杈╄宸插畬鎴", "辩论已完成"),
    ("杈╄鍑洪敊", "辩论出错"),
    ("绯荤粺杩愯鍑洪敊", "系统运行出错"),
    ("鍑虹幇閿欒", "出现错误"),
    ("绯荤粺閿欒", "系统错误"),
    ("绯荤粺", "系统"),
    ("瑙備紬鍙戣█", "观众发言"),
)

_PROVIDER_MESSAGE_REPLACEMENTS: tuple[tuple[str, str], ...] = (
    (
        "Your request was blocked.",
        "请求被上游模型服务拦截，请检查供应商风控或内容审核策略，或切换模型后重试。",
    ),
    (
        "Model invocation blocked: the selected agent is missing an API key. "
        "Open Settings and choose or create a default model provider first.",
        "当前智能体缺少 API Key，请在设置中选择或创建默认模型提供商后重试。",
    ),
    (
        "Model invocation blocked: the selected provider was not found. "
        "Open Settings and re-select the provider for this agent.",
        "当前智能体引用的模型提供商不存在，请在设置中重新选择该智能体的提供商。",
    ),
    (
        "Model invocation blocked: this agent references provider settings "
        "without a matching provider credential. Open Settings and choose "
        "the provider explicitly for this agent.",
        "当前智能体引用了未绑定凭证的模型提供商，请在设置中为该智能体显式选择可用提供商。",
    ),
    (
        "Model invocation blocked: custom parameters must be a JSON object.",
        "模型自定义参数格式无效，请提供 JSON 对象。",
    ),
    (
        "Model invocation blocked: provider endpoint returned HTML instead of "
        "OpenAI-compatible JSON",
        "模型服务地址配置错误：当前接口返回的是 HTML 页面而不是 OpenAI 兼容 JSON。",
    ),
    (
        "[Provider endpoint returned HTML instead of model output. "
        "Check API Base URL points to the OpenAI-compatible API route "
        "(usually ending with /v1).]",
        "模型服务地址配置错误：当前接口返回的是 HTML 页面，请将 API Base URL 指向 OpenAI 兼容接口地址（通常以 /v1 结尾）。",
    ),
)

_RUNTIME_ERROR_PREFIXES: tuple[tuple[str, str], ...] = (
    ("辩论出错:", "辩论出错："),
    ("辩论出错：", "辩论出错："),
    ("系统运行出错:", "系统运行出错："),
    ("系统运行出错：", "系统运行出错："),
)

_REQUEST_ID_RE = re.compile(r"request id:\s*([^)'\s]+)", re.IGNORECASE)
_QUOTA_MARKERS = (
    "insufficient_user_quota",
    "insufficient quota",
    "remaining quota",
    "额度不足",
    "剩余额度",
    "预扣费额度",
)


def repair_known_mojibake_text(text: str) -> str:
    """Repair known mojibake fragments while preserving surrounding context."""
    if not text:
        return text

    repaired = _repair_debate_start_text(text)
    for fragment, replacement in _MOJIBAKE_REPLACEMENTS:
        repaired = repaired.replace(fragment, replacement)
    return _collapse_noise_only_suffixes(repaired)


def normalize_user_visible_text(text: str) -> str:
    """Normalize mojibake and common provider-side error messages."""
    repaired = repair_known_mojibake_text(text).strip()
    if not repaired:
        return repaired

    prefix, content = _split_runtime_error_prefix(repaired)
    normalized_content = _normalize_provider_error_text(content)
    if prefix:
        return f"{prefix}{normalized_content}"
    return normalized_content


def format_runtime_error_message(error: Any) -> str:
    """Build a concise user-facing runtime error message from any exception."""
    raw = str(error).strip() if error is not None else ""
    if not raw:
        return "发生未知错误，请稍后重试。"
    return _normalize_provider_error_text(repair_known_mojibake_text(raw))


def repair_text_tree(value: Any) -> Any:
    """Recursively repair user-visible strings inside nested payloads."""
    if isinstance(value, str):
        return normalize_user_visible_text(value)

    if isinstance(value, list):
        return [repair_text_tree(item) for item in value]

    if isinstance(value, tuple):
        return tuple(repair_text_tree(item) for item in value)

    if not value or not isinstance(value, dict):
        return value

    return {
        key: repair_text_tree(item)
        for key, item in value.items()
    }


def _repair_debate_start_text(text: str) -> str:
    if "杈╄寮€濮" not in text:
        return text

    topic = re.sub(r"^.*?[\s:：]+", "", text).strip()
    if topic and topic != text.strip():
        return f"辩论开始：{topic}"
    return text.replace("杈╄寮€濮", "辩论开始")


def _split_runtime_error_prefix(text: str) -> tuple[str, str]:
    for prefix, normalized_prefix in _RUNTIME_ERROR_PREFIXES:
        if text.startswith(prefix):
            return normalized_prefix, text[len(prefix):].strip()
    return "", text


def _normalize_provider_error_text(text: str) -> str:
    normalized = text.strip()
    if not normalized:
        return normalized

    lowered = normalized.lower()
    if any(marker in lowered for marker in _QUOTA_MARKERS):
        request_id = _extract_request_id(normalized)
        suffix = f"（request id: {request_id}）" if request_id else ""
        return (
            "模型服务额度不足，请检查供应商账户余额或切换可用提供商后重试。"
            f"{suffix}"
        )

    for fragment, replacement in _PROVIDER_MESSAGE_REPLACEMENTS:
        normalized = normalized.replace(fragment, replacement)

    return normalized


def _extract_request_id(text: str) -> str | None:
    match = _REQUEST_ID_RE.search(text)
    if match:
        return match.group(1)
    return None


def _collapse_noise_only_suffixes(text: str) -> str:
    for _, replacement in _MOJIBAKE_REPLACEMENTS:
        if not text.startswith(replacement):
            continue

        suffix = text[len(replacement):]
        if suffix and re.fullmatch(r"[\s?.!。？！…:：]*", suffix):
            return replacement

    return text
