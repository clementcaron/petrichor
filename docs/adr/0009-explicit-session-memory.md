# Slice 9: Explicit session memory

Petrichor will provide platform-neutral Session Event ingestion and deterministic Session Guide retrieval through `petrichor session record --session <id>` and `petrichor session guide --session <id>`. The caller owns the opaque session ID, preventing hidden active-session state from mixing concurrent Coding Sessions. Session state lives in `.petrichor/session.db`, separate from the Repository Index so reindexing cannot erase it.

## Event contract

`session record` reads exactly one JSON event from standard input. Slice 9 supports five event shapes:

- `intent`: a summary of the Coding Agent's current objective
- `decision`: a stable key and summary
- `task`: a stable key, summary, and `pending` or `completed` status
- `file_change`: a Repository Path and summary
- `problem`: a stable key, summary, and `open` or `resolved` status

Events are append-only and receive a monotonically increasing event ID within the Session Store. Summaries are concise caller-authored facts, not raw prompts, tool output, or source contents.

## Session Guide contract

`session guide` folds events for the requested Coding Session into structured JSON containing the latest intent, the latest decision per key, the latest task state per key grouped into pending and completed tasks, the latest file-change summary per Repository Path, and the latest problem state per key grouped into open and resolved problems. Collections use deterministic most-recent-event-first ordering with stable key or Repository Path tie-breakers.

An unknown session ID returns `no_matches`. Invalid session IDs, malformed events, unsupported event types, invalid statuses, and invalid Repository Paths return structured JSON errors with a non-zero exit code.

## Scope boundary

Slice 9 does not capture raw conversation history, infer events from tool output, maintain a hidden active session, install lifecycle hooks, search events with FTS/BM25, purify history, inject prompts, or resume provider conversations. Those are separate integration and retrieval decisions. The working product capability in this slice is an end-to-end CLI contract through which a Coding Agent records meaningful state and later retrieves a compact Session Guide after restart or context loss.
