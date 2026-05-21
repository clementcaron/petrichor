# Architectural Decision Record: Agent Interface Strategy

## 1. Context and Problem Statement
Current AI coding agents (Claude Code, Cursor, Codex) need to interact with local tools to understand codebases. We must choose an interface that minimizes latency and, crucially, **token consumption**. 

The industry is currently divided between:
*   **MCP (Model Context Protocol):** A standardized JSON-RPC protocol.
*   **CLI (Command Line Interface):** Spawning subprocesses and reading `stdout`.

## 2. Decision: CLI-First for the "Inner Loop"
For **Petrichor**, we have decided to implement a **CLI-first architecture**. While MCP is excellent for "Outer Loop" tasks (shared infrastructure, cloud auth), the CLI is the superior choice for high-frequency local development.

### 2.1 The "Token Tax" of MCP
Benchmarks and production data show that MCP is often too "heavy" for context-constrained coding tasks:
*   **Schema Overhead:** Connecting to an MCP server forces the agent to load the entire tool schema (names, descriptions, parameters) into its context window.
*   **Context Waste:** In some cases, MCP tool descriptions can consume up to **72% of the available context window** before the agent even begins to reason.
*   **Token Multiplier:** MCP calls can consume **4x to 32x more tokens** than equivalent CLI calls due to JSON-RPC wrapping and repetitive schema headers.

### 2.2 The Efficiency of CLI
A CLI interface provides several critical advantages for Petrichor’s goals:
*   **Zero Overhead:** The agent spawns a subprocess, passes arguments, and reads the output. There is no schema negotiation or handshake.
*   **Native Model Familiarity:** LLMs have been trained on vast amounts of documentation for standard shell tools (git, ripgrep, find). They often know how to use a well-designed CLI without needing a runtime schema.
*   **Composability:** Agents can naturally pipe CLI output (e.g., `petrichor map | head -n 50`) to manage noise, which is harder to achieve with structured MCP JSON responses.

## 3. Implementation Pattern: Hooks & Interception
To make Petrichor invisible and fast, we leverage **lifecycle hooks** (like `PreToolUse` found in Claude Code or OpenCode):
1.  **Interception:** Petrichor can act as a **middleware**.
2.  **Pre-processing:** When an agent attempts a "heavy" read (e.g., `cat` or `grep`), a hook intercepts the call.
3.  **Skeletonization:** Petrichor processes the file locally and returns a "Context Capsule" (pivot code + skeletons) to the agent instead of the raw file.

## 4. Security and Sandboxing
Spawning CLI processes carries risks. To mitigate this, Petrichor implements a **Security Harness**:
*   **Restricted Command Set:** Only specific read/query operations are permitted through the agent interface.
*   **Output Filtering:** Raw data (logs, binary artifacts) is filtered or summarized before it reaches the model to prevent "Context Flooding".

## 5. Summary Table

| Feature | MCP Server | **Petrichor CLI** |
| :--- | :--- | :--- |
| **Initial Token Cost** | High (Schema Discovery) | **Zero** |
| **Per-Call Overhead** | 4x - 32x Tokens | **Minimal** |
| **Integration** | Standardized JSON-RPC | **Native Subprocess/Hooks** |
| **Best Use Case** | Cloud / Shared Auth | **Local "Inner Loop" Dev** |

*For details on how we parse code to support this interface, see **[Core Indexing Engine](indexing-engine.md)***.