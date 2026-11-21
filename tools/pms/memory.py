#!/usr/bin/env python3
"""Offline utilities for the Project Memory System."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PROJECT = ROOT / "pms" / "projects" / "lookaway"
PROJECTS_ROOT = ROOT / "pms" / "projects"
SCHEMAS_ROOT = ROOT / "pms" / "framework" / "schemas"
HANDOFF_HEADINGS = (
    "# Session handoff",
    "## Completed work",
    "## Files and worktree",
    "## Verification",
    "## Unresolved problems",
    "## Next actions",
    "## Relevant documents",
)
REQUIRED_FRAMEWORK_FILES = (
    "README.md",
    "SPECIFICATION.md",
    "MEMORY_MODEL.md",
    "SOURCE_OF_TRUTH.md",
    "protocols/AGENT_ONBOARDING.md",
    "protocols/AGENT_EXECUTION.md",
    "protocols/AGENT_HANDOFF.md",
    "protocols/MEMORY_UPDATE.md",
    "protocols/HUMAN_APPROVAL.md",
    "schemas/task.schema.json",
    "schemas/decision.schema.json",
    "schemas/activity.schema.json",
    "schemas/handoff.schema.json",
    "templates/PROJECT_CONTEXT.md",
    "templates/PROJECT_STATE.md",
    "templates/CURRENT_FOCUS.md",
    "templates/ADR_TEMPLATE.md",
    "templates/TASK_TEMPLATE.md",
    "templates/HANDOFF_TEMPLATE.md",
    "templates/SESSION_LOG_TEMPLATE.md",
)
REQUIRED_PROJECT_FILES = (
    "README.md",
    "PROJECT_CONTEXT.md",
    "PROJECT_STATE.md",
    "CURRENT_FOCUS.md",
    "ONBOARDING_VALIDATION.md",
    "architecture/SYSTEM_OVERVIEW.md",
    "architecture/FLUTTER_ARCHITECTURE.md",
    "architecture/ANDROID_ARCHITECTURE.md",
    "architecture/DATA_ARCHITECTURE.md",
    "requirements/PRODUCT_REQUIREMENTS.md",
    "requirements/FUNCTIONAL_REQUIREMENTS.md",
    "requirements/NON_FUNCTIONAL_REQUIREMENTS.md",
    "roadmap/MASTER_ROADMAP.md",
    "learning/LEARNING_ROADMAP.md",
    "learning/CONCEPTS_LEARNED.md",
    "learning/PMS_V1_LEARNING_NOTES.md",
    "decisions/README.md",
    "decisions/INDEX.json",
    "tasks/README.md",
    "tasks/INDEX.json",
    "logs/activity.jsonl",
    "logs/agent_sessions.jsonl",
    "handoffs/LATEST_HANDOFF.md",
)
REQUIRED_PROJECT_DIRS = (
    "architecture",
    "decisions",
    "requirements",
    "roadmap",
    "tasks",
    "logs",
    "handoffs",
    "handoffs/archive",
    "learning",
)


@dataclass
class ValidationReport:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


def _is_type(value: Any, expected: str) -> bool:
    if expected == "object":
        return isinstance(value, dict)
    if expected == "array":
        return isinstance(value, list)
    if expected == "string":
        return isinstance(value, str)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "null":
        return value is None
    return False


def _validate_schema(
    value: Any,
    schema: dict[str, Any],
    path: str,
    errors: list[str],
) -> None:
    expected = schema.get("type")
    if expected is not None:
        accepted = expected if isinstance(expected, list) else [expected]
        if not any(_is_type(value, item) for item in accepted):
            errors.append(f"{path}: expected {' or '.join(accepted)}")
            return

    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path}: unsupported value {value!r}")

    if isinstance(value, str):
        if len(value) < schema.get("minLength", 0):
            errors.append(f"{path}: must not be empty")
        pattern = schema.get("pattern")
        if pattern and re.fullmatch(pattern, value) is None:
            errors.append(f"{path}: does not match required format")
        format_name = schema.get("format")
        if format_name == "date":
            try:
                date.fromisoformat(value)
            except ValueError:
                errors.append(f"{path}: expected YYYY-MM-DD date")
        elif format_name == "date-time":
            try:
                parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
                if parsed.tzinfo is None or parsed.utcoffset() != timedelta(0):
                    errors.append(f"{path}: timestamp must be ISO 8601 UTC")
            except ValueError:
                errors.append(f"{path}: expected ISO 8601 UTC timestamp")

    if isinstance(value, list):
        item_schema = schema.get("items")
        if item_schema:
            for index, item in enumerate(value):
                _validate_schema(item, item_schema, f"{path}[{index}]", errors)

    if isinstance(value, dict):
        for key in schema.get("required", []):
            if key not in value:
                errors.append(f"{path}: missing required field {key!r}")
        properties = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            for key in value:
                if key not in properties:
                    errors.append(f"{path}: unexpected field {key!r}")
        for key, child_schema in properties.items():
            if key in value:
                _validate_schema(value[key], child_schema, f"{path}.{key}", errors)


def validate_record(
    record: Any,
    schema: dict[str, Any],
    path: str = "record",
) -> list[str]:
    """Validate the JSON Schema subset used by the checked-in PMS schemas."""
    errors: list[str] = []
    _validate_schema(record, schema, path, errors)
    return errors


def _is_confined(path: Path, boundary: Path) -> bool:
    try:
        repository = ROOT.resolve()
        resolved_boundary = boundary.resolve()
        return (
            not boundary.is_symlink()
            and resolved_boundary.is_relative_to(repository)
            and not path.is_symlink()
            and path.resolve().is_relative_to(resolved_boundary)
        )
    except OSError:
        return False


def _read_json(
    path: Path,
    report: ValidationReport,
    boundary: Path | None = None,
) -> Any | None:
    if boundary and not _is_confined(path, boundary):
        report.errors.append(f"{path}: refusing symlink or path outside {boundary}")
        return None
    try:
        record = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        report.errors.append(f"{path}: invalid or unreadable JSON: {error}")
        return None
    if record is None:
        report.errors.append(f"{path}: JSON record root must not be null")
    return record


def _read_jsonl(
    path: Path,
    boundary: Path | None = None,
) -> tuple[list[dict[str, Any]], list[str]]:
    records: list[dict[str, Any]] = []
    errors: list[str] = []
    if boundary and not _is_confined(path, boundary):
        return records, [f"{path}: refusing symlink or path outside {boundary}"]
    try:
        with path.open(encoding="utf-8") as stream:
            for line_number, line in enumerate(stream, start=1):
                if not line.strip():
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError as error:
                    errors.append(f"{path}:{line_number}: malformed JSONL: {error}")
                    continue
                if not isinstance(record, dict):
                    errors.append(f"{path}:{line_number}: event must be a JSON object")
                    continue
                records.append(record)
    except (OSError, UnicodeError) as error:
        errors.append(f"{path}: unreadable JSONL: {error}")
    return records, errors


def _schema_for(name: str, report: ValidationReport) -> dict[str, Any] | None:
    path = SCHEMAS_ROOT / f"{name}.schema.json"
    schema = _read_json(path, report, SCHEMAS_ROOT)
    if schema is None:
        return None
    if not isinstance(schema, dict):
        report.errors.append(f"{path}: schema root must be an object")
        return None
    return schema


def _check_file_and_dir_structure(project: Path, report: ValidationReport) -> None:
    framework = ROOT / "pms" / "framework"
    for relative in REQUIRED_FRAMEWORK_FILES:
        path = framework / relative
        if not path.is_file():
            report.errors.append(f"required framework file missing: {path}")
        elif not _is_confined(path, framework):
            report.errors.append(f"framework file is a symlink or outside the framework: {path}")
        elif path.stat().st_size == 0:
            report.errors.append(f"required framework file is empty: {path}")
    for relative in REQUIRED_PROJECT_FILES:
        path = project / relative
        if not path.is_file():
            report.errors.append(f"required project file missing: {path}")
        elif not _is_confined(path, project):
            report.errors.append(f"project file is a symlink or outside the project: {path}")
    for relative in REQUIRED_PROJECT_DIRS:
        path = project / relative
        if not path.is_dir():
            report.errors.append(f"required project directory missing: {path}")
        elif path.is_symlink() or not path.resolve().is_relative_to(project):
            report.errors.append(f"project directory is a symlink or outside the project: {path}")

    for path in framework.rglob("*"):
        if path.is_file() and path.suffix.lower() in {".md", ".json"}:
            if not _is_confined(path, framework):
                report.errors.append(f"{path}: refusing symlink or path outside the framework")
                continue
            try:
                content = path.read_text(encoding="utf-8").lower()
            except (OSError, UnicodeError) as error:
                report.errors.append(f"{path}: cannot read framework file: {error}")
                continue
            if "lookaway" in content:
                report.errors.append(f"{path}: reusable framework contains project-specific Lookaway text")


def _validate_index(
    path: Path,
    key: str,
    expected: dict[str, tuple[str, str]],
    report: ValidationReport,
    boundary: Path,
) -> None:
    index = _read_json(path, report, boundary)
    if index is None:
        return
    if not isinstance(index, dict) or not isinstance(index.get(key), list):
        report.errors.append(f"{path}: expected an object containing a {key!r} array")
        return
    observed: dict[str, tuple[str, str]] = {}
    for number, item in enumerate(index[key]):
        if not isinstance(item, dict):
            report.errors.append(f"{path}:{key}[{number}]: expected object")
            continue
        record_id = item.get("task_id") or item.get("decision_id")
        status = item.get("status")
        filename = item.get("file")
        if not all(isinstance(part, str) for part in (record_id, status, filename)):
            report.errors.append(f"{path}:{key}[{number}]: id, status, and file must be strings")
            continue
        if record_id in observed:
            report.errors.append(f"{path}: duplicate index ID {record_id}")
        observed[record_id] = (status, filename)
    if observed != expected:
        report.errors.append(
            f"{path}: index does not match records "
            f"(index IDs={sorted(observed)}, record IDs={sorted(expected)})"
        )
    if key == "tasks":
        groups = {
            "active_task_ids": sorted(
                task_id for task_id, record in expected.items() if record[0] in {"In progress", "Implemented"}
            ),
            "blocked_task_ids": sorted(
                task_id for task_id, record in expected.items() if record[0] == "Blocked"
            ),
            "completed_task_ids": sorted(
                task_id
                for task_id, record in expected.items()
                if record[0] in {"Tested", "Device verified", "Released"}
            ),
        }
        for field_name, expected_ids in groups.items():
            if index.get(field_name) != expected_ids:
                report.errors.append(
                    f"{path}: {field_name} does not match task statuses; expected {expected_ids}"
                )


def validate_memory(project: Path = DEFAULT_PROJECT) -> ValidationReport:
    """Validate the project memory without modifying any files."""
    report = ValidationReport()
    project = project.resolve()
    _check_file_and_dir_structure(project, report)

    task_schema = _schema_for("task", report)
    decision_schema = _schema_for("decision", report)
    activity_schema = _schema_for("activity", report)
    handoff_schema = _schema_for("handoff", report)

    tasks: dict[str, dict[str, Any]] = {}
    decisions: dict[str, dict[str, Any]] = {}
    events: dict[str, dict[str, Any]] = {}
    indexed_tasks: dict[str, tuple[str, str]] = {}
    indexed_decisions: dict[str, tuple[str, str]] = {}

    for path in sorted((project / "tasks").glob("*.json")):
        if path.name == "INDEX.json":
            continue
        record = _read_json(path, report, project)
        if record is None:
            continue
        if task_schema:
            for message in validate_record(record, task_schema, str(path)):
                report.errors.append(message)
        if not isinstance(record, dict):
            continue
        task_id = record.get("task_id")
        if not isinstance(task_id, str):
            continue
        if task_id in tasks:
            report.errors.append(f"{path}: duplicate task ID {task_id}")
        if path.name != f"{task_id}.json":
            report.errors.append(f"{path}: filename must match task ID {task_id!r}")
        tasks[task_id] = record
        indexed_tasks[task_id] = (str(record.get("status")), path.name)

    for path in sorted((project / "decisions").glob("ADR-*.json")):
        record = _read_json(path, report, project)
        if record is None:
            continue
        if decision_schema:
            for message in validate_record(record, decision_schema, str(path)):
                report.errors.append(message)
        if not isinstance(record, dict):
            continue
        decision_id = record.get("decision_id")
        if not isinstance(decision_id, str):
            continue
        if decision_id in decisions:
            report.errors.append(f"{path}: duplicate decision ID {decision_id}")
        if path.name != f"{decision_id}.json":
            report.errors.append(f"{path}: filename must match decision ID {decision_id!r}")
        decisions[decision_id] = record
        indexed_decisions[decision_id] = (str(record.get("status")), path.name)

    _validate_index(
        project / "tasks" / "INDEX.json",
        "tasks",
        indexed_tasks,
        report,
        project,
    )
    _validate_index(
        project / "decisions" / "INDEX.json",
        "decisions",
        indexed_decisions,
        report,
        project,
    )

    for task_id, record in tasks.items():
        references: list[tuple[str, Iterable[Any]]] = [
            ("dependency", record.get("dependencies", [])),
            ("parent task", [record.get("parent_task")] if record.get("parent_task") else []),
        ]
        for label, values in references:
            for reference in values:
                if reference not in tasks:
                    report.errors.append(f"{task_id}: unknown {label} reference {reference!r}")
                elif reference == task_id:
                    report.errors.append(f"{task_id}: cannot reference itself as {label}")
        for decision_id in record.get("related_decisions", []):
            if decision_id not in decisions:
                report.errors.append(f"{task_id}: unknown decision reference {decision_id!r}")

    for decision_id, record in decisions.items():
        if record.get("status") == "Accepted" and record.get("decision_origin") != "Human-approved":
            report.errors.append(f"{decision_id}: Accepted decisions must have Human-approved origin")
        for task_id in record.get("related_tasks", []):
            if task_id not in tasks:
                report.errors.append(f"{decision_id}: unknown task reference {task_id!r}")
        supersedes = record.get("supersedes")
        if supersedes and supersedes not in decisions:
            report.errors.append(f"{decision_id}: unknown superseded decision {supersedes!r}")

    for filename in ("activity.jsonl", "agent_sessions.jsonl"):
        path = project / "logs" / filename
        records, parse_errors = _read_jsonl(path, project)
        report.errors.extend(parse_errors)
        for number, record in enumerate(records, start=1):
            if activity_schema:
                for message in validate_record(record, activity_schema, f"{path}:{number}"):
                    report.errors.append(message)
            event_id = record.get("event_id")
            if isinstance(event_id, str):
                if event_id in events:
                    report.errors.append(f"{path}:{number}: duplicate event ID {event_id}")
                events[event_id] = record
            task_id = record.get("task_id")
            if task_id and task_id not in tasks:
                report.errors.append(f"{path}:{number}: unknown task reference {task_id!r}")
            if record.get("actor_type") == "AI agent" and record.get("reporting_source") != "agent-reported":
                report.errors.append(
                    f"{path}:{number}: AI-agent events must identify reporting_source as agent-reported"
                )
            if record.get("event_type") in {"test_passed", "test_failed"}:
                results = record.get("test_results")
                if not isinstance(results, dict) or not results.get("command") or not results.get("outcome"):
                    report.errors.append(
                        f"{path}:{number}: test event must include test_results.command and test_results.outcome"
                    )
            if record.get("verification_level") == "Device verified":
                results = record.get("test_results")
                if not isinstance(results, dict) or not results.get("device") or not results.get("context"):
                    report.errors.append(
                        f"{path}:{number}: device verification must identify device and test context"
                    )
            if filename == "agent_sessions.jsonl" and record.get("event_type") not in {
                "session_started",
                "session_completed",
            }:
                report.errors.append(
                    f"{path}:{number}: agent session event_type must be session_started or session_completed"
                )

    evidence_statuses = {"Implemented", "Tested", "Device verified", "Released"}
    for task_id, record in tasks.items():
        status = record.get("status")
        if status in evidence_statuses and not record.get("verification_evidence"):
            report.errors.append(f"{task_id}: status {status!r} requires verification evidence")
        if status == "Blocked" and not record.get("outstanding_issues"):
            report.errors.append(f"{task_id}: Blocked status requires an outstanding issue")

    for filename in ("activity.jsonl", "agent_sessions.jsonl"):
        records, _ = _read_jsonl(project / "logs" / filename, project)
        for number, record in enumerate(records, start=1):
            for reference in record.get("related_event_ids", []):
                if reference not in events:
                    report.errors.append(
                        f"{project / 'logs' / filename}:{number}: unknown event reference {reference!r}"
                    )

    handoff_records = sorted((project / "handoffs").glob("*.json"))
    if not handoff_records:
        report.warnings.append("no structured JSON handoff record exists yet")
    for path in handoff_records:
        record = _read_json(path, report, project)
        if record is None:
            continue
        if handoff_schema:
            for message in validate_record(record, handoff_schema, str(path)):
                report.errors.append(message)
        if isinstance(record, dict) and record.get("task_id") is not None:
            if record["task_id"] not in tasks:
                report.errors.append(f"{path}: unknown task reference {record['task_id']!r}")

    latest = project / "handoffs" / "LATEST_HANDOFF.md"
    if latest.is_file():
        if not _is_confined(latest, project):
            report.errors.append(f"{latest}: refusing symlink or path outside the project")
            return report
        try:
            text = latest.read_text(encoding="utf-8")
            for heading in HANDOFF_HEADINGS:
                if heading not in text:
                    report.errors.append(f"{latest}: missing required heading {heading!r}")
        except (OSError, UnicodeError) as error:
            report.errors.append(f"{latest}: cannot read handoff: {error}")

    return report


def _git(root: Path, *arguments: str) -> str | None:
    try:
        result = subprocess.run(
            ["git", "-C", str(root), *arguments],
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode != 0:
        return None
    return result.stdout.rstrip("\r\n")


def _git_status(root: Path) -> tuple[str | None, str | None, list[str]]:
    branch = _git(root, "branch", "--show-current")
    commit = _git(root, "rev-parse", "HEAD")
    status = _git(root, "status", "--porcelain=v1", "--untracked-files=all")
    changes = [line for line in (status or "").splitlines() if line.strip()]
    return branch, commit, changes


def _read_records(
    directory: Path,
    pattern: str,
    index_name: str,
    boundary: Path,
) -> tuple[list[dict[str, Any]], list[str]]:
    records: list[dict[str, Any]] = []
    errors: list[str] = []
    for path in sorted(directory.glob(pattern)):
        if path.name == index_name:
            continue
        if not _is_confined(path, boundary):
            errors.append(f"{path}: refusing symlink or path outside {boundary}")
            continue
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            errors.append(f"{path}: could not read JSON record: {error}")
            continue
        if isinstance(record, dict):
            records.append(record)
        else:
            errors.append(f"{path}: record root must be a JSON object")
    return records, errors


def _read_tasks(project: Path) -> tuple[list[dict[str, Any]], list[str]]:
    return _read_records(project / "tasks", "*.json", "INDEX.json", project)


def _read_decisions(project: Path) -> tuple[list[dict[str, Any]], list[str]]:
    return _read_records(project / "decisions", "ADR-*.json", "INDEX.json", project)


def _read_activity(project: Path) -> tuple[list[dict[str, Any]], list[str]]:
    records: list[dict[str, Any]] = []
    errors: list[str] = []
    for filename in ("activity.jsonl", "agent_sessions.jsonl"):
        found, parse_errors = _read_jsonl(project / "logs" / filename, project)
        records.extend(found)
        errors.extend(parse_errors)
    records.sort(key=lambda item: str(item.get("timestamp", "")), reverse=True)
    return records, errors


def _focus_value(project: Path, label: str) -> str | None:
    path = project / "CURRENT_FOCUS.md"
    if not _is_confined(path, project):
        return None
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return None
    match = re.search(rf"^\s*-\s*\*\*{re.escape(label)}:\*\*\s*(.*?)\s*$", text, re.MULTILINE)
    return match.group(1).strip() if match else None


def _format_or_unknown(value: str | None) -> str:
    return value if value and value not in {"None", "none", "Unknown", "[not recorded]"} else "Not recorded"


def command_status(project: Path, root: Path = ROOT) -> int:
    branch, _commit, _changes = _git_status(root)
    focus = _focus_value(project, "Active milestone")
    active_task = _focus_value(project, "Active task")
    priority = _focus_value(project, "Priority")
    tasks, task_errors = _read_tasks(project)
    blocked = [task for task in tasks if task.get("status") == "Blocked"]
    decisions, decision_errors = _read_decisions(project)
    proposals = [decision for decision in decisions if decision.get("status") == "Proposed"]
    events, history_errors = _read_activity(project)
    handoff_stamp: str | None = None
    latest_handoff = project / "handoffs" / "LATEST_HANDOFF.md"
    try:
        if not _is_confined(latest_handoff, project):
            raise OSError(f"refusing symlink or path outside {project}")
        handoff = latest_handoff.read_text(encoding="utf-8")
        match = re.search(r"^\s*-\s*\*\*Generated:\*\*\s*(.*?)\s*$", handoff, re.MULTILINE)
        handoff_stamp = match.group(1).split(" (", 1)[0] if match else None
    except (OSError, UnicodeError):
        pass

    print(f"Project: {project.name.replace('-', ' ').title()}")
    print(f"Priority: {_format_or_unknown(priority)}")
    print(f"Current milestone: {_format_or_unknown(focus)}")
    print(f"Active task: {_format_or_unknown(active_task)}")
    print(f"Current branch: {_format_or_unknown(branch)}")
    print(f"Open blockers: {', '.join(task.get('task_id', 'unknown') for task in blocked) or 'None recorded'}")
    pending_approvals = [
        decision.get("decision_id", "unknown") for decision in proposals
    ] + [event.get("event_id", "unknown") for event in _pending_approval_events(project)]
    print("Outstanding approvals: " + (", ".join(pending_approvals) or "None recorded"))
    print(f"Latest handoff timestamp: {_format_or_unknown(handoff_stamp)}")
    print("Recent project activity:")
    if events:
        for event in events[:5]:
            print(
                f"- {event.get('timestamp', 'time unknown')} "
                f"[{event.get('event_type', 'event')}] {event.get('summary', 'No summary')}"
            )
    else:
        print("- No activity recorded")
    for error in task_errors + decision_errors + history_errors:
        print(f"ERROR: {error}", file=sys.stderr)
    return 1 if task_errors or decision_errors or history_errors else 0


def _pending_approval_events(project: Path) -> list[dict[str, Any]]:
    events, _errors = _read_activity(project)
    received_references = {
        reference
        for event in events
        if event.get("event_type") == "approval_received"
        for reference in event.get("related_event_ids", [])
    }
    received_references.update(
        event["approval_reference"]
        for event in events
        if event.get("event_type") == "approval_received"
        and isinstance(event.get("approval_reference"), str)
    )
    return [
        event
        for event in events
        if event.get("event_type") == "approval_requested"
        and event.get("event_id") not in received_references
        and event.get("approval_reference") not in received_references
    ]


def _task_for_focus(project: Path) -> tuple[dict[str, Any] | None, list[str]]:
    tasks, errors = _read_tasks(project)
    focus = _focus_value(project, "Active task")
    if not focus:
        return None, errors
    match = re.match(r"([A-Z][A-Z0-9]+-[0-9]+)", focus)
    if not match:
        return None, errors
    return next((task for task in tasks if task.get("task_id") == match.group(1)), None), errors


def build_handoff(
    project: Path,
    root: Path = ROOT,
    task_id_override: str | None = None,
) -> dict[str, Any]:
    branch, commit, git_changes = _git_status(root)
    if task_id_override:
        tasks, task_errors = _read_tasks(project)
        task = next((item for item in tasks if item.get("task_id") == task_id_override), None)
        if task is None:
            raise ValueError(f"unknown handoff task ID: {task_id_override}")
    else:
        task, task_errors = _task_for_focus(project)
    events, activity_errors = _read_activity(project)
    decisions, decision_errors = _read_decisions(project)
    task_id = task.get("task_id") if task else None
    task_events = [event for event in events if event.get("task_id") == task_id]

    completed = [
        event.get("summary", "")
        for event in task_events
        if event.get("event_type") in {"implementation_completed", "documentation_updated"}
        and event.get("summary")
    ]
    tests: list[dict[str, Any]] = []
    for event in task_events:
        if event.get("event_type") not in {"test_passed", "test_failed"}:
            continue
        result = event.get("test_results")
        tests.append(
            {
                "command": result.get("command", "Not recorded") if isinstance(result, dict) else "Not recorded",
                "outcome": event.get("event_type"),
                "summary": event.get("summary", ""),
                "source": event.get("reporting_source", "Not recorded"),
            }
        )

    approvals = [
        f"{decision.get('decision_id')}: {decision.get('title')} (Proposed)"
        for decision in decisions
        if decision.get("status") == "Proposed"
    ]
    approvals.extend(
        f"{event.get('event_id')}: {event.get('summary', 'Approval requested')}"
        for event in _pending_approval_events(project)
    )
    problems = list(task.get("outstanding_issues", [])) if task else []
    next_action = _focus_value(project, "Next action")
    next_actions = [next_action] if next_action else ["Inspect current project records and identify the next authorized task."]
    relevant = [
        "AGENTS.md",
        "pms/README.md",
        "pms/framework/protocols/AGENT_ONBOARDING.md",
        (project.relative_to(ROOT) / "PROJECT_CONTEXT.md").as_posix(),
        (project.relative_to(ROOT) / "PROJECT_STATE.md").as_posix(),
        (project.relative_to(ROOT) / "CURRENT_FOCUS.md").as_posix(),
        (project.relative_to(ROOT) / "handoffs" / "LATEST_HANDOFF.md").as_posix(),
    ]
    if task_id:
        relevant.append((project.relative_to(ROOT) / "tasks" / f"{task_id}.json").as_posix())
    return {
        "project": project.name.replace("-", " ").title(),
        "task_id": task_id,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "branch": branch,
        "commit": commit,
        "files_changed": [line[3:].strip() for line in git_changes if len(line) > 3],
        "uncommitted_changes": git_changes,
        "completed_work": completed,
        "tests": tests,
        "verification_status": (
            "Draft only. Generated from maintained task/activity records and current Git status. "
            "No new tests were run by this command; unrecorded behavior is unverified."
            + (
                " Record-read errors: " + "; ".join(task_errors + decision_errors + activity_errors)
                if task_errors or decision_errors or activity_errors
                else ""
            )
        ),
        "unresolved_problems": problems,
        "outstanding_approvals": approvals,
        "next_actions": next_actions,
        "relevant_documents": relevant,
    }


def _render_handoff_markdown(record: dict[str, Any]) -> str:
    def bullets(values: Iterable[Any]) -> str:
        items = [str(value) for value in values if str(value).strip()]
        return "\n".join(f"- {item}" for item in items) if items else "- None recorded"

    task = record.get("task_id") or "Not recorded"
    commit = record.get("commit") or "Not recorded"
    branch = record.get("branch") or "Not recorded"
    tests = []
    for result in record.get("tests", []):
        if isinstance(result, dict):
            tests.append(
                f"{result.get('command', 'Command not recorded')}: "
                f"{result.get('outcome', 'outcome unknown')} — {result.get('summary', '')} "
                f"[{result.get('source', 'source not recorded')}]"
            )
    return (
        "# Session handoff\n\n"
        f"- **Project:** {record.get('project', 'Not recorded')}\n"
        f"- **Task:** {task}\n"
        f"- **Generated:** {record.get('generated_at', 'Not recorded')}\n"
        f"- **Branch / commit:** `{branch}` / `{commit}`\n"
        f"- **Approval state:** {', '.join(record.get('outstanding_approvals', [])) or 'None recorded'}\n\n"
        "## Completed work\n\n"
        f"{bullets(record.get('completed_work', []))}\n\n"
        "## Files and worktree\n\n"
        f"### Changed files\n{bullets(record.get('files_changed', []))}\n\n"
        f"### Uncommitted changes\n{bullets(record.get('uncommitted_changes', []))}\n\n"
        "## Verification\n\n"
        f"- {record.get('verification_status', 'Verification status not recorded')}\n"
        f"{bullets(tests)}\n\n"
        "## Unresolved problems\n\n"
        f"{bullets(record.get('unresolved_problems', []))}\n\n"
        "## Next actions\n\n"
        f"{bullets(record.get('next_actions', []))}\n\n"
        "## Relevant documents\n\n"
        f"{bullets(record.get('relevant_documents', []))}\n"
    )


def _write_handoff(output: Path, content: str, project: Path) -> Path:
    project_root = project.resolve()
    handoff_path = project_root / "handoffs"
    handoff_root = handoff_path.resolve()
    if handoff_path.is_symlink() or not handoff_root.is_relative_to(project_root):
        raise ValueError(f"handoff directory escapes the project memory directory: {handoff_path}")
    destination = output if output.is_absolute() else ROOT / output
    destination = destination.resolve()
    if destination == handoff_root or not destination.is_relative_to(handoff_root):
        raise ValueError(f"handoff output must be a file inside {handoff_root}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and destination.is_dir():
        raise ValueError(f"handoff output is a directory: {destination}")

    archive = handoff_root / "archive"
    if archive.exists() and not archive.resolve().is_relative_to(handoff_root):
        raise ValueError(f"handoff archive escapes the project memory directory: {archive}")
    temporary_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            prefix=f".{destination.name}.",
            suffix=".tmp",
            dir=destination.parent,
            delete=False,
        ) as temporary:
            temporary_name = temporary.name
            temporary.write(content)
        if destination.exists():
            archive.mkdir(parents=True, exist_ok=True)
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            archived = archive / f"{stamp}_{destination.name}"
            suffix = 1
            while archived.exists():
                archived = archive / f"{stamp}_{suffix}_{destination.name}"
                suffix += 1
            destination.replace(archived)
        Path(temporary_name).replace(destination)
    except OSError:
        if temporary_name and Path(temporary_name).exists():
            Path(temporary_name).unlink()
        raise
    return destination


def command_handoff(
    project: Path,
    root: Path = ROOT,
    output: Path | None = None,
    output_format: str = "markdown",
    task_id: str | None = None,
) -> int:
    try:
        record = build_handoff(project, root, task_id)
    except ValueError as error:
        print(f"handoff: {error}", file=sys.stderr)
        return 2
    if output_format == "json":
        content = json.dumps(record, indent=2, ensure_ascii=False) + "\n"
    else:
        content = _render_handoff_markdown(record)
    if output is None:
        print(content, end="")
        return 0
    try:
        destination = _write_handoff(output, content, project)
    except (OSError, ValueError) as error:
        print(f"handoff: {error}", file=sys.stderr)
        return 2
    print(f"Wrote handoff draft: {destination.relative_to(ROOT)}")
    return 0


def command_history(project: Path, limit: int) -> int:
    if limit < 1:
        print("history: --limit must be at least 1", file=sys.stderr)
        return 2
    records, errors = _read_activity(project)
    for event in records[:limit]:
        task = f" ({event['task_id']})" if event.get("task_id") else ""
        print(
            f"{event.get('timestamp', 'time unknown')} "
            f"{event.get('event_type', 'event')}{task}: {event.get('summary', 'No summary')}"
        )
    if not records:
        print("No activity recorded.")
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)
    return 1 if errors else 0


def command_search(project: Path, query: str, limit: int) -> int:
    terms = [term.casefold() for term in query.split() if term]
    if not terms:
        print("search: provide at least one search term", file=sys.stderr)
        return 2
    if limit < 1:
        print("search: --limit must be at least 1", file=sys.stderr)
        return 2
    matches = 0
    read_errors = 0
    for path in sorted(project.rglob("*")):
        if path.is_symlink():
            print(f"search: refusing symlink {path}", file=sys.stderr)
            read_errors += 1
            continue
        if not path.is_file() or path.suffix.lower() not in {".md", ".json", ".jsonl"}:
            continue
        if not _is_confined(path, project):
            print(f"search: refusing path outside project memory {path}", file=sys.stderr)
            read_errors += 1
            continue
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except (OSError, UnicodeError) as error:
            print(f"search: cannot read {path}: {error}", file=sys.stderr)
            read_errors += 1
            continue
        for line_number, line in enumerate(lines, start=1):
            folded = line.casefold()
            if all(term in folded for term in terms):
                print(f"{path.relative_to(ROOT)}:{line_number}: {line.strip()}")
                matches += 1
                if matches >= limit:
                    return 1 if read_errors else 0
    if matches == 0:
        print("No matches.")
    return 1 if read_errors else 0


def _print_validation(report: ValidationReport) -> int:
    print(f"Validation: {'PASS' if report.ok else 'FAIL'}")
    print(f"Errors: {len(report.errors)}")
    for error in report.errors:
        print(f"ERROR: {error}")
    print(f"Warnings: {len(report.warnings)}")
    for warning in report.warnings:
        print(f"WARNING: {warning}")
    return 0 if report.ok else 1


def _resolve_project(value: str | None) -> Path:
    project = Path(value) if value else DEFAULT_PROJECT
    if not project.is_absolute():
        project = ROOT / project
    project = project.resolve()
    projects_root = PROJECTS_ROOT.resolve()
    if project == projects_root or not project.is_relative_to(projects_root):
        raise ValueError(f"project directory must be inside {projects_root}")
    return project


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Inspect and validate repository-native Project Memory System records."
    )
    parser.add_argument(
        "--project-dir",
        help="project memory directory (relative to repository root or absolute inside pms/projects)",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("status", help="show current project state and recent activity")
    subparsers.add_parser("validate", help="validate required files, schemas, indexes, and references")
    handoff = subparsers.add_parser("handoff", help="generate a non-committing handoff draft")
    handoff.add_argument("--output", type=Path, help="write within the project handoffs directory")
    handoff.add_argument("--format", choices=("markdown", "json"), default="markdown")
    handoff.add_argument("--task-id", help="task being handed off (defaults to current focus)")
    history = subparsers.add_parser("history", help="show recent activity and agent-session events")
    history.add_argument("--limit", type=int, default=10)
    search = subparsers.add_parser("search", help="search project memory text offline")
    search.add_argument("query", help="case-insensitive words; all terms must match a line")
    search.add_argument("--limit", type=int, default=50)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    arguments = parser.parse_args(argv)
    try:
        project = _resolve_project(arguments.project_dir)
    except ValueError as error:
        print(f"memory: {error}", file=sys.stderr)
        return 2

    if arguments.command == "status":
        return command_status(project)
    if arguments.command == "validate":
        return _print_validation(validate_memory(project))
    if arguments.command == "handoff":
        return command_handoff(
            project,
            output=arguments.output,
            output_format=arguments.format,
            task_id=arguments.task_id,
        )
    if arguments.command == "history":
        return command_history(project, arguments.limit)
    if arguments.command == "search":
        return command_search(project, arguments.query, arguments.limit)
    parser.error("unknown command")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
