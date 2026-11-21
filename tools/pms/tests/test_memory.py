from __future__ import annotations

import json
import io
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "tools" / "pms"))

import memory  # noqa: E402


def task_record(
    task_id: str = "TEST-001",
    *,
    dependencies: list[str] | None = None,
    status: str = "Planned",
) -> dict[str, Any]:
    stamp = "2026-11-21T10:00:00Z"
    return {
        "task_id": task_id,
        "title": "Test task",
        "description": "A test task record.",
        "parent_task": None,
        "milestone": "TEST-M1",
        "priority": "Medium",
        "status": status,
        "assignee": "Test",
        "created_at": stamp,
        "updated_at": stamp,
        "dependencies": dependencies or [],
        "related_decisions": [],
        "files_affected": [],
        "acceptance_criteria": ["Test criterion."],
        "test_requirements": ["Run the test."],
        "verification_evidence": [],
        "outstanding_issues": [],
    }


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


class HistoryTests(unittest.TestCase):
    def activity_event(
        self,
        event_id: str,
        timestamp: str,
        event_type: str,
        summary: str,
    ) -> dict[str, Any]:
        return {
            "event_id": event_id,
            "timestamp": timestamp,
            "actor": "Automated test",
            "actor_type": "Automated system",
            "event_type": event_type,
            "summary": summary,
        }

    def test_history_is_sorted_and_limit_is_applied_to_controlled_events(self) -> None:
        with tempfile.TemporaryDirectory(dir=memory.PROJECTS_ROOT) as temporary:
            project = Path(temporary)
            logs = project / "logs"
            logs.mkdir()
            older = self.activity_event(
                "old", "2026-11-21T10:00:00Z", "task_created", "Old task"
            )
            unrelated = self.activity_event(
                "unrelated", "2026-11-21T11:00:00Z", "handoff_created", "Unrelated handoff"
            )
            newest = self.activity_event(
                "new", "2026-11-21T12:00:00Z", "test_passed", "Controlled test passed"
            )
            (logs / "activity.jsonl").write_text(
                json.dumps(older) + "\n" + json.dumps(unrelated) + "\n",
                encoding="utf-8",
            )
            (logs / "agent_sessions.jsonl").write_text(
                json.dumps(newest) + "\n",
                encoding="utf-8",
            )

            records, errors = memory._read_activity(project)
            self.assertEqual(errors, [])
            self.assertEqual(
                [record["event_id"] for record in records],
                ["new", "unrelated", "old"],
            )

            output = io.StringIO()
            original_stdout = sys.stdout
            try:
                sys.stdout = output
                exit_code = memory.command_history(project, 2)
            finally:
                sys.stdout = original_stdout
            self.assertEqual(exit_code, 0)
            lines = output.getvalue().splitlines()
            self.assertEqual(len(lines), 2)
            self.assertIn("test_passed", lines[0])
            self.assertIn("handoff_created", lines[1])

    def test_history_limit_must_be_positive(self) -> None:
        with tempfile.TemporaryDirectory(dir=memory.PROJECTS_ROOT) as temporary:
            project = Path(temporary)
            logs = project / "logs"
            logs.mkdir()
            (logs / "activity.jsonl").write_text("", encoding="utf-8")
            (logs / "agent_sessions.jsonl").write_text("", encoding="utf-8")
            output = io.StringIO()
            original_stderr = sys.stderr
            try:
                sys.stderr = output
                exit_code = memory.command_history(project, 0)
            finally:
                sys.stderr = original_stderr
            self.assertEqual(exit_code, 2)
            self.assertIn("--limit must be at least 1", output.getvalue())

    def test_empty_history_is_reported_without_event_assumptions(self) -> None:
        with tempfile.TemporaryDirectory(dir=memory.PROJECTS_ROOT) as temporary:
            project = Path(temporary)
            logs = project / "logs"
            logs.mkdir()
            (logs / "activity.jsonl").write_text("", encoding="utf-8")
            (logs / "agent_sessions.jsonl").write_text("", encoding="utf-8")
            output = io.StringIO()
            original_stdout = sys.stdout
            try:
                sys.stdout = output
                exit_code = memory.command_history(project, 10)
            finally:
                sys.stdout = original_stdout
            self.assertEqual(exit_code, 0)
            self.assertEqual(output.getvalue().strip(), "No activity recorded.")


