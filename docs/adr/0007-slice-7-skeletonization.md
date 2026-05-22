# Slice 7 uses TypeScript compiler API text-range replacement for skeletonization

Slice 7 adds a `skeleton` field to each `CapsuleNeighbor` by stripping function, method, constructor, and accessor bodies from the neighbor file's source, replacing each body block with `{}`. We chose the TypeScript compiler API (already used for indexing) over Tree-sitter (named in `docs/architecture/token-reduction.md`) because it adds no new dependency, produces the same AST we already parse, and text-range replacement preserves original whitespace and comments in signatures — improving readability for the Coding Agent.

## Considered options

- **Tree-sitter**: would be language-agnostic and could support future JavaScript indexing, but would add a new native dependency and a second parse pass for every neighbor file read.
- **AST printer (`ts.createPrinter` with transformer)**: would be semantically clean but loses original formatting outside of bodies, making signatures harder to read.

## Consequences

The Skeleton is deterministic for a given source file: the same input always yields the same output. Skeletonization runs at query time (not stored in the Repository Index), so no schema migration is needed. The Pivot File remains full raw source — only Neighbor Files are skeletonized.
