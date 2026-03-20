"""Reference document preprocessing with LLM-first and deterministic fallback paths."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.safe_invoke import invoke_text_model, normalize_model_text

logger = logging.getLogger(__name__)

_SUMMARY_MAX_CHARS = 280
_TERM_LIMIT = 6
_CLAIM_LIMIT = 8
_EXCERPT_LIMIT = 4

_PREPROCESS_SYSTEM_PROMPT = """
You are a neutral reference document preprocessor for an AI debate system.
Reply in Chinese and return ONLY valid JSON.
Do not argue for either side.
Compress the document into concise, source-grounded structured notes.
""".strip()

_PREPROCESS_USER_TEMPLATE = """
请阅读下面的参考文档，并提取适合辩论系统使用的结构化资料。

要求：
1. `summary` 用 2-4 句概括文档最核心内容。
2. `terms` 提取关键术语或体系定义，最多 {term_limit} 条。
3. `claims` 提取可进一步核查的关键事实或陈述，最多 {claim_limit} 条。
4. `excerpts` 提取最值得保留的原文摘录，最多 {excerpt_limit} 条。
5. 每条尽量附带 `source_excerpt`，内容应来自原文而不是编造。
6. 如果某类没有合适内容，返回空数组。
7. 只返回 JSON，不要添加 markdown、解释或额外文字。

输出 JSON 结构：
{{
  "summary": "string",
  "terms": [
    {{
      "term": "string",
      "definition": "string",
      "source_excerpt": "string"
    }}
  ],
  "claims": [
    {{
      "title": "string",
      "statement": "string",
      "source_excerpt": "string"
    }}
  ],
  "excerpts": [
    {{
      "title": "string",
      "excerpt": "string"
    }}
  ]
}}

