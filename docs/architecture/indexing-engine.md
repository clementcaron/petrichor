# Architectural Decision Record: Core Indexing Engine

## 1. Context and Problem Statement
AI agents traditionally rely on full-text search (ripgrep) or broad RAG (embeddings) to explore codebases, both of which lack **structural awareness**. Without understanding how functions, classes, and types relate, agents must "guess" which files are relevant, leading to excessive `read_file` calls and token waste. We need a deterministic, high-performance engine that maps the codebase's architecture locally.

## 2. Decision: Tree-sitter Based Relational Indexing
For **Petrichor**, we have decided to implement a graph-native context engine powered by **Tree-sitter** and a local **Relational Knowledge Graph**.

### 2.1 Why Tree-sitter?
*   **Deterministic Parsing:** Unlike LLM-based summarization, Tree-sitter produces a precise Abstract Syntax Tree (AST) for every file.
*   **Speed:** It can index 5,000 files in under 15 seconds.
*   **Polyglot Support:** It supports over 30 languages with a single algorithm.
*   **Symbol Extraction:** It allows us to capture definitions (classes, functions) and references (calls, imports) with zero network calls.

### 2.2 Relational Intelligence (The Graph)
The engine builds a directed graph where **nodes are symbols** and **edges represent relationships**:
*   **Imports & Exports:** Traces how data flows between modules.
*   **Call Chains:** Connects callers to callees across different files.
*   **Heritage:** Maps class inheritance and interface implementations.

### 2.3 Importance Ranking via PageRank
To handle large repositories, we implement a **Personalized PageRank** algorithm:
*   It calculates the transitive importance of each file.
*   It biases ranking toward files currently open in the agent's chat or recently edited.
*   The top-ranked symbols are selected to form the "Context Capsule" or "Repo Map".

## 3. Performance & Incremental Updates
To ensure Petrichor remains "very small and very fast," the engine utilizes:
*   **Rust Implementation:** Leverages native Rust bindings for Tree-sitter for maximum speed and memory safety.
*   **Incremental Hashing:** Uses file hashes (blake3 or SHA-256) to detect changes and re-parse only modified files in under 2 seconds.
*   **Local SQLite Storage:** Persists the graph and symbols in a local database (`.petrichor/index.db`) for instant retrieval.

## 4. Consequences
*   **Token Efficiency:** By providing the agent with a structural map, we reduce the need for exploratory file reads by **80-90%**.
*   **Zero Cloud Dependency:** All parsing and graph computations stay on the user's machine, ensuring privacy and eliminating API costs.
*   **Pre-computed Skeletons:** We pre-compute symbol signatures at index time to generate instant "Skeleton" views.

***

*For details on how this graph is used to prune tokens, see **[Token Reduction Logic](token-reduction.md)***.