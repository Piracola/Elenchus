from __future__ import annotations

import re

MAX_QUERY_CHARS = 120
MAX_PLANNED_QUERIES = 3
PROMPT_MARKERS = (
    "you are ",
    "opening statement",
    "counter-thesis",
    "this is turn",
    "turn 1 of",
    "turn 2 of",
    "debate topic",
    "## debate topic",
    "## progress",
)
FACT_HINTS = (
    "数据",
    "统计",
    "研究",
    "论文",
    "法律",
    "法规",
    "政策",
    "案例",
    "历史",
    "背景",
    "study",
    "studies",
    "statistics",
    "data",
    "law",
    "policy",
    "case",
    "report",
)
STANCE_MARKERS = (
    "利大于弊",
    "弊大于利",
    "合理",
    "不合理",
    "必要",
    "是否",
    "应该",
    "不应该",
    "应不应该",
    "该不该",
    "支持",
    "反对",
    "可行",
    "正当",
)
SUBJECT_TRAILING_MARKERS = (
    "是合理且",
    "是合理的",
    "是合理",
    "合理且",
    "合理的",
    "合理",
    "有必要",
    "必要",
)


def extract_topic_from_prompt_text(query: str) -> str | None:
    topic_patterns = [
        r'on the topic:\s*"([^"]+)"',
        r"on the topic:\s*'([^']+)'",
        r"##\s*Debate Topic\s*\n+([^\n]+)",
        r"Debate Topic\s*\n+([^\n]+)",
        r"辩题[:：]?\s*([^\n]+)",
    ]

    for pattern in topic_patterns:
        match = re.search(pattern, query, flags=re.IGNORECASE)
        if match:
            topic = match.group(1).strip()
            if topic:
                return topic
    return None


def prepare_search_text(text: str) -> str:
    normalized = re.sub(r"([A-Za-z0-9])([\u4e00-\u9fff])", r"\1 \2", text)
    normalized = re.sub(r"([\u4e00-\u9fff])([A-Za-z0-9])", r"\1 \2", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def sanitize_search_query(query: str) -> str:
    raw = (query or "").strip()
    if not raw:
        return ""

    compact = raw.replace("\r", "")
    compact_single_line = re.sub(r"\s+", " ", compact).strip()
    lowered = compact_single_line.lower()
    looks_prompt_like = (
        "\n" in compact
        or len(compact_single_line) > MAX_QUERY_CHARS
        or any(marker in lowered for marker in PROMPT_MARKERS)
    )

    if looks_prompt_like:
        topic = extract_topic_from_prompt_text(compact)
        if topic:
            return topic[:MAX_QUERY_CHARS].strip()

    cleaned = re.sub(r"https?://\S+", "", compact_single_line)
    cleaned = cleaned.strip(' "\'')
    return cleaned[:MAX_QUERY_CHARS].strip()


def looks_like_fact_query(query: str) -> bool:
    lowered = query.lower()
    if any(hint in lowered for hint in FACT_HINTS):
        return True

    if len(query.split()) >= 4 and not any(marker in query for marker in STANCE_MARKERS):
        return True

    return False


def extract_subject(topic: str) -> str:
    stripped = topic.strip().strip("。！？?!.\"' ")
    patterns = [
        r"^(.+?)是合理且利大于弊的.*$",
        r"^(.+?)是合理的.*$",
        r"^(.+?)是否应该.+$",
        r"^(.+?)应不应该.+$",
        r"^(.+?)该不该.+$",
        r"^(.+?)是不是.+$",
        r"^(.+?)是否合理.+$",
        r"^(.+?)利大于弊.*$",
        r"^(.+?)弊大于利.*$",
    ]

    for pattern in patterns:
        match = re.match(pattern, stripped)
        if match:
            subject = match.group(1).strip(" ，,。;；:：")
            for trailing in SUBJECT_TRAILING_MARKERS:
                if subject.endswith(trailing):
                    subject = subject[: -len(trailing)].rstrip(" ，,。;；:：")
            if len(subject) >= 2:
                return prepare_search_text(subject)

    if "是" in stripped:
        left, right = stripped.split("是", 1)
        if left and any(marker in right for marker in STANCE_MARKERS):
            candidate = left.strip(" ，,。;；:：")
            if len(candidate) >= 2:
                return prepare_search_text(candidate)

    return prepare_search_text(stripped)


def build_search_plan(query: str) -> list[str]:
    sanitized = sanitize_search_query(query)
    if not sanitized:
        return []

    if looks_like_fact_query(sanitized):
        return [sanitized]

    subject = extract_subject(sanitized)
    plan = [
        f"{subject} 法律 政策 依据",
        f"{subject} 作用 影响 数据 研究",
        f"{subject} 争议 风险 案例",
    ]

    deduped: list[str] = []
    for item in plan:
        compact = item[:MAX_QUERY_CHARS].strip()
        if compact and compact not in deduped:
            deduped.append(compact)

    return deduped[:MAX_PLANNED_QUERIES]
