# Petrichor

Petrichor helps a coding agent understand a local codebase with less context overhead. It exists to make code navigation and reasoning more structurally aware.

## Language

**Coding Agent**:
An agent that works through a CLI session to read, edit, and reason about code in a local repository.
_Avoid_: AI, bot, assistant, model

**Repository**:
A local codebase the Coding Agent is working in.
_Avoid_: project, workspace

**Repository Path**:
A file path relative to the Repository root used as the exact identity for file-targeted Structural Queries.
_Avoid_: absolute path, module specifier

**Repository Index**:
Petrichor's structured representation of a Repository for navigation and reasoning without opening every file.
_Avoid_: cache, vector store, embedding index

**Structural Query**:
A question about code structure answered from the Repository Index, such as where a symbol is defined or what it relates to.
_Avoid_: grep, text search

**Symbol**:
A top-level named declaration in a Repository that Petrichor can index and return in a Structural Query. In the first runnable slice, this includes top-level named declarations and exports only.
_Avoid_: token, local variable, arbitrary string

**Definition Lookup**:
A Structural Query that returns all exact matches for a Symbol name, with each match including symbol kind and location in deterministic order.
_Avoid_: fuzzy search, best guess

**ADR**:
A binding record of a real architectural decision that currently shapes the product, stored in `docs/adr/`.
_Avoid_: future idea, exploration note

**Architecture Note**:
A target-state design note stored in `docs/architecture/` that guides future work without becoming the immediate implementation contract.
_Avoid_: ADR, promise

**Slice Roadmap**:
A staged plan stored in `docs/roadmap/` that breaks Petrichor's future capabilities into working, user-facing slices.
_Avoid_: backlog dump, implementation checklist

**Import Relationship**:
A directed structural relationship where one Repository file statically links to another Repository file through `import` or `export ... from` module syntax.
_Avoid_: reference, usage, dependency

**Type-only Import Relationship**:
An Import Relationship used only for TypeScript type information and not for runtime value loading.
_Avoid_: runtime dependency, normal import

**Side-effect Import Relationship**:
An Import Relationship that executes another Repository file for its module side effects without importing named bindings.
_Avoid_: normal import, value import

**Imports Query**:
A Structural Query that returns the repo-local Import Relationships originating from one Repository file.
_Avoid_: dependency list, module scan

**Importers Query**:
A Structural Query that returns the repo-local Import Relationships pointing at one Repository file.
_Avoid_: reverse lookup, usages

**Call Relationship**:
A directed structural relationship where one indexed named function directly invokes another indexed named function inside the same Repository, with the callee resolved by TypeScript rather than guessed from text alone.
_Avoid_: usage, reference, generic dependency

**Callers Query**:
A Structural Query that returns direct Call Relationships pointing at one exact function name, aggregating across all indexed functions with that name.
_Avoid_: usages, find references

**Callees Query**:
A Structural Query that returns direct Call Relationships originating from one exact function name, aggregating across all indexed functions with that name.
_Avoid_: outgoing references, dependency scan

**Query Subject**:
An indexed declaration that exactly matches the query input and anchors the response for a Structural Query, even when no relationships are returned.
_Avoid_: guessed target, implicit match

**Context Inflation**:
The growth of irrelevant, redundant, or low-value material in the Coding Agent's working context.
_Avoid_: noise, bloat

## Flagged ambiguities

- **Core project** was ambiguous. In this repo, we resolved it to **first runnable slice**.
- Use **Structural Query** when the intent is to answer from the Repository Index rather than from raw text matching.
- Use **Definition Lookup** for the day-one query rather than the broader phrase "symbol search."
- Use **Import Relationship** for static module edges rather than the broader and more ambiguous words "reference" or "usage."
- Use **Callers Query** and **Callees Query** for direct function-call edges; in slice 3 they target exact function names, not unique symbol identities.
- In slice 3, an exact-name function query can have multiple **Query Subjects** because the same function name may exist in multiple Repository Paths.
- In slice 3, **indexed named function** means an exported or non-exported top-level named function declaration with a body and a declared name; methods, anonymous functions, function-valued variables, and overload signatures without bodies are out of scope.
- In slice 3, a **Call Relationship** exists only when TypeScript resolves the callee to an indexed repo-local function; same-text calls without that resolution do not count.
- In slice 3, call attribution follows the nearest enclosing function declaration; calls inside non-indexed nested functions do not get reassigned to an outer indexed function.
- In slice 3, constructor calls and JSX component usage are not **Call Relationships**.
- Treat `docs/adr/` as current decisions, `docs/architecture/` as target-state guidance, and `docs/roadmap/` as the ordered slice plan.

## Example dialogue

**Developer**: Can Petrichor tell the Coding Agent where `Foo` is defined without opening ten files?

**Domain Expert**: Yes. The Coding Agent asks a Definition Lookup against the Repository Index for that Repository.

**Developer**: So the Repository Index is not the Repository itself?

**Domain Expert**: Right. The Repository stays on disk; the Repository Index is Petrichor's structured view of it.

**Developer**: If two files both define `parseConfig`, can Petrichor still answer who calls it?

**Domain Expert**: Yes. A Callers Query for `parseConfig` can have multiple Query Subjects, and each Call Relationship names the exact caller and callee declarations involved.

**Developer**: So Petrichor is not guessing from raw text?

**Domain Expert**: Correct. Slice 3 only records Call Relationships when TypeScript resolves a direct repo-local function call to an indexed named function.
