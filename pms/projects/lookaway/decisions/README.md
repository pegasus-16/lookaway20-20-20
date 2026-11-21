# Decision records

The JSON records are the structured source of truth; each contains context,
problem, alternatives, decision, rationale, consequences, attribution, status,
and cross-references. `INDEX.json` must list every record exactly once.

Accepted initial decisions were explicitly approved by the project owner:

- ADR-0001 — Repository-native PMS
- ADR-0002 — Reusable PMS framework
- ADR-0003 — Multi-agent compatibility
- ADR-0004 — Human approval authority
- ADR-0005 — Preserve existing production application

Use the reusable [ADR template](../../../framework/templates/ADR_TEMPLATE.md)
as a guide, then create a schema-valid JSON record. Never mark an inferred
implementation fact as human-approved. See
[human approval protocol](../../../framework/protocols/HUMAN_APPROVAL.md).