文档名：{filename}
文档正文：
{content}
""".strip()


@dataclass(slots=True)
class PreprocessedReferenceEntry:
    entry_type: str
    title: str | None
    content: str
    payload: dict[str, Any]
    importance: int
    source_section: str | None
    source_order: int


def _strip_code_fences(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    return cleaned


def _extract_json_fragment(text: str) -> str | None:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or start >= end:
        return None
    return text[start : end + 1]


def _split_paragraphs(text: str) -> list[str]:
    paragraphs = [segment.strip() for segment in re.split(r"\n\s*\n", text) if segment.strip()]
    if paragraphs:
        return paragraphs
    return [segment.strip() for segment in text.splitlines() if segment.strip()]


def _split_sentences(text: str) -> list[str]:
    fragments = re.split(r"(?<=[。！？!?\.])\s+|\n+", text)
    return [fragment.strip(" \t-") for fragment in fragments if fragment.strip()]


def _truncate(text: str, limit: int) -> str:
    normalized = text.strip()
    if len(normalized) <= limit:
        return normalized
    return normalized[:limit].rstrip() + "..."


def _coalesce_summary(paragraphs: list[str]) -> str:
    summary_parts: list[str] = []
    for paragraph in paragraphs:
        if not paragraph:
            continue
        summary_parts.append(paragraph)
        joined = " ".join(summary_parts)
        if len(joined) >= _SUMMARY_MAX_CHARS:
            break
        if len(summary_parts) >= 2:
            break
    return _truncate(" ".join(summary_parts), _SUMMARY_MAX_CHARS)


def _extract_term_candidates(paragraphs: list[str]) -> list[dict[str, str]]:
    seen: set[str] = set()
    results: list[dict[str, str]] = []

    heading_pattern = re.compile(r"^#{1,6}\s*(.+?)\s*$")
    pair_pattern = re.compile(r"^([A-Za-z0-9\u4e00-\u9fff（）()·\-_]{2,40})\s*[:：]\s*(.{4,180})$")
    define_pattern = re.compile(r"^(.{2,30}?)(?:是|指的是|指)\s*(.{6,160})$")

    for paragraph in paragraphs:
        heading_match = heading_pattern.match(paragraph)
        if heading_match:
            term = heading_match.group(1).strip()
            key = term.lower()
            if key not in seen and len(term) <= 40:
                seen.add(key)
                results.append(
                    {
                        "term": term,
                        "definition": f"{term} 是文档中的重点章节或主题。",
                        "source_excerpt": term,
                    }
                )
            continue

        pair_match = pair_pattern.match(paragraph)
        if pair_match:
            term = pair_match.group(1).strip()
            definition = pair_match.group(2).strip()
            key = term.lower()
            if key not in seen:
                seen.add(key)
                results.append(
                    {
                        "term": term,
                        "definition": _truncate(definition, 180),
                        "source_excerpt": _truncate(paragraph, 160),
                    }
                )
            continue

        define_match = define_pattern.match(paragraph)
        if define_match:
            term = define_match.group(1).strip("“”\"' ")
            definition = define_match.group(2).strip()
            key = term.lower()
            if key not in seen and 2 <= len(term) <= 30:
                seen.add(key)
                results.append(
                    {
                        "term": term,
                        "definition": _truncate(definition, 180),
                        "source_excerpt": _truncate(paragraph, 160),
                    }
                )

        if len(results) >= _TERM_LIMIT:
            break

    return results[:_TERM_LIMIT]


def _looks_like_claim(sentence: str) -> bool:
    if len(sentence) < 16 or len(sentence) > 220:
        return False

    markers = (
        "%",
        "％",
        "年",
        "月",
        "日",
        "研究",
        "报告",
        "数据显示",
        "统计",
        "实验",
        "survey",
        "study",
        "report",
        "data",
        "according",
    )
    has_number = any(char.isdigit() for char in sentence)
    has_marker = any(marker in sentence.lower() for marker in markers)
    return has_number or has_marker


def _extract_claim_candidates(sentences: list[str]) -> list[dict[str, str]]:
    results: list[dict[str, str]] = []
    seen: set[str] = set()

    for sentence in sentences:
        normalized = sentence.strip()
        if not _looks_like_claim(normalized):
            continue
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        title = _truncate(normalized, 36)
        results.append(
            {
                "title": title,
                "statement": _truncate(normalized, 220),
                "source_excerpt": _truncate(normalized, 180),
            }
        )
        if len(results) >= _CLAIM_LIMIT:
            break

    return results


def _extract_excerpt_candidates(paragraphs: list[str]) -> list[dict[str, str]]:
    results: list[dict[str, str]] = []
    for index, paragraph in enumerate(paragraphs):
        if len(paragraph) < 24:
            continue
        results.append(
            {
                "title": f"摘录 {len(results) + 1}",
                "excerpt": _truncate(paragraph, 220),
            }
        )
        if len(results) >= _EXCERPT_LIMIT:
            break
    return results


def _fallback_preprocess(filename: str, content: str) -> dict[str, Any]:
    paragraphs = _split_paragraphs(content)
    sentences = _split_sentences(content)
    return {
        "summary": _coalesce_summary(paragraphs) or _truncate(content, _SUMMARY_MAX_CHARS),
        "terms": _extract_term_candidates(paragraphs),
        "claims": _extract_claim_candidates(sentences),
        "excerpts": _extract_excerpt_candidates(paragraphs),
        "mode": "fallback",
        "filename": filename,
    }


def _normalize_llm_output(data: dict[str, Any], filename: str, content: str) -> dict[str, Any]:
    fallback = _fallback_preprocess(filename, content)

    summary = data.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        summary = fallback["summary"]

    def _normalize_items(
        value: Any,
        *,
        required_keys: tuple[str, ...],
        limit: int,
    ) -> list[dict[str, str]]:
        if not isinstance(value, list):
            return []
        items: list[dict[str, str]] = []
        for raw in value:
            if not isinstance(raw, dict):
                continue
            normalized: dict[str, str] = {}
            valid = True
            for key in required_keys:
                item_value = raw.get(key)
                if not isinstance(item_value, str) or not item_value.strip():
                    valid = False
                    break
                normalized[key] = item_value.strip()
            if valid:
                items.append(normalized)
            if len(items) >= limit:
                break
        return items

    terms = _normalize_items(
        data.get("terms"),
        required_keys=("term", "definition", "source_excerpt"),
        limit=_TERM_LIMIT,
    ) or fallback["terms"]
    claims = _normalize_items(
        data.get("claims"),
        required_keys=("title", "statement", "source_excerpt"),
        limit=_CLAIM_LIMIT,
    ) or fallback["claims"]
    excerpts = _normalize_items(
        data.get("excerpts"),
        required_keys=("title", "excerpt"),
        limit=_EXCERPT_LIMIT,
    ) or fallback["excerpts"]

    return {
        "summary": _truncate(str(summary).strip(), _SUMMARY_MAX_CHARS),
        "terms": terms,
        "claims": claims,
        "excerpts": excerpts,
        "mode": "llm",
        "filename": filename,
    }


async def preprocess_reference_document(
    *,
    filename: str,
    content: str,
    override: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return structured reference notes for one uploaded document."""
    user_prompt = _PREPROCESS_USER_TEMPLATE.format(
        filename=filename,
        content=content,
        term_limit=_TERM_LIMIT,
        claim_limit=_CLAIM_LIMIT,
        excerpt_limit=_EXCERPT_LIMIT,
    )

    try:
        raw = await invoke_text_model(
            [
                SystemMessage(content=_PREPROCESS_SYSTEM_PROMPT),
                HumanMessage(content=user_prompt),
            ],
            override=override,
        )
        cleaned = _strip_code_fences(normalize_model_text(raw))
        fragment = _extract_json_fragment(cleaned)
        candidate = fragment or cleaned
        data = json.loads(candidate)
        if not isinstance(data, dict):
            raise ValueError("Preprocessor response is not a JSON object.")
        return _normalize_llm_output(data, filename, content)
    except Exception as exc:
        logger.info("Reference preprocessing fell back to heuristic mode: %s", exc)
        return _fallback_preprocess(filename, content)


