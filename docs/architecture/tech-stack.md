# Architectural Decision Record: Technology Stack

## 1. Context and Problem Statement
To solve the "Context Wall" problem, Petrichor must be able to index thousands of files in seconds and provide near-instantaneous query results. Using cloud-based services or heavy interpreted languages for the core engine would introduce unacceptable latency and privacy concerns. We need a stack that is **local-first**, **fast**, and **memory-safe**.

## 2. Decision: The Petrichor "High-Velocity" Stack
We have selected a tiered architecture combining a high-performance core with a developer-friendly interface layer.

### 2.1 Core Engine: Rust
*   **Purpose:** Responsible for file system watching, AST parsing, graph computation (PageRank), and data persistence.
*   **Rationale:** Rust offers C-level performance with modern memory safety. It allows us to index 5,000+ files in under 15 seconds, a benchmark set by leading local context engines.
*   **Native Bindings:** Provides high-performance bindings to the Tree-sitter library for multi-language support.

### 2.2 Orchestration & Interface: TypeScript (Node.js)
*   **Purpose:** Handles the CLI entry points, lifecycle hooks (PreToolUse), and optional MCP protocol wrapping.
*   **Rationale:** Most modern AI agent SDKs (Claude Code, OpenHands, Cline) are built in TypeScript or use it for tool integration. This ensures Petrichor remains highly compatible with the existing ecosystem.

### 2.3 Parsing Layer: Tree-sitter
*   **Purpose:** Multi-language Abstract Syntax Tree (AST) parsing.
*   **Rationale:** Tree-sitter is the industry standard for fast, incremental, and deterministic symbol extraction. It eliminates the need for expensive LLM-based parsing and stays entirely on the user's machine.

### 2.4 Data Storage: SQLite with FTS5
*   **Purpose:** Persistent storage for the symbol graph, file hashes, and session events.
*   **Rationale:** SQLite is an "embedded" database that requires zero configuration. The **FTS5 extension** allows for ultra-fast full-text matching and BM25 ranking, providing "semantic-like" search quality without the overhead of vector embeddings or GPUs.

### 2.5 Hashing: Blake3
*   **Purpose:** Incremental update detection.
*   **Rationale:** Blake3 is significantly faster than SHA-256/SHA-1, allowing the engine to verify thousands of files for changes in milliseconds.

## 3. Rationale: Why No Embeddings or Cloud?
Petrichor intentionally avoids vector databases and cloud-based embedding APIs:
*   **Cost:** Cloud embeddings incur per-token costs that add up over large repositories.
*   **Speed:** Local hybrid search (FTS5 + TF-IDF) typically resolves in **under 500ms**, which is faster than most network-based RAG calls.
*   **Simplicity:** Avoiding heavy local embedding models (like Ollama or Transformers.js) keeps the installation footprint "very small".

## 4. Consequences
*   **Zero Network Calls:** The entire stack runs offline, ensuring code privacy.
*   **Resource Efficiency:** Minimal CPU and RAM usage compared to running local LLMs for indexing.
*   **Developer Experience:** Fast startup and "instant" repo-map generation.

***

*To see how this stack implements the relational graph, see **[Core Indexing Engine](indexing-engine.md)***.