class SchemaTests(unittest.TestCase):
    def setUp(self) -> None:
        self.report = memory.ValidationReport()
        self.schema = memory._schema_for("task", self.report)
        self.assertIsNotNone(self.schema)

    def test_valid_task_record_passes_schema(self) -> None:
        self.assertEqual(memory.validate_record(task_record(), self.schema or {}), [])

    def test_missing_field_invalid_status_and_bad_utc_timestamp_are_reported(self) -> None:
        invalid = task_record(status="Done")
        invalid["created_at"] = "2026-11-21T10:00:00+02:00"
        del invalid["acceptance_criteria"]
        errors = memory.validate_record(invalid, self.schema or {})
        self.assertTrue(any("acceptance_criteria" in error for error in errors))
        self.assertTrue(any("unsupported value 'Done'" in error for error in errors))
        self.assertTrue(any("timestamp must be ISO 8601 UTC" in error for error in errors))

    def test_jsonl_reports_malformed_lines_and_non_object_events(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "events.jsonl"
            path.write_text('{"event_id":"ok"}\n{bad json\n[]\n', encoding="utf-8")
            records, errors = memory._read_jsonl(path)
        self.assertEqual(len(records), 1)
        self.assertTrue(any("malformed JSONL" in error for error in errors))
        self.assertTrue(any("must be a JSON object" in error for error in errors))

    def test_invalid_json_record_is_reported(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "record.json"
            path.write_text('{"unfinished":', encoding="utf-8")
            report = memory.ValidationReport()
            memory._read_json(path, report)
        self.assertTrue(any("invalid or unreadable JSON" in error for error in report.errors))

    def test_schema_rejects_unknown_fields(self) -> None:
        invalid = task_record()
        invalid["secret"] = "not allowed"
        self.assertTrue(
            any("unexpected field 'secret'" in error for error in memory.validate_record(invalid, self.schema or {}))
        )


class MemoryIntegrityTests(unittest.TestCase):
    def test_broken_task_reference_is_detected(self) -> None:
        with tempfile.TemporaryDirectory(dir=memory.PROJECTS_ROOT) as temporary:
            project = Path(temporary)
            tasks = project / "tasks"
            decisions = project / "decisions"
            logs = project / "logs"
            write_json(tasks / "TEST-001.json", task_record(dependencies=["MISSING-001"]))
            write_json(
                tasks / "INDEX.json",
                {"tasks": [{"task_id": "TEST-001", "status": "Planned", "file": "TEST-001.json"}]},
            )
            write_json(decisions / "INDEX.json", {"decisions": []})
            (logs / "activity.jsonl").parent.mkdir(parents=True, exist_ok=True)
            (logs / "activity.jsonl").write_text("", encoding="utf-8")
            (logs / "agent_sessions.jsonl").write_text("", encoding="utf-8")
            report = memory.validate_memory(project)
        self.assertTrue(any("unknown dependency reference 'MISSING-001'" in error for error in report.errors))

    def test_task_index_mismatch_is_detected(self) -> None:
        with tempfile.TemporaryDirectory(dir=memory.PROJECTS_ROOT) as temporary:
            project = Path(temporary)
            write_json(project / "tasks" / "TEST-001.json", task_record())
            write_json(
                project / "tasks" / "INDEX.json",
                {"tasks": [{"task_id": "TEST-001", "status": "Implemented", "file": "TEST-001.json"}]},
            )
            write_json(project / "decisions" / "INDEX.json", {"decisions": []})
            (project / "logs").mkdir()
            (project / "logs" / "activity.jsonl").write_text("", encoding="utf-8")
            (project / "logs" / "agent_sessions.jsonl").write_text("", encoding="utf-8")
            report = memory.validate_memory(project)
        self.assertTrue(any("tasks/INDEX.json: index does not match" in error for error in report.errors))

    def test_pending_approval_is_cleared_only_by_referenced_receipt(self) -> None:
        with tempfile.TemporaryDirectory(dir=memory.PROJECTS_ROOT) as temporary:
            project = Path(temporary)
            logs = project / "logs"
            logs.mkdir()
            requested = {
                "event_id": "approval-1",
                "timestamp": "2026-11-21T10:00:00Z",
                "actor": "Test",
                "actor_type": "Human",
                "event_type": "approval_requested",
                "summary": "Approval needed",
            }
            received = {
                "event_id": "approval-2",
                "timestamp": "2026-11-21T11:00:00Z",
                "actor": "Test",
                "actor_type": "Human",
                "event_type": "approval_received",
                "summary": "Approval granted",
                "related_event_ids": ["approval-1"],
            }
            (logs / "activity.jsonl").write_text(
                json.dumps(requested) + "\n" + json.dumps(received) + "\n", encoding="utf-8"
            )
            (logs / "agent_sessions.jsonl").write_text("", encoding="utf-8")
            self.assertEqual(memory._pending_approval_events(project), [])
            (logs / "activity.jsonl").write_text(json.dumps(requested) + "\n", encoding="utf-8")
            self.assertEqual(
                [event["event_id"] for event in memory._pending_approval_events(project)],
                ["approval-1"],
            )

    def test_duplicate_event_ids_across_logs_are_detected(self) -> None:
        with tempfile.TemporaryDirectory(dir=memory.PROJECTS_ROOT) as temporary:
            project = Path(temporary)
            logs = project / "logs"
            logs.mkdir()
            event = {
                "event_id": "same-event",
                "timestamp": "2026-11-21T10:00:00Z",
                "actor": "Test",
                "actor_type": "AI agent",
                "task_id": "TEST-001",
                "event_type": "session_started",
                "summary": "Test event",
            }
            line = json.dumps(event) + "\n"
            (logs / "activity.jsonl").write_text(line, encoding="utf-8")
            (logs / "agent_sessions.jsonl").write_text(line, encoding="utf-8")
            write_json(project / "tasks" / "TEST-001.json", task_record())
            write_json(
                project / "tasks" / "INDEX.json",
                {"tasks": [{"task_id": "TEST-001", "status": "Planned", "file": "TEST-001.json"}]},
            )
            write_json(project / "decisions" / "INDEX.json", {"decisions": []})
            report = memory.validate_memory(project)
        self.assertTrue(any("duplicate event ID same-event" in error for error in report.errors))

    def test_validation_does_not_modify_project_documents(self) -> None:
        paths = [
            memory.DEFAULT_PROJECT / "PROJECT_CONTEXT.md",
            memory.DEFAULT_PROJECT / "tasks" / "PMS-001.json",
            memory.DEFAULT_PROJECT / "logs" / "activity.jsonl",
        ]
        before = {path: (path.read_bytes(), path.stat().st_mtime_ns) for path in paths}
        memory.validate_memory()
        after = {path: (path.read_bytes(), path.stat().st_mtime_ns) for path in paths}
        self.assertEqual(before, after)

    def test_framework_contains_no_lookaway_assumptions(self) -> None:
        for path in (ROOT / "pms" / "framework").rglob("*"):
            if path.is_file() and path.suffix in {".md", ".json"}:
                self.assertNotIn("lookaway", path.read_text(encoding="utf-8").casefold(), str(path))

    def test_validation_refuses_jsonl_symlink_outside_project(self) -> None:
        with tempfile.TemporaryDirectory(dir=memory.PROJECTS_ROOT) as project_dir:
            with tempfile.TemporaryDirectory() as external_dir:
                project = Path(project_dir)
                logs = project / "logs"
                logs.mkdir()
                external = Path(external_dir) / "external.jsonl"
                external.write_text("{}\n", encoding="utf-8")
                (logs / "activity.jsonl").symlink_to(external)
                (logs / "agent_sessions.jsonl").write_text("", encoding="utf-8")
                report = memory.validate_memory(project)
        self.assertTrue(any("refusing symlink or path outside" in error for error in report.errors))


class HandoffTests(unittest.TestCase):
    def test_handoff_is_explicitly_a_draft_and_has_schema_fields(self) -> None:
        record = memory.build_handoff(memory.DEFAULT_PROJECT)
        schema = memory._schema_for("handoff", memory.ValidationReport())
        self.assertEqual(memory.validate_record(record, schema or {}), [])
        self.assertIn("Draft only", record["verification_status"])
        self.assertTrue(record["task_id"])
        self.assertIsInstance(record["files_changed"], list)

    def test_handoff_output_archives_replaced_file_and_rejects_escape(self) -> None:
        with tempfile.TemporaryDirectory(dir=memory.PROJECTS_ROOT) as temporary:
            project = Path(temporary) / "test-project"
            handoffs = project / "handoffs"
            handoffs.mkdir(parents=True)
            (handoffs / "archive").mkdir()
            latest = handoffs / "LATEST_HANDOFF.md"
            latest.write_text("older handoff\n", encoding="utf-8")
            output = memory._write_handoff(latest, "new handoff\n", project)
            self.assertEqual(output.read_text(encoding="utf-8"), "new handoff\n")
            archived = list((handoffs / "archive").glob("*_LATEST_HANDOFF.md"))
            self.assertEqual(len(archived), 1)
            self.assertEqual(archived[0].read_text(encoding="utf-8"), "older handoff\n")
            with self.assertRaises(ValueError):
                memory._write_handoff(Path("../outside.md"), "no\n", project)

    def test_markdown_handoff_contains_required_sections(self) -> None:
        rendered = memory._render_handoff_markdown(memory.build_handoff(memory.DEFAULT_PROJECT))
        for heading in memory.HANDOFF_HEADINGS:
            self.assertIn(heading, rendered)
        self.assertIn("No new tests were run", rendered)


class CLITests(unittest.TestCase):
    def run_cli(self, *arguments: str, expected: int = 0) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as working_directory:
            result = subprocess.run(
                [sys.executable, str(ROOT / "tools" / "pms" / "memory.py"), *arguments],
                cwd=working_directory,
                capture_output=True,
                text=True,
                encoding="utf-8",
                check=False,
            )
        self.assertEqual(result.returncode, expected, result.stdout + result.stderr)
        return result

    def test_all_cli_commands_work_outside_repository_cwd(self) -> None:
        self.assertIn("Current branch:", self.run_cli("status").stdout)
        self.assertIn("Validation:", self.run_cli("validate").stdout)
        self.assertIn("PMS-M1", self.run_cli("search", "PMS-M1").stdout)
        draft = self.run_cli("handoff", "--format", "json").stdout
        self.assertIn('"verification_status"', draft)
        self.assertIsNotNone(json.loads(draft)["task_id"])
        completed_task = self.run_cli("handoff", "--task-id", "PMS-001", "--format", "json").stdout
        self.assertEqual(json.loads(completed_task)["task_id"], "PMS-001")
        self.assertIn("usage:", self.run_cli("--help").stdout.lower())

    def test_history_cli_isolated_project_outside_repository_cwd(self) -> None:
        with tempfile.TemporaryDirectory(dir=memory.PROJECTS_ROOT) as temporary:
            project = Path(temporary)
            logs = project / "logs"
            logs.mkdir()
            (logs / "activity.jsonl").write_text(
                json.dumps({
                    "event_id": "isolated-old",
                    "timestamp": "2026-11-21T10:00:00Z",
                    "actor": "Automated test",
                    "actor_type": "Automated system",
                    "event_type": "task_created",
                    "summary": "Isolated old event",
                }) + "\n",
                encoding="utf-8",
            )
            (logs / "agent_sessions.jsonl").write_text(
                json.dumps({
                    "event_id": "isolated-new",
                    "timestamp": "2026-11-21T11:00:00Z",
                    "actor": "Automated test",
                    "actor_type": "Automated system",
                    "event_type": "test_passed",
                    "summary": "Isolated test event",
                }) + "\n",
                encoding="utf-8",
            )
            result = self.run_cli(
                "--project-dir",
                str(project),
                "history",
                "--limit",
                "1",
            )
            self.assertIn("Isolated test event", result.stdout)
            self.assertNotIn("Isolated old event", result.stdout)

    def test_cli_reports_invalid_arguments_and_rejects_path_escape(self) -> None:
        self.assertIn("at least 1", self.run_cli("history", "--limit", "0", expected=2).stderr)
        self.assertIn("provide at least one", self.run_cli("search", " ", expected=2).stderr)
        self.assertIn(
            "must be inside",
            self.run_cli("--project-dir", "/tmp", "status", expected=2).stderr,
        )
        self.assertIn(
            "unknown handoff task ID",
            self.run_cli("handoff", "--task-id", "MISSING-001", expected=2).stderr,
        )

    def test_handoff_cli_archives_before_replacing(self) -> None:
        with tempfile.TemporaryDirectory(dir=memory.PROJECTS_ROOT) as temporary:
            project = Path(temporary)
            handoffs = project / "handoffs"
            handoffs.mkdir()
            (handoffs / "archive").mkdir()
            latest = handoffs / "LATEST_HANDOFF.md"
            latest.write_text("previous\n", encoding="utf-8")
            result = self.run_cli(
                "--project-dir",
                str(project),
                "handoff",
                "--output",
                str(latest),
            )
            self.assertIn("Wrote handoff draft", result.stdout)
            archived = list((handoffs / "archive").glob("*_LATEST_HANDOFF.md"))
            self.assertEqual(len(archived), 1)
            self.assertEqual(archived[0].read_text(encoding="utf-8"), "previous\n")
            self.assertIn("Draft only", latest.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
