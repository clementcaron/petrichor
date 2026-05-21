# Architectural Decision Record: Token Reduction Logic

## 1. Context and Problem Statement
Current AI coding agents face a massive "Context Tax." Cumulative token costs do not grow linearly but **quadratically**, as every piece of data injected at step $i$ is re-billed in every subsequent turn. Empirical studies show that **file-reading operations (cat, grep, head) account for 76.1% of total token consumption**. 

Furthermore, agent trajectories are often filled with:
*   **Useless Information:** Build logs, metadata, and cache files.
*   **Redundant Information:** Code repeated in both tool arguments and results (e.g., `str_replace_editor`).
*   **Expired Information:** Temporary diagnostic data that is no longer needed once a bug is localized.

## 2. Decision: Hybrid Multi-Layer Pruning
To achieve an **80-90% reduction in tokens** without sacrificing performance, Petrichor implements a tiered reduction strategy inspired by SOTA research.

### 2.1 Layer 1: Deterministic Skeletonization
Instead of sending full implementations, Petrichor uses **Tree-sitter** to generate "Repo Maps" and "Context Capsules". 
*   **Pivots:** Only files identified as critical to the current task are sent in full.
*   **Skeletons:** Adjacent files are reduced to function signatures, docstrings, and return types.
*   **Benefit:** This reduces scaffolding code volume by **70-90%** while maintaining 100% syntactic reliability.

### 2.2 Layer 2: Task-Aware Semantic Pruning
Inspired by **SWE-Pruner**, we implement a locally-hosted **0.6B parameter "Neural Skimmer"**.
*   **Goal Hints:** The agent provides a natural language intent (e.g., "Focus on MRO resolution logic").
*   **Line-Level Selection:** The skimmer scores and selects only the lines relevant to the hint.
*   **AST Preservation:** Unlike token-level compressors (like LLMLingua), this line-level approach maintains **87%+ AST correctness**, ensuring the code remains readable for the LLM.

### 2.3 Layer 3: Active Trajectory Cleaning
Following the **AgentDiet** framework, Petrichor employs a **sliding window reflection module**.
*   **Amnesia Injection:** Once a sub-task is complete, the module replaces verbose tool outputs with a concise "takeaway" or summary.
*   **Non-linear Decay:** Older history segments are compressed more aggressively, while recent context retains high fidelity.

### 2.4 Layer 4: Programmatic Tool Execution
Petrichor encourages the agent to **"Think in Code"** by providing a sandboxed execution container.
*   Instead of reading 50 logs into the context, the agent writes a script to count errors locally and returns only the summary.
*   This prevents raw data from ever entering the context window.

## 3. Implementation Patterns

| Strategy | Mechanism | Savings |
| :--- | :--- | :--- |
| **Skeletonization** | Signatures-only for non-pivot files. | 70-90% |
| **Semantic Skimming** | Goal-conditioned line selection via 0.6B model. | 23-54% |
| **Purification** | Summarizing/Deleting useless logs and trajectories. | ~30% |
| **Sandboxing** | Programmatic filtering in a secure container. | up to 98% |

## 4. Consequences
*   **Lower Latency:** Smaller contexts significantly reduce "Time to First Token" (TTFT) and inference time.
*   **Improved Reasoning:** By removing "noise," agents can focus on critical signals, often **improving success rates** despite having fewer tokens.
*   **Cache Efficiency:** Stable prefixes (Repo Maps) and session resuming maximize **Prompt Caching** (up to 90% savings).

***

*For details on how this logic aligns with provider-side caching, see **[Cache Optimization](cache-optimization.md)***.