# Architectural Decision Record: Cache Optimization

## 1. Context and Problem Statement
Prompt caching is the single most impactful economic lever in modern agentic workflows. It allows model servers to reuse precomputed hidden states (KV tensors) for identical prompt prefixes. However, caching is extremely fragile: **a single character change at the start of a prompt invalidates the entire downstream cache**. 

Current agents often fail to hit the cache due to:
*   **Dynamic Headers:** Ephemeral CLI processes often inject versioning strings (e.g., `cc_version=...`) at the very top of the prompt.
*   **Unstable Ordering:** Non-deterministic tool definitions or message history re-ordering.
*   **Volatile Context:** Mixing static instructions with dynamic timestamps or session-specific metadata in the prefix.

## 2. Decision: Static-to-Dynamic Prefix Architecture
For **Petrichor**, we have decided to implement a **Strict Prefix Layering** system. Prompts must be constructed in a deterministic order, from most static to most dynamic, to maximize prefix matching.

### 2.1 Layered Prompt Structure
Petrichor enforces the following prompt hierarchy:
1.  **System Core (Immutable):** Base persona and global instructions.
2.  **Tool Definitions (Semi-Static):** Only modified when skills are added/removed.
3.  **Repo Map (Structural):** The skeletonized codebase structure.
4.  **Session Guide (Stateful Anchor):** The structured narrative retrieved from SQLite.
5.  **Active History (Dynamic):** Recent conversation turns and tool results.

### 2.2 Provider-Specific Optimization
We implement specialized logic for the two primary caching models:
*   **Anthropic (Explicit):** We use `cache_control` breakpoints. We place the primary breakpoint at the end of the **Repo Map** to ensure 80-90% of the context is cached for the duration of the session. We use a second breakpoint at the end of the **Session Guide** to move the cache forward in multi-turn loops.
*   **OpenAI (Implicit):** We ensure the prefix exceeds the **1024-token threshold** required for automatic caching. We use the optional `prompt_cache_key` to group related requests and increase hit probability.

## 3. Implementation Patterns

### 3.1 Session Resuming over Spawning
To avoid the "Process-per-turn" cache invalidation bug:
*   Petrichor utilizes **Persistent Session Architecture**. We use the `--resume <session_id>` pattern to load conversation history from local stores rather than re-sending the full payload via `stdin` every turn.
*   This ensures the model server sees an identical prefix (History Turns 1 to N-1) when processing the current turn N.

### 3.2 Normalization Engine
To prevent "Ghost Misses," the engine performs:
*   **Whitespace Normalization:** Stripping redundant newlines and trailing spaces.
*   **Deterministic Serialization:** Sorting tool definitions and JSON keys alphabetically before injection.
*   **Time-Anchoring:** Moving dynamic elements like timestamps or "Today's Date" to the bottom of the system prompt, after the cache breakpoint.

### 3.3 Cache Pre-warming
For latency-sensitive tasks, Petrichor supports **Cache Pre-warming**:
*   On startup, Petrichor sends a `max_tokens: 0` request containing the System Prompt and Repo Map.
*   This "warms" the provider-side cache so the first real user interaction experiences zero-latency pre-filling.

## 4. Consequences
*   **Cost Efficiency:** Cache hits on Anthropic and DeepSeek cost roughly **10% of standard input prices**.
*   **Latency Reduction:** Caching reduces "Time to First Token" (TTFT) by **40-80%** on prefix-heavy prompts.
*   **The "Moat" Effect:** High hit rates enable more intensive agentic loops (1,500+ calls/month) while maintaining a stable user cost (~$100/mo).
*   **Requirement:** Users must utilize providers that support prompt caching (Anthropic, OpenAI, DeepSeek, or self-hosted vLLM/SGLang) to see these benefits.

***

*For details on the persistent data that anchors these caches, see **[Session & Memory Management](session-management.md)***.