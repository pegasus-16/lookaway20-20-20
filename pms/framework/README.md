# Reusable PMS framework

This directory is the project-independent portion of the Project Memory
System. It contains operating rules, schemas, blank templates, and
provider-neutral protocols. It must not contain product requirements,
architecture, identifiers, or assumptions specific to the repository that
hosts it.

To reuse PMS, copy this directory and the Python utility into another
repository, then create that project's separate memory using the templates.
The host project owns its own records, evidence, and agent-instruction link.
See the top-level [`pms/README.md`](../README.md) for the setup sequence.

Schemas use a small JSON Schema subset that the standard-library utility
validates offline. Do not silently extend the validator to accept malformed or
unknown records; update schemas, tests, and documentation together.
