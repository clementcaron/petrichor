# Artifact policy

Transient planning and coordination artifacts live in the OS temp directory by default.

## Temporary artifacts

- PRDs
- Draft slice breakdowns
- Handoff documents
- Triage notes
- Prototype verdict notes

## Durable artifacts

- `CONTEXT.md`
- `docs/adr/*.md`, including slice-specific binding decisions
- `docs/roadmap/slices.md` for the persistent Slice Roadmap

## Default posture

Do not create tracker-style directory trees inside the Repository by default.
Do not create `docs/slices/`; use the established Slice Roadmap and ADR structure.
Persist other artifacts only when the user explicitly requests an exact Repository path.
