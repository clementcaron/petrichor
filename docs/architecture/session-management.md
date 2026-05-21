# Architectural Decision Record: Session & Memory Management

## 1. Context and Problem Statement
AI agents have limited context windows. When these windows saturate, agents perform **Context Compaction**, dropping older messages to make room for new ones. This leads to critical failures:
*   **Loss of Progress:** The agent forgets which files were already edited or what tasks are currently in flight.
*   **Redundant Work:** The agent may repeat expensive exploratory tool calls (e.g., `grep` or `find`) because the previous results were purged.
*   **Decision Erasure:** Key user corrections and architectural decisions made early in the session are lost.

## 2. Decision: Event-Driven Persistence and Rehydration
For **Petrichor**, we have decided to implement a **Local-First Session Store** using an "Action Graph" approach. Instead of relying on the LLM's raw history, we capture discrete events in a local SQLite database to enable deterministic rehydration of the agent's state.

### 2.1 Event-Driven Action Tracking
Petrichor monitors high-risk interaction points and encapsulates them into **ActionStep objects**. Through lifecycle hooks (e.g., `PostToolUse`, `UserPromptSubmit`), we capture structured events:
*   **Critical (P1):** File edits, task status, approved plans, and the last user request.
*   **High (P2):** Git operations, resolved/unresolved errors, and environment changes (cwd, venv).
*   **Normal (P3):** Latency tracking, external references (URLs), and subagent findings.

### 2.2 Storage & Retrieval via FTS5
Events are indexed into a local **SQLite FTS5** virtual table.
*   **Query-Time Retrieval:** When context is full, Petrichor does not dump the entire history back. Instead, it uses **BM25 search** to retrieve only the past events relevant to the *current* prompt.
*   **Privacy:** All session data is stored locally in `.petrichor/session.db` and is never synced to a cloud.

### 2.3 Rehydration: The "Session Guide"
When an agent restarts or compacts, Petrichor injects a structured **Session Guide** into the system prompt. This guide serves as a narrative anchor containing:
*   A checklist of completed vs. pending tasks.
*   A summary of "Key Decisions" to prevent the agent from reverting to rejected approaches.
*   A "Path to Resume" derived from the last captured intent.

## 3. Continuity Patterns: Resume & Continue
Petrichor supports two primary continuity workflows:
*   **Incremental Resuming:** Leveraging CLI flags like `--resume <session_id>` to load conversation history from local stores, enabling server-side cache hits (Prompt Caching).
*   **Session Purification:** Following the **AgentDiet** framework, Petrichor replaces verbose diagnostic steps (e.g., 50 lines of passed test logs) with a single-line "takeaway" in the history, keeping the trajectory lean.

## 4. Rationale
*   **Token Efficiency:** Rehydrating state via a 1-2 KB Session Guide is significantly cheaper than re-sending 50 KB of raw chat history.
*   **Model Agnosticism:** By managing memory locally, Petrichor makes smaller models (e.g., Qwen 3B, GPT-4o-mini) as reliable as frontier models by shielding them from context noise.
*   **Performance:** Local SQLite lookups resolve in **<1ms**, introducing zero measurable latency to the agent's loop.

## 5. Consequences
*   **Reliability:** Agents can survive terminal crashes or context "compacting" events without losing their work-in-progress.
*   **Cache Hit Rates:** By maintaining a stable prefix (the Session Guide), we maximize the effectiveness of provider-side prompt caching.
*   **Constraint:** Developers must ensure the `.petrichor/` directory is git-ignored to prevent leaking local session data to the repository.

***

*For details on how we minimize the tokens used within these sessions, see **[Token Reduction Logic](token-reduction.md)***.