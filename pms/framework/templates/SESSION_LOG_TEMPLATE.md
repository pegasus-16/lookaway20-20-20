# Session record

Append session start/completion events to the project's `agent_sessions.jsonl`.
Do not replace previous events. Use one unique event ID per event and a UTC
timestamp.

```json
{
  "event_id": "unique-id",
  "timestamp": "YYYY-MM-DDTHH:MM:SSZ",
  "actor": "agent or human identifier",
  "actor_type": "AI agent",
  "session_id": "session identifier",
  "task_id": "PROJECT-000",
  "event_type": "session_started",
  "summary": "Concise purpose and context",
  "reporting_source": "agent-reported"
}
```
