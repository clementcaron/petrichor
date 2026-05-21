# Architectural Decision Record: Security Harness & Output Filtering

## 1. Context and Problem Statement
Integrating AI agents with local Command Line Interfaces (CLI) introduces significant security risks. Because CLI execution typically inherits the full permissions of the host session, an agent could theoretically execute destructive commands (e.g., `rm -rf /`), leak environment secrets via `curl`, or access unauthorized local files. 

Furthermore, raw CLI output often contains "noise" (excessive logs, build artifacts) that leads to **Context Flooding**, consuming the agent's token budget without providing semantic value.

## 2. Decision: A Multi-Layered Security Harness
For **Petrichor**, we have decided to implement a dedicated **Security Harness** that acts as a gatekeeper between the AI agent and the operating system. This harness combines execution constraints with semantic output filtering.

### 2.1 Command Allowlisting & Policy Enforcement
The harness enforces a strict security policy, typically defined in `.petrichor/settings.json`, following a "Deny-by-Default" posture:
*   **Permitted Command Set:** Only specific read and query operations are allowed (e.g., `cat`, `grep`, `ls`, `git`).
*   **Hard Blocking:** Critical administrative commands (e.g., `sudo`, `chmod`, `rm`) are blocked by default.
*   **Instructional Guidance:** If an agent attempts a blocked command, the harness intercepts the call and provides a directive hint suggesting a safer alternative (e.g., "Use `petrichor search` instead of raw `grep` on the entire disk").

### 2.2 Sandboxed Execution
Each tool call managed by the harness spawns an isolated subprocess with its own process boundary:
*   **Process Isolation:** Scripts and commands cannot access each other's memory or state.
*   **Credential Isolation:** While Petrichor can inherit authorized configurations (e.g., `gh`, `aws`), it uses **Credential Redaction** to ensure that `auth_token`, `api_key`, or `password` values never enter the conversation context or session databases.

### 2.3 Network Fetch Hardening
To prevent Server-Side Request Forgery (SSRF) and data exfiltration, the harness restricts network-capable tools (e.g., `web_fetch`):
*   **Scheme Restriction:** Only `http:` and `https:` are permitted; `file://` or `data:` schemes are blocked.
*   **IP Blacklisting:** Requests to cloud metadata endpoints (e.g., AWS/GCP's `169.254.169.254`) and reserved multicast ranges are hard-blocked to prevent DNS-rebinding and infrastructure discovery.

### 2.4 Output Filtering (Anti-Flooding)
The harness serves as a semantic filter to maximize token efficiency:
*   **Size Capping:** If a command returns more than a predefined threshold (e.g., 5 KB), the harness automatically switches to **Intent-Driven Filtering**.
*   **Semantic Summarization:** Instead of returning 500 lines of passing logs, the harness replaces the output with a "takeaway" summary (e.g., "50 tests passed, 0 failures").
*   **Redaction of Binary Data:** Images, binary artifacts, and minified code are stripped out and replaced with metadata markers to prevent context corruption.

## 3. Rationale
*   **Managing Uncertainty:** Unlike the Model Context Protocol (MCP), which tries to *remove* uncertainty by using fixed schemas, the CLI-harness approach *manages* uncertainty by letting the model discover solutions while strictly bounding the "blast radius" of its actions.
*   **Cost Efficiency:** By preventing context flooding, the harness ensures that 98%+ of the context remains focused on reasoning rather than raw data ingestion.
*   **Maturity:** CLI sandboxing leverages 20+ years of proven security tooling (e.g., seccomp, AppArmor, containers) which are more battle-tested than emerging agent protocols.

## 4. Consequences
*   **Security Moat:** Users can safely run agents on proprietary codebases with the assurance that destructive actions are blocked.
*   **Token Savings:** Semantic filtering directly reduces the "Quadratic Context Tax," allowing sessions to last significantly longer.
*   **Local-First Privacy:** All security checks and redaction logic run entirely on the user's machine.

***

*For the high-level project summary, see **[CONTEXT.md](../../CONTEXT.md)***.