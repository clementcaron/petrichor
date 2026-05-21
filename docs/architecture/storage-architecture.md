# Architectural Decision Record: Storage & Search Architecture

## 1. Context and Problem Statement
AI agents need to quickly find relevant code and remember previous session events. Traditional RAG (Retrieval-Augmented Generation) often relies on **vector databases** and **cloud embeddings**, which introduce high latency, privacy risks, and significant financial costs. For a "very small and very fast" tool, we need a local storage solution that supports both structured relational data (symbol graphs) and unstructured text search.

## 2. Decision: SQLite with FTS5 for Hybrid Local Search
For **Petrichor**, we have decided to use **SQLite** as the primary storage engine, specifically leveraging the **FTS5 (Full-Text Search 5)** extension for indexing and retrieval.

### 2.1 Full-Text Search and Ranking (BM25)
Instead of semantic vector embeddings, we implement high-performance text retrieval using the **BM25 ranking algorithm** provided by FTS5.
*   **Porter Stemming:** Applied at index time to ensure that queries for "running" match "runs" or "ran".
*   **Structural Weighting:** Headings, function signatures, and class names are weighted **5x higher** in search results to prioritize architectural definitions over implementation comments.
*   **Trigram Tokenization:** Used in parallel with BM25 to allow for "fuzzy" substring matching (e.g., matching `authenticat` to `authentication`).

### 2.2 Relational Symbol Indexing
The codebase graph (nodes for functions/classes and edges for calls/imports) is stored in standard relational tables. This allows for:
*   **Graph Traversals:** Fast recursive queries to find "callers of X" or "dependents of Y" without reading any files.
*   **Incremental Updates:** Storing file hashes (Blake3) to re-parse only changed files, keeping the index fresh in **under 2 seconds**.

### 2.3 Persistent Session Store (Memory)
To solve the "Agent Amnesia" problem after context compaction, we use SQLite to capture every meaningful session event.
*   **Action Tracking:** Records every file edit, tool call, and user decision.
*   **Session Guide:** When an agent's context is full and must be compacted, Petrichor retrieves the most relevant past events from SQLite via BM25 and injects a structured "Session Guide" so the agent can resume work seamlessly.

### 2.4 Multi-Repo Global Registry
Petrichor uses a **global registry** (located at `~/.petrichor/registry.json`) to track all indexed repositories. This enables **cross-repo context capsules**, allowing an agent to understand dependencies between a backend service and its frontend consumer in a single query.

## 3. Rationale: Why No Vector Database?
*   **Speed:** Local hybrid search (BM25 + TF-IDF) resolves in **under 500ms**, significantly faster than network-based vector RAG.
*   **Zero-Config:** SQLite is a single file embedded in the project (e.g., `.petrichor/index.db`), requiring no server setup or maintenance.
*   **Privacy:** No code fragments are ever sent to cloud embedding providers.

## 4. Consequences
*   **Sub-second Queries:** Agents get the context they need almost instantly.
*   **Low Memory Footprint:** The tool remains extremely lightweight, making it suitable for any development environment.
*   **Reliable Memory:** Session continuity is maintained even across agent restarts or terminal crashes.

***

*To see how this architecture helps prune tokens, see **[Token Reduction Logic](token-reduction.md)***.