def build_reference_entries(processed: dict[str, Any]) -> list[PreprocessedReferenceEntry]:
    """Convert a processed document payload into structured reference entries."""
    entries: list[PreprocessedReferenceEntry] = []
    source_order = 0

    summary = str(processed.get("summary", "") or "").strip()
    if summary:
        entries.append(
            PreprocessedReferenceEntry(
                entry_type="reference_summary",
                title="文档总览",
                content=summary,
                payload={
                    "processor_mode": processed.get("mode", "fallback"),
                    "document_name": processed.get("filename", ""),
                },
                importance=100,
                source_section="summary",
                source_order=source_order,
            )
        )
        source_order += 1

    for item in processed.get("terms", []) or []:
        if not isinstance(item, dict):
            continue
        term = str(item.get("term", "") or "").strip()
        definition = str(item.get("definition", "") or "").strip()
        source_excerpt = str(item.get("source_excerpt", "") or "").strip()
        if not term or not definition:
            continue
        entries.append(
            PreprocessedReferenceEntry(
                entry_type="reference_term",
                title=term,
                content=definition,
                payload={
                    "source_excerpt": _truncate(source_excerpt or definition, 180),
                    "document_name": processed.get("filename", ""),
                },
                importance=80,
                source_section="terms",
                source_order=source_order,
            )
        )
        source_order += 1

    for item in processed.get("claims", []) or []:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "") or "").strip()
        statement = str(item.get("statement", "") or "").strip()
        source_excerpt = str(item.get("source_excerpt", "") or "").strip()
        if not statement:
            continue
        entries.append(
            PreprocessedReferenceEntry(
                entry_type="reference_claim",
                title=title or "关键声明",
                content=statement,
                payload={
                    "source_excerpt": _truncate(source_excerpt or statement, 180),
                    "document_name": processed.get("filename", ""),
                    "validation_status": "unverified",
                },
                importance=70,
                source_section="claims",
                source_order=source_order,
            )
        )
        source_order += 1

    for item in processed.get("excerpts", []) or []:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "") or "").strip()
        excerpt = str(item.get("excerpt", "") or "").strip()
        if not excerpt:
            continue
        entries.append(
            PreprocessedReferenceEntry(
                entry_type="reference_excerpt",
                title=title or "关键摘录",
                content=excerpt,
                payload={
                    "document_name": processed.get("filename", ""),
                },
                importance=50,
                source_section="excerpts",
                source_order=source_order,
            )
        )
        source_order += 1

    return entries
