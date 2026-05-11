from __future__ import annotations

import importlib
import sys


def test_openai_transport_compat_module_aliases_canonical_module():
    openai_transport = importlib.import_module("app.agents.openai_transport")
    transport = importlib.import_module("app.llm.transport")

    assert openai_transport is transport


def test_export_service_compat_module_aliases_canonical_package():
    export_service = importlib.import_module("app.services.export_service")
    export_package = importlib.import_module("app.services.export")

    assert export_service is export_package


def test_legacy_skill_modules_alias_canonical_tool_modules():
    legacy_tool_metadata = importlib.import_module("app.agents.skills.metadata")
    legacy_search_formatter = importlib.import_module("app.agents.skills.search_formatter")
    legacy_search_query_planner = importlib.import_module("app.agents.skills.search_query_planner")
    legacy_search_result_filter = importlib.import_module("app.agents.skills.search_result_filter")
    legacy_search_tool = importlib.import_module("app.agents.skills.search_tool")
    tool_metadata = importlib.import_module("app.tools.metadata")
    search_formatter = importlib.import_module("app.tools.search_formatter")
    search_query_planner = importlib.import_module("app.tools.search_query_planner")
    search_result_filter = importlib.import_module("app.tools.search_result_filter")
    search_tool = importlib.import_module("app.tools.search_tool")

    assert legacy_tool_metadata is tool_metadata
    assert legacy_search_formatter is search_formatter
    assert legacy_search_query_planner is search_query_planner
    assert legacy_search_result_filter is search_result_filter
    assert legacy_search_tool is search_tool


def test_legacy_skill_package_exposes_legacy_package_level_exports():
    skills = importlib.import_module("app.agents.skills")
    tools = importlib.import_module("app.tools")

    assert skills.web_search is tools.web_search
    assert skills.get_all_skills is tools.get_all_skills


def test_legacy_skill_package_supports_package_style_submodule_attribute_access():
    skills = importlib.import_module("app.agents.skills")
    canonical_metadata = importlib.import_module("app.tools.metadata")
    canonical_search_tool = importlib.import_module("app.tools.search_tool")

    sys.modules.pop("app.agents.skills.metadata", None)
    sys.modules.pop("app.agents.skills.search_tool", None)
    skills.__dict__.pop("metadata", None)
    skills.__dict__.pop("search_tool", None)

    assert skills.metadata is canonical_metadata
    assert skills.search_tool is canonical_search_tool
    assert skills.search_tool.web_search is skills.web_search


def test_legacy_skill_package_dir_lists_supported_compatibility_members():
    skills = importlib.import_module("app.agents.skills")

    visible_names = dir(skills)

    assert "get_all_skills" in visible_names
    assert "web_search" in visible_names
    assert "metadata" in visible_names
    assert "search_tool" in visible_names
