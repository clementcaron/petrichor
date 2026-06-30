# Slice 10 secures Context Capsule output without becoming a command runner

Slice 10 adds a mandatory Capsule Output Filter at the `queryCapsule` seam and a Repository Containment Boundary around every Pivot File and Neighbor File read. It does not implement the general command allowlisting, subprocess sandboxing, or network controls described in the non-binding target-state security architecture: Petrichor has no general command-execution seam, and adding one would be a separate product capability rather than a surgical extension of the current Capsule Query.

The Capsule Output Filter redacts a bounded set of high-confidence credential patterns, then limits the full Pivot File source and each generated Neighbor File Skeleton independently to 8 KiB of UTF-8 output using deterministic head-and-tail truncation. Every source carries mandatory filtering metadata; policies are fixed rather than configurable; and filtering failures return structured errors instead of unfiltered source. Runtime Hooks continue to fall through when Petrichor or the Repository Index is unavailable, but block the underlying read when Petrichor reports a filtering or containment failure.

## Consequences

Credential Redaction is a documented safeguard rather than a complete secret-detection guarantee. The per-source limit does not cap the total Context Capsule or its relationship metadata, and Slice 10 does not add semantic summarization or change Search Results, Session Guides, or other command responses.
