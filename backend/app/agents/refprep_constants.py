"""Constants and prompt templates for reference preprocessing."""

from __future__ import annotations

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
