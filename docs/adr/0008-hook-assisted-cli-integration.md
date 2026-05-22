# Slice 8: Hook-assisted CLI integration

Petrichor integrates into Coding Agent tool loops via `petrichor hooks install`, a command that auto-detects active agent platforms in the current Repository and writes platform-specific hook configurations. The goal is to intercept expensive single-file reads and substitute a Context Capsule response, reducing Context Inflation without requiring the Coding Agent to learn a new workflow.

## Platforms and hook types

Four platforms are targeted, split into two integration strategies:

- **Runtime hooks** (Claude Code via `.claude/`, OpenCode via `.opencode/`): A Hook Script at `.petrichor/hooks/<platform>.sh` is registered as a `PreToolUse` handler. When the agent attempts a file read on an indexed Repository Path, the script runs `npx --no petrichor capsule <path>`, blocks the read, and returns the capsule JSON. If petrichor is unavailable or the file is not indexed, the script exits 0 and the read proceeds normally.
- **Instruction hooks** (GitHub Copilot via `.copilot/`, Codex via `.codex/`): Natural language instructions are injected into the platform's instruction configuration file, directing the agent to prefer `petrichor capsule` over direct file reads. No runtime interception occurs; the agent follows the instructions voluntarily.

The public API surface (`petrichor hooks install`) is identical for both types; the response includes `hookType: "runtime" | "instruction"` per platform so callers can distinguish them.

## Considered options

We chose a unified installer rather than separate commands for runtime vs instruction hooks because the user-facing action ("integrate Petrichor into this agent") is the same regardless of how the platform implements it. Splitting the command would expose an implementation detail that matters less than the outcome.

We chose `npx --no petrichor` as the invocation strategy in Hook Scripts to work for both local `devDependency` installs and global installs without hardcoding a path.

## Consequences

- Platforms not detected in the current repo are skipped and listed under `skipped` in the response with `reason: "not_detected"`.
- `petrichor hooks install` merges with existing platform config and is idempotent; `--dry-run` previews changes without writing.
- Instruction hooks are softer guarantees than Runtime hooks; Coding Agents on Copilot or Codex may not always follow the injected instructions, whereas Runtime hooks enforce substitution at the platform level.
- Home-directory agent installs (global config outside the repo) are out of scope for slice 8